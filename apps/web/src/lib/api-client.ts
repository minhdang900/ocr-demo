// ==========================
// Secure API Client (Server-Side Proxy)
// ==========================

// Types for API requests and responses
export interface OcrRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrOptions {
  OCREngine: string;
  isOverlayRequired: string;
  detectOrientation: string;
  scale: string;
}

export interface OcrRequest {
  file: Blob;
  region: OcrRegion;
  language: string;
  options: OcrOptions;
}

export interface OcrResponse {
  success: boolean;
  result?: {
    text: string;
    confidence: number;
    processing_time: number;
    language: string;
    word_count: number;
    line_count: number;
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
    lines: Array<{
      text: string;
      boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
        x2: number;
        y2: number;
      };
      words: any[];
      lineIndex: number;
    }>;
  };
  message?: string;
}

// API configuration - now calls Next.js API route
const API_CONFIG = {
  baseUrl: '/api/ocr/process', // Next.js API route
  timeout: 45000,
  maxFileSize: 25 * 1024 * 1024, // 25MB
  maxRegionSize: 5000,
  rateLimitDelay: 1000,
};

// Rate limiting
let lastRequestTime = 0;

// Input validation
export function validateOcrRequest(request: OcrRequest): string | null {
  // Validate file
  if (!request.file || request.file.size > API_CONFIG.maxFileSize) {
    return `File size must be less than ${API_CONFIG.maxFileSize / (1024 * 1024)}MB`;
  }

  // Validate region
  const { region } = request;
  if (region.width <= 0 || region.height <= 0) {
    return "Region dimensions must be positive";
  }

  if (region.width > API_CONFIG.maxRegionSize || region.height > API_CONFIG.maxRegionSize) {
    return `Region dimensions must be less than ${API_CONFIG.maxRegionSize}px`;
  }

  if (region.x < 0 || region.y < 0) {
    return "Region coordinates must be non-negative";
  }

  // Validate language
  if (!request.language || request.language.length !== 3) {
    return "Language must be a 3-character code (e.g., 'eng')";
  }

  return null;
}

// Secure fetch with timeout and retry logic
async function secureFetch(
  url: string, 
  options: RequestInit, 
  timeoutMs: number = API_CONFIG.timeout
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < API_CONFIG.rateLimitDelay) {
      await new Promise(resolve => 
        setTimeout(resolve, API_CONFIG.rateLimitDelay - timeSinceLastRequest)
      );
    }
    lastRequestTime = Date.now();

    // Don't override Content-Type for FormData - let browser set it automatically
    const headers = options.body instanceof FormData 
      ? options.headers // Let browser set Content-Type with boundary
      : {
          'Content-Type': 'application/json',
          ...options.headers,
        };

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
    });

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Main OCR API client
export class OcrApiClient {
  private static instance: OcrApiClient;

  private constructor() {}

  public static getInstance(): OcrApiClient {
    if (!OcrApiClient.instance) {
      OcrApiClient.instance = new OcrApiClient();
    }
    return OcrApiClient.instance;
  }

  async processOcr(request: OcrRequest): Promise<OcrResponse> {
    // Validate input
    const validationError = validateOcrRequest(request);
    if (validationError) {
      throw new Error(validationError);
    }

    try {
      // Build form data
      const form = new FormData();
      form.append("file", request.file, "crop.png");
      form.append("region", JSON.stringify(request.region));
      form.append("language", request.language);
      form.append("options", JSON.stringify(request.options));

      // Make request to Next.js API route
      const response = await secureFetch(
        API_CONFIG.baseUrl,
        {
          method: "POST",
          body: form,
        }
      );

      // Handle response
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const data: OcrResponse = await response.json();

      if (!data.success) {
        throw new Error(data.message || "OCR processing failed");
      }

      return data;
    } catch (error: any) {
      // Sanitize error messages for security
      if (error.name === 'AbortError') {
        throw new Error("Request timed out. Please try again.");
      }

      if (error.message.includes('API Error')) {
        // Log server errors but don't expose details to user
        console.error('OCR API Error:', error.message);
        throw new Error("OCR service temporarily unavailable. Please try again.");
      }

      if (error.message.includes('network') || error.message.includes('fetch')) {
        throw new Error("Network error. Please check your connection.");
      }

      // Generic error for security
      throw new Error("OCR processing failed. Please try again.");
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const response = await secureFetch(
        `${API_CONFIG.baseUrl}`,
        { method: "GET" },
        5000
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const ocrApiClient = OcrApiClient.getInstance();
