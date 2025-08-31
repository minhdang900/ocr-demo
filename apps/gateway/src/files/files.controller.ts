import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { FilesService } from './files.service';
import { FileMetadata } from './files.service';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a file' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    type: 'object',
  })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ file: FileMetadata }> {
    const uploadedFile = await this.filesService.uploadFile(file);
    return { file: uploadedFile };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file metadata' })
  @ApiResponse({
    status: 200,
    description: 'File metadata retrieved successfully',
    type: 'object',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getFile(@Param('id') id: string): Promise<{ file: FileMetadata }> {
    const file = await this.filesService.getFile(id);
    return { file };
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download a file' })
  @ApiResponse({
    status: 200,
    description: 'File downloaded successfully',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    const file = await this.filesService.getFile(id);
    
    // Check if file exists
    const fs = require('fs');
    if (!fs.existsSync(file.path)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }
    
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    
    // Stream file from storage
    res.sendFile(file.path, { root: process.cwd() });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a file' })
  @ApiResponse({
    status: 200,
    description: 'File deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  async deleteFile(@Param('id') id: string): Promise<{ message: string }> {
    await this.filesService.deleteFile(id);
    return { message: 'File deleted successfully' };
  }

  @Get()
  @ApiOperation({ summary: 'Get user files' })
  @ApiResponse({
    status: 200,
    description: 'All files retrieved successfully',
    type: 'array',
  })
  async getAllFiles(): Promise<{ files: FileMetadata[] }> {
    const files = await this.filesService.getAllFiles();
    return { files };
  }
}
