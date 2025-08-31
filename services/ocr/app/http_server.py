#!/usr/bin/env python3
"""
HTTP OCR Service Server
Simple FastAPI-based server to replace TCP communication
"""

import logging
import time
import base64
import io
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from PIL import Image
import httpx
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="OCR Service",
    description="HTTP-based OCR service using OCR.space API",
    version="1.0.0"
)

class OCRRequest(BaseModel):
    language: str = "eng"
    region_x: Optional[int] = None
    region_y: Optional[int] = None
    region_width: Optional[int] = None
    region_height: Optional[int] = None

class OCRResponse(BaseModel):
    success: bool
    text: Optional[str] = None
    confidence: Optional[float] = None
    error_message: Optional[str] = None
    processing_time_ms: float
    image_size_bytes: int
    language_used: str
    words: Optional[list] = None  # Add words array with positioning
    lines: Optional[list] = None  # Add lines array with positioning

class OCRService:
    def __init__(self):
        self.ocr_api_key = "K81634588988957"  # Your OCR.space API key
        self.ocr_api_url = "https://api.ocr.space/parse/image"
    
    async def process_ocr_api(self, image_data: bytes, language: str = "eng") -> dict:
        """Process OCR using OCR.space API"""
        try:
            # Prepare the image for API
            image = Image.open(io.BytesIO(image_data))
            
            # Convert to RGB if necessary
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Save as JPEG for API
            img_buffer = io.BytesIO()
            image.save(img_buffer, format='JPEG', quality=95)
            img_buffer.seek(0)
            
            # Prepare API request
            files = {'image': ('image.jpg', img_buffer.getvalue(), 'image/jpeg')}
            data = {
                'apikey': self.ocr_api_key,
                'language': language,
                'OCREngine': '1',
                'isOverlayRequired': 'true',
                'detectOrientation': 'true',
                'scale': 'true'
            }
            
            logger.info(f"Making OCR API request for image of size: {len(image_data)} bytes")
            
            # Make API request
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(self.ocr_api_url, files=files, data=data)
                response.raise_for_status()
                
                result = response.json()
                
                if result.get('IsErroredOnProcessing'):
                    error_msg = result.get('ErrorMessage', 'OCR API error')
                    logger.error(f"OCR API error: {error_msg}")
                    return {
                        'success': False,
                        'error': error_msg
                    }
                
                # Extract text from results
                parsed_results = result.get('ParsedResults', [])
                if not parsed_results:
                    return {
                        'success': False,
                        'error': 'No text found in image'
                    }
                
                # Get the first parsed result
                parsed_result = parsed_results[0]
                text_overlay = parsed_result.get('TextOverlay', {})
                
                # Extract combined text
                extracted_text = parsed_result.get('ParsedText', '').strip()
                
                # Extract word-level data with positioning
                words = []
                lines = []
                total_confidence = 0.0
                word_count = 0
                
                # Process lines and words
                for line_idx, line in enumerate(text_overlay.get('Lines', [])):
                    line_words = []
                    line_text = line.get('LineText', '')
                    
                    # Process words in this line
                    for word in line.get('Words', []):
                        word_text = word.get('WordText', '')
                        word_confidence = word.get('Confidence', 0)
                        
                        # Parse word bounding box from individual coordinates
                        word_coords = self._parse_word_coordinates(word)
                        
                        word_data = {
                            'text': word_text,
                            'confidence': word_confidence,
                            'boundingBox': word_coords,
                            'lineIndex': line_idx
                        }
                        
                        words.append(word_data)
                        line_words.append(word_data)
                        total_confidence += word_confidence
                        word_count += 1
                    
                    # Create line data (calculate line bounding box from words)
                    line_coords = self._calculate_line_bounding_box(line_words)
                    line_data = {
                        'text': line_text,
                        'boundingBox': line_coords,
                        'words': line_words,
                        'lineIndex': line_idx
                    }
                    lines.append(line_data)
                
                # Calculate average confidence
                avg_confidence = total_confidence / word_count if word_count > 0 else 0.0
                
                logger.info(f"OCR processing completed successfully. Extracted {word_count} words, {len(lines)} lines")
                
                return {
                    'success': True,
                    'text': extracted_text,
                    'confidence': avg_confidence / 100.0,  # Convert to 0-1 scale
                    'language': language,
                    'words': words,
                    'lines': lines
                }
                
        except httpx.TimeoutException:
            logger.error("OCR API request timed out")
            return {
                'success': False,
                'error': 'OCR API request timed out. Try with a smaller image or check your internet connection.'
            }
        except httpx.HTTPStatusError as e:
            logger.error(f"OCR API HTTP error: {e.response.status_code}")
            if e.response.status_code == 429:
                return {
                    'success': False,
                    'error': 'OCR API rate limit exceeded. Please wait a moment and try again.'
                }
            elif e.response.status_code == 413:
                return {
                    'success': False,
                    'error': 'Image too large for OCR API. Please use a smaller image.'
                }
            else:
                return {
                    'success': False,
                    'error': f'OCR API error: {e.response.status_code}'
                }
        except Exception as e:
            logger.error(f"OCR API call failed: {str(e)}")
            return {
                'success': False,
                'error': f'OCR API call failed: {str(e)}'
            }
    
    def _parse_word_coordinates(self, word: dict) -> dict:
        """Parse word coordinates from OCR.space API response"""
        try:
            left = word.get('Left', 0)
            top = word.get('Top', 0)
            width = word.get('Width', 0)
            height = word.get('Height', 0)
            
            return {
                'x': left,
                'y': top,
                'width': width,
                'height': height,
                'x2': left + width,
                'y2': top + height
            }
        except Exception as e:
            logger.warning(f"Failed to parse word coordinates: {e}")
            return {'x': 0, 'y': 0, 'width': 0, 'height': 0, 'x2': 0, 'y2': 0}
    
    def _calculate_line_bounding_box(self, line_words: list) -> dict:
        """Calculate line bounding box from word bounding boxes"""
        try:
            if not line_words:
                return {'x': 0, 'y': 0, 'width': 0, 'height': 0, 'x2': 0, 'y2': 0}
            
            # Find min/max coordinates from all words in the line
            min_x = min(word['boundingBox']['x'] for word in line_words)
            min_y = min(word['boundingBox']['y'] for word in line_words)
            max_x2 = max(word['boundingBox']['x2'] for word in line_words)
            max_y2 = max(word['boundingBox']['y2'] for word in line_words)
            
            return {
                'x': min_x,
                'y': min_y,
                'width': max_x2 - min_x,
                'height': max_y2 - min_y,
                'x2': max_x2,
                'y2': max_y2
            }
        except Exception as e:
            logger.warning(f"Failed to calculate line bounding box: {e}")
            return {'x': 0, 'y': 0, 'width': 0, 'height': 0, 'x2': 0, 'y2': 0}

