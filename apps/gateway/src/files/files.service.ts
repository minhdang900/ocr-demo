import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Local type definitions to replace workspace imports
export enum FileStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface FileMetadata {
  id: string;
  originalName: string;
  filename: string;
  mimeType: string;
  size: number;
  path: string;
  url: string;
  userId: string;
  status: FileStatus;
  uploadedAt: Date;
  updatedAt: Date;
}

@Injectable()
export class FilesService {
  private uploadDir: string;
  private files = new Map<string, FileMetadata>();

  constructor(private configService: ConfigService) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DEST', './uploads');
    this.ensureUploadDir();
  }

  private ensureUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(file: Express.Multer.File): Promise<FileMetadata> {
    const fileId = uuidv4();
    const fileExtension = path.extname(file.originalname);
    const filename = `${fileId}${fileExtension}`;
    const filePath = path.join(this.uploadDir, filename);

    // Move file to destination
    fs.renameSync(file.path, filePath);

    const fileMetadata: FileMetadata = {
      id: fileId,
      originalName: file.originalname,
      filename,
      mimeType: file.mimetype,
      size: file.size,
      path: filePath,
      url: `${this.configService.get<string>('API_URL', 'http://localhost:3001')}/api/files/${fileId}/download`,
      userId: 'anonymous',
      status: FileStatus.UPLOADED,
      uploadedAt: new Date(),
      updatedAt: new Date(),
    };

    // Save to in-memory storage for demo
    this.files.set(fileId, fileMetadata);
    return fileMetadata;
  }

  async getFile(fileId: string): Promise<FileMetadata> {
    const file = this.files.get(fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return file;
  }

  async deleteFile(fileId: string): Promise<void> {
    const file = await this.getFile(fileId);
    
    // Delete file from filesystem
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    // Remove from in-memory storage
    this.files.delete(fileId);
  }

  async getAllFiles(): Promise<FileMetadata[]> {
    return Array.from(this.files.values());
  }
}
