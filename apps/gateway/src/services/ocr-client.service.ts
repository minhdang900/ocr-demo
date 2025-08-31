import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';

export interface OCRServiceRequest {
  image_data: string; // base64 encoded image
  language?: string;
  region?: any;
  options?: any;
}

export interface OCRServiceResponse {
  success: boolean;
  text: string;
  confidence: number;
  overlay: any;
  processing_time: number;
  error?: string;
}

@Injectable()
export class OCRClientService {
  private readonly logger = new Logger(OCRClientService.name);
  private readonly ocrServiceHost: string;
  private readonly ocrServicePort: number;

  constructor(private configService: ConfigService) {
    const ocrServiceUrl = this.configService.get<string>('OCR_SERVICE_URL', 'tcp://localhost:8001');
    const urlMatch = ocrServiceUrl.match(/tcp:\/\/([^:]+):(\d+)/);
    
    if (!urlMatch) {
      throw new Error(`Invalid OCR service URL format: ${ocrServiceUrl}. Expected format: tcp://host:port`);
    }
    
    this.ocrServiceHost = urlMatch[1];
    this.ocrServicePort = parseInt(urlMatch[2], 10);
    
    this.logger.log(`OCR Client Service initialized with TCP connection: ${this.ocrServiceHost}:${this.ocrServicePort}`);
  }

  async processImage(
    imageBuffer: Buffer,
    language: string = 'eng',
    region?: any,
    options?: any
  ): Promise<OCRServiceResponse> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let responseData = '';

      // Set timeout
      client.setTimeout(30000); // 30 seconds
      console.log(`Connecting to OCR service at ${this.ocrServiceHost}:${this.ocrServicePort}`);
      client.connect(this.ocrServicePort, this.ocrServiceHost, () => {
        this.logger.debug(`Connected to OCR service at ${this.ocrServiceHost}:${this.ocrServicePort}`);

        const request = {
          type: 'ocr_process',
          image_data: imageBuffer.toString('base64'),
          language,
          region,
          options
        };

        const message = JSON.stringify(request);
        const messageLength = Buffer.alloc(4);
        messageLength.writeUInt32BE(message.length, 0);

        // Send message with length prefix
        client.write(messageLength);
        client.write(message);
      });

      let buffer = Buffer.alloc(0);
      
      client.on('data', (data) => {
        buffer = Buffer.concat([buffer, data]);
        
        // Check if we have received a complete message
        while (buffer.length >= 4) {
          const messageLength = buffer.readUInt32BE(0);
          
          if (buffer.length >= 4 + messageLength) {
            const messageData = buffer.slice(4, 4 + messageLength);
            buffer = buffer.slice(4 + messageLength);
            
            try {
              const response = JSON.parse(messageData.toString());
              
              if (response.type === 'ocr_response') {
                this.logger.debug(`OCR service response received in ${response.processing_time}ms`);
                resolve({
                  success: response.success,
                  text: response.text || '',
                  confidence: response.confidence || 0,
                  overlay: response.overlay || {},
                  processing_time: response.processing_time || 0,
                  error: response.error
                });
              } else if (response.type === 'error') {
                reject(new Error(`OCR service error: ${response.message}`));
              } else {
                reject(new Error(`Unknown response type: ${response.type}`));
              }
            } catch (error) {
              reject(new Error(`Failed to parse OCR service response: ${error.message}`));
            }
            
            client.destroy();
          }
        }
      });

      client.on('error', (error) => {
        this.logger.error(`OCR service TCP connection error: ${error.message}`);
        reject(new Error(`OCR service connection failed: ${error.message}`));
      });

      client.on('timeout', () => {
        this.logger.error('OCR service request timed out');
        client.destroy();
        reject(new Error('OCR service request timed out'));
      });

      client.on('close', () => {
        this.logger.debug('OCR service TCP connection closed');
      });
    });
  }

  async healthCheck(): Promise<boolean> {
    return new Promise((resolve) => {
      const client = new net.Socket();
      let responseData = '';

      client.setTimeout(5000); // 5 seconds

      client.connect(this.ocrServicePort, this.ocrServiceHost, () => {
        const request = { type: 'health' };
        const message = JSON.stringify(request);
        const messageLength = Buffer.alloc(4);
        messageLength.writeUInt32BE(message.length, 0);

        client.write(messageLength);
        client.write(message);
      });

      client.on('data', (data) => {
        responseData += data.toString();
        
        if (responseData.length >= 4) {
          const lengthBuffer = Buffer.from(responseData.substring(0, 4));
          const messageLength = lengthBuffer.readUInt32BE(0);
          
          if (responseData.length >= 4 + messageLength) {
            const messageData = responseData.substring(4, 4 + messageLength);
            
            try {
              const response = JSON.parse(messageData);
              resolve(response.status === 'healthy');
            } catch (error) {
              resolve(false);
            }
            
            client.destroy();
          }
        }
      });

      client.on('error', () => {
        resolve(false);
      });

      client.on('timeout', () => {
        client.destroy();
        resolve(false);
      });
    });
  }
}