# Initialize OCR service
ocr_service = OCRService()

@app.post("/ocr/process", response_model=OCRResponse)
async def process_ocr(
    image: UploadFile = File(...),
    language: str = Form("eng"),
    region_x: Optional[int] = Form(None),
    region_y: Optional[int] = Form(None),
    region_width: Optional[int] = Form(None),
    region_height: Optional[int] = Form(None)
):
    """Process OCR on uploaded image"""
    start_time = time.time()
    
    try:
        # Validate file
        if not image:
            raise HTTPException(status_code=400, detail="No image file provided")
        
        # Read image data
        image_data = await image.read()
        
        # Validate image size (1MB limit)
        if len(image_data) > 1024 * 1024:
            raise HTTPException(
                status_code=413, 
                detail=f"Image too large: {len(image_data)} bytes (max: 1MB)"
            )
        
        logger.info(f"Processing OCR for image: {len(image_data)} bytes, language: {language}")
        
        # Process OCR
        ocr_result = await ocr_service.process_ocr_api(image_data, language)
        
        processing_time_ms = (time.time() - start_time) * 1000
        
        if ocr_result.get('success'):
            return OCRResponse(
                success=True,
                text=ocr_result.get('text', ''),
                confidence=ocr_result.get('confidence', 0.0),
                processing_time_ms=processing_time_ms,
                image_size_bytes=len(image_data),
                language_used=ocr_result.get('language', 'eng'),
                words=ocr_result.get('words', []),
                lines=ocr_result.get('lines', [])
            )
        else:
            return OCRResponse(
                success=False,
                error_message=ocr_result.get('error', 'OCR processing failed'),
                processing_time_ms=processing_time_ms,
                image_size_bytes=len(image_data),
                language_used=language,
                words=[],
                lines=[]
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing OCR request: {e}")
        processing_time_ms = (time.time() - start_time) * 1000
        return OCRResponse(
            success=False,
            error_message=f"Internal server error: {str(e)}",
            processing_time_ms=processing_time_ms,
            image_size_bytes=0,
            language_used=language
        )

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "ocr-service",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "OCR Service is running",
        "endpoints": {
            "health": "/health",
            "process_ocr": "/ocr/process"
        }
    }

if __name__ == "__main__":
    uvicorn.run(
        "http_server:app",
        host="0.0.0.0",
        port=8001,
        reload=False,
        log_level="info"
    )
