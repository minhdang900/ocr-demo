import { Controller, Post, Get, Body, Param, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HttpOCRService } from './http-ocr.service';

@ApiTags('ocr')
@Controller('ocr')
export class OcrController {
  constructor(private readonly httpOcrService: HttpOCRService) {}

  @Post('process/crop')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Process cropped image with OCR' })
  @ApiResponse({
    status: 201,
    description: 'OCR processing completed successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async processCrop(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ): Promise<{ success: boolean; result?: any; message?: string; file_size?: number; max_size?: number }> {
    try {
      if (!file) {
        return { success: false, message: 'No file uploaded' };
      }

      // Check file size limit (OCR.space free plan: 1MB)
      const MAX_FILE_SIZE = 1024 * 1024; // 1MB
      if (file.size > MAX_FILE_SIZE) {
        return {
          success: false,
          message: `File size (${file.size} bytes) exceeds the 1MB limit for OCR.space free plan. Please use a smaller image or upgrade to a paid plan.`,
          file_size: file.size,
          max_size: MAX_FILE_SIZE
        };
      }

      // Parse region if provided
      let region = undefined;
      if (body.region) {
        try {
          region = JSON.parse(body.region);
        } catch (error) {
          console.warn('Invalid region format:', body.region);
        }
      }

      // Prepare HTTP request
      const httpRequest = {
        image_data: file.buffer,
        language: body.language || 'eng',
        region: region || { x: 0, y: 0, width: 0, height: 0 },
        options: {
          ocr_engine: '1',
          is_overlay_required: true,
          detect_orientation: true,
          scale: true
        }
      };

      // Process with HTTP OCR service
      const ocrResult = await this.httpOcrService.processOCR(httpRequest);

      if (ocrResult.success) {
        return {
          success: true,
          result: {
            text: ocrResult.text,
            confidence: ocrResult.confidence,
            processing_time: ocrResult.processing_time_ms,
            language: body.language || 'eng',
            region: region,
            words: ocrResult.words || [],
            lines: ocrResult.lines || [],
            word_count: ocrResult.words?.length || 0,
            line_count: ocrResult.lines?.length || 0
          }
        };
      } else {
        return {
          success: false,
          message: ocrResult.error_message || 'OCR processing failed'
        };
      }

    } catch (error) {
      console.error('OCR crop processing error:', error);
      return {
        success: false,
        message: error.message || 'OCR processing failed'
      };
    }
  }

  @Get('health')
  @ApiOperation({ summary: 'Get OCR service health' })
  async getHealth(): Promise<{ status: string; service: string; ocr_service_healthy?: boolean }> {
    const ocrServiceHealthy = await this.httpOcrService.healthCheck();
    return { 
      status: 'healthy', 
      service: 'ocr',
      ocr_service_healthy: ocrServiceHealthy
    };
  }
}
