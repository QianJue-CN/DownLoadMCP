import { parentPort } from 'worker_threads';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';

interface VerificationMessage {
  type: 'verify' | 'verifyFile' | 'calculateChecksum';
  segmentId?: string;
  segmentInfo?: any;
  filePath?: string;
  algorithm?: string;
  data?: Buffer;
  start?: number;
  end?: number;
}

interface VerificationResult {
  success: boolean;
  segmentId?: string;
  verified: boolean;
  corrupted: boolean;
  checksum?: string;
  error?: string;
  processingTime: number;
}

/**
 * Verification worker for parallel integrity checking
 */
class VerificationWorker {
  constructor() {
    if (parentPort) {
      parentPort.on('message', this.handleMessage.bind(this));
    }
  }

  private async handleMessage(message: VerificationMessage): Promise<void> {
    const startTime = Date.now();
    let result: VerificationResult;

    try {
      switch (message.type) {
        case 'verify':
          result = await this.verifySegment(message);
          break;
        case 'verifyFile':
          result = await this.verifyFile(message);
          break;
        case 'calculateChecksum':
          result = await this.calculateChecksum(message);
          break;
        default:
          throw new Error(`Unknown message type: ${(message as any).type}`);
      }
    } catch (error) {
      result = {
        success: false,
        verified: false,
        corrupted: true,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      };
    }

    result.processingTime = Date.now() - startTime;

    if (parentPort) {
      parentPort.postMessage(result);
    }
  }

  /**
   * Verify a segment's integrity
   */
  private async verifySegment(message: VerificationMessage): Promise<VerificationResult> {
    const { segmentId, segmentInfo } = message;

    if (!segmentId || !segmentInfo) {
      throw new Error('Missing segment information');
    }

    // If we have expected checksum, compare it
    if (segmentInfo.expectedChecksum && segmentInfo.actualChecksum) {
      const verified = segmentInfo.expectedChecksum === segmentInfo.actualChecksum;

      return {
        success: true,
        segmentId,
        verified,
        corrupted: !verified,
        processingTime: 0
      };
    }

    // If we have data, calculate checksum
    if (message.data) {
      const hash = createHash(segmentInfo.algorithm || 'sha256');
      hash.update(message.data);
      const checksum = hash.digest('hex');

      const verified = segmentInfo.expectedChecksum
        ? checksum === segmentInfo.expectedChecksum
        : true;

      return {
        success: true,
        segmentId,
        verified,
        corrupted: !verified,
        checksum,
        processingTime: 0
      };
    }

    // Default: assume verified if no specific checks
    return {
      success: true,
      segmentId,
      verified: true,
      corrupted: false,
      processingTime: 0
    };
  }

  /**
   * Verify a file segment from disk
   */
  private async verifyFile(message: VerificationMessage): Promise<VerificationResult> {
    const { filePath, algorithm = 'sha256', start = 0, end } = message;

    if (!filePath) {
      throw new Error('File path is required');
    }

    const fileHandle = await fs.open(filePath, 'r');

    try {
      const stats = await fileHandle.stat();
      const fileSize = stats.size;
      const readEnd = end !== undefined ? Math.min(end, fileSize) : fileSize;
      const readSize = readEnd - start;

      if (readSize <= 0) {
        throw new Error('Invalid read range');
      }

      const buffer = Buffer.alloc(readSize);
      const { bytesRead } = await fileHandle.read(buffer, 0, readSize, start);

      if (bytesRead !== readSize) {
        throw new Error(`Expected to read ${readSize} bytes, but read ${bytesRead}`);
      }

      // Calculate checksum
      const hash = createHash(algorithm);
      hash.update(buffer.subarray(0, bytesRead));
      const checksum = hash.digest('hex');

      return {
        success: true,
        verified: true,
        corrupted: false,
        checksum,
        processingTime: 0
      };

    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Calculate checksum for data or file
   */
  private async calculateChecksum(message: VerificationMessage): Promise<VerificationResult> {
    const { algorithm = 'sha256', data, filePath } = message;

    let checksum: string;

    if (data) {
      // Calculate checksum for provided data
      const hash = createHash(algorithm);
      hash.update(data);
      checksum = hash.digest('hex');
    } else if (filePath) {
      // Calculate checksum for entire file
      checksum = await this.calculateFileChecksum(filePath, algorithm);
    } else {
      throw new Error('Either data or filePath must be provided');
    }

    return {
      success: true,
      verified: true,
      corrupted: false,
      checksum,
      processingTime: 0
    };
  }

  /**
   * Calculate checksum for entire file
   */
  private async calculateFileChecksum(filePath: string, algorithm: string): Promise<string> {
    const hash = createHash(algorithm);
    const fileHandle = await fs.open(filePath, 'r');

    try {
      const buffer = Buffer.alloc(64 * 1024); // 64KB chunks
      let position = 0;

      while (true) {
        const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, position);
        if (bytesRead === 0) break;

        hash.update(buffer.subarray(0, bytesRead));
        position += bytesRead;
      }
    } finally {
      await fileHandle.close();
    }

    return hash.digest('hex');
  }


}

// Initialize the worker
new VerificationWorker();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  if (parentPort) {
    parentPort.postMessage({
      success: false,
      verified: false,
      corrupted: true,
      error: `Uncaught exception: ${error.message}`,
      processingTime: 0
    });
  }
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason) => {
  if (parentPort) {
    parentPort.postMessage({
      success: false,
      verified: false,
      corrupted: true,
      error: `Unhandled rejection: ${reason}`,
      processingTime: 0
    });
  }
  process.exit(1);
});
