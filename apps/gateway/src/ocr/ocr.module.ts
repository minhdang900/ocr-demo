import { Module } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { HttpOCRService } from './http-ocr.service';

@Module({
  controllers: [OcrController],
  providers: [HttpOCRService],
  exports: [HttpOCRService],
})
export class OcrModule {}
