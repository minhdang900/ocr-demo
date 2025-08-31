import { NextRequest, NextResponse } from 'next/server';

// Server-side configuration
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';

// OCR API key - handled internally by the server
// This could be stored in a secure environment variable in production
const OCR_API_KEY = 'K85032705888957';

interface OcrRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OcrOptions {
  OCREngine: string;
  isOverlayRequired: string;
  detectOrientation: string;
  scale: string;
}

// Input validation
function validateOcrRequest(formData: FormData): { error?: string; data?: any } {
  try {
    const file = formData.get('file') as File;
    const region = formData.get('region') as string;
    const language = formData.get('language') as string;
    const options = formData.get('options') as string;

    // Validate file
    if (!file || file.size === 0) {
      return { error: 'File is required' };
    }

    if (file.size > 25 * 1024 * 1024) { // 25MB
      return { error: 'File size must be less than 25MB' };
    }

    // Validate region
    let regionData: OcrRegion;
    try {
      regionData = JSON.parse(region);
    } catch {
      return { error: 'Invalid region format' };
    }

    if (regionData.width <= 0 || regionData.height <= 0) {
      return { error: 'Region dimensions must be positive' };
    }

    if (regionData.width > 5000 || regionData.height > 5000) {
      return { error: 'Region dimensions must be less than 5000px' };
    }

    // Validate language
    if (!language || language.length !== 3) {
      return { error: 'Language must be a 3-character code' };
    }

    // Validate options
    let optionsData: OcrOptions;
    try {
      optionsData = JSON.parse(options);
    } catch {
      return { error: 'Invalid options format' };
    }

    return {
      data: {
        file,
        region: regionData,
        language,
        options: optionsData,
      }
    };
  } catch (error) {
    return { error: 'Invalid request format' };
  }
}

// Server-side API call to gateway
async function callOcrGateway(formData: FormData): Promise<Response> {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/ocr/process/crop`, {
      method: 'POST',
      body: formData,
      headers: {
        // Don't set Content-Type for FormData - let it be set automatically
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gateway API Error ${response.status}: ${errorText}`);
    }

    return response;
  } catch (error) {
    console.error('OCR Gateway API Error:', error);
    throw new Error('OCR service temporarily unavailable');
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse form data
    const formData = await request.formData();

    // Validate input
    const validation = validateOcrRequest(formData);
    if (validation.error) {
      return NextResponse.json(
        { 
          success: false, 
          message: validation.error 
        },
        { status: 400 }
      );
    }

    // Call OCR gateway
    const gatewayResponse = await callOcrGateway(formData);
    const result = await gatewayResponse.json();

    // Return the result
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('OCR API Error:', error);

    // Sanitize error message for security
    const errorMessage = error.message.includes('OCR service') 
      ? error.message 
      : 'OCR processing failed. Please try again.';

    return NextResponse.json(
      { 
        success: false, 
        message: errorMessage 
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/health`);
    
    if (response.ok) {
      return NextResponse.json({ 
        success: true, 
        message: 'OCR service is healthy' 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        message: 'OCR service is unhealthy' 
      }, { status: 503 });
    }
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      message: 'OCR service is unavailable' 
    }, { status: 503 });
  }
}
