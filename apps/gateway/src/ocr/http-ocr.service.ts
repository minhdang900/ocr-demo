import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import * as FormData from 'form-data';

interface OCRRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OCRRequest {
  image_data: Buffer;
  language: string;
  region: OCRRegion;
  options: {
    ocr_engine: string;
    is_overlay_required: boolean;
    detect_orientation: boolean;
    scale: boolean;
  };
}

interface OCRResponse {
  success: boolean;
  text?: string;
  confidence?: number;
  error_message?: string;
  processing_time_ms: number;
  image_size_bytes: number;
  language_used: string;
  words?: Array<{
    text: string;
    confidence: number;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
      x2: number;
      y2: number;
    };
    lineIndex: number;
  }>;
  lines?: Array<{
    text: string;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
      x2: number;
      y2: number;
    };
    words: Array<{
      text: string;
      confidence: number;
      boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
        x2: number;
        y2: number;
      };
      lineIndex: number;
    }>;
    lineIndex: number;
  }>;
}

@Injectable()
export class HttpOCRService {
  private readonly logger = new Logger(HttpOCRService.name);
  private readonly ocrServiceHost: string;
  private readonly ocrServicePort: number;
  private readonly baseUrl: string;

  constructor() {
    this.ocrServiceHost = process.env.OCR_SERVICE_HOST || 'ocr-service';
    this.ocrServicePort = parseInt(process.env.OCR_SERVICE_PORT || '8001');
    this.baseUrl = `http://${this.ocrServiceHost}:${this.ocrServicePort}`;
    
    this.logger.log(`HTTP OCR client initialized for ${this.baseUrl}`);
  }

  async processOCR(request: OCRRequest): Promise<OCRResponse> {
    try {
      this.logger.debug(`Processing OCR request for image of size: ${request.image_data.length} bytes`);

      // Create form data
      const formData = new FormData();
      
      // Add image file
      formData.append('image', request.image_data, {
        filename: 'image.jpg',
        contentType: 'image/jpeg'
      });
      
      // Add language
      formData.append('language', request.language);
      
      // Add region coordinates if provided
      if (request.region) {
        formData.append('region_x', request.region.x.toString());
        formData.append('region_y', request.region.y.toString());
        formData.append('region_width', request.region.width.toString());
        formData.append('region_height', request.region.height.toString());
      }

      // Make HTTP request
      const response: AxiosResponse<OCRResponse> = await axios.post(
        `${this.baseUrl}/ocr/process`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          timeout: 90000, // 90 seconds timeout
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      this.logger.debug('Received OCR response from HTTP service');
      return response.data;

    } catch (error) {
      this.logger.error(`HTTP OCR call failed: ${error.message}`);
      
      if (error.response) {
        // Server responded with error status
        const errorData = error.response.data;
        return {
          success: false,
          error_message: errorData.detail || errorData.error_message || 'OCR processing failed',
          processing_time_ms: 0,
          image_size_bytes: request.image_data.length,
          language_used: request.language
        };
      } else if (error.request) {
        // Request was made but no response received
        return {
          success: false,
          error_message: 'OCR service is not responding. Please check if the service is running.',
          processing_time_ms: 0,
          image_size_bytes: request.image_data.length,
          language_used: request.language
        };
      } else {
        // Something else happened
        return {
          success: false,
          error_message: `OCR processing failed: ${error.message}`,
          processing_time_ms: 0,
          image_size_bytes: request.image_data.length,
          language_used: request.language
        };
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 5000
      });
      
      this.logger.debug(`Health check response: ${response.data.status}`);
      return response.data.status === 'healthy';
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      return false;
    }
  }
}
