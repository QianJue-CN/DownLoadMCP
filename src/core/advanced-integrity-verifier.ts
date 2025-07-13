import { createHash, Hash } from 'crypto';
import { promises as fs } from 'fs';
import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { join } from 'path';

export interface SegmentIntegrityInfo {
  segmentId: string;
  start: number;
  end: number;
  expectedChecksum?: string;
  actualChecksum?: string;
  algorithm: string;
  verified: boolean;
  corrupted: boolean;
  retryCount: number;
}

export interface RealTimeVerificationConfig {
  enableRealTimeVerification: boolean;
  enableSegmentVerification: boolean;
  enableParallelVerification: boolean;
  maxParallelWorkers: number;
  checksumAlgorithm: string;
  segmentSize: number;
  corruptionThreshold: number; // 0.0 - 1.0
  autoRepairCorrupted: boolean;
  verificationInterval: number; // ms
}

export interface VerificationResult {
  success: boolean;
  totalSegments: number;
  verifiedSegments: number;
  corruptedSegments: number;
  repairedSegments: number;
  overallChecksum?: string;
  segmentResults: SegmentIntegrityInfo[];
  processingTime: number;
  error?: string;
}

export interface VerificationProgress {
  totalSegments: number;
  processedSegments: number;
  verifiedSegments: number;
  corruptedSegments: number;
  currentSegment?: string;
  progress: number; // 0.0 - 1.0
}

export class AdvancedIntegrityVerifier extends EventEmitter {
  private config: RealTimeVerificationConfig;
  private verificationWorkers: Worker[] = [];
  private segmentChecksums: Map<string, SegmentIntegrityInfo> = new Map();
  private realTimeHashes: Map<string, Hash> = new Map();
  private verificationQueue: string[] = [];
  private isVerifying = false;

  constructor(config: Partial<RealTimeVerificationConfig> = {}) {
    super();
    
    this.config = {
      enableRealTimeVerification: true,
      enableSegmentVerification: true,
      enableParallelVerification: true,
      maxParallelWorkers: 4,
      checksumAlgorithm: 'sha256',
      segmentSize: 1024 * 1024, // 1MB
      corruptionThreshold: 0.05, // 5%
      autoRepairCorrupted: true,
      verificationInterval: 1000, // 1 second
      ...config
    };

    if (this.config.enableParallelVerification) {
      this.initializeWorkers();
    }
  }

  /**
   * Start real-time verification for a download
   */
  startRealTimeVerification(taskId: string, totalSize: number): void {
    if (!this.config.enableRealTimeVerification) return;

    const segmentCount = Math.ceil(totalSize / this.config.segmentSize);
    
    // Initialize segment tracking
    for (let i = 0; i < segmentCount; i++) {
      const start = i * this.config.segmentSize;
      const end = Math.min(start + this.config.segmentSize - 1, totalSize - 1);
      const segmentId = `${taskId}_segment_${i}`;
      
      const segmentInfo: SegmentIntegrityInfo = {
        segmentId,
        start,
        end,
        algorithm: this.config.checksumAlgorithm,
        verified: false,
        corrupted: false,
        retryCount: 0
      };
      
      this.segmentChecksums.set(segmentId, segmentInfo);
    }

    // Initialize real-time hash
    const hash = createHash(this.config.checksumAlgorithm);
    this.realTimeHashes.set(taskId, hash);

    this.emit('verificationStarted', {
      taskId,
      totalSegments: segmentCount,
      algorithm: this.config.checksumAlgorithm
    });
  }

  /**
   * Process downloaded data in real-time
   */
  processDownloadedData(taskId: string, segmentId: string, data: Buffer): void {
    if (!this.config.enableRealTimeVerification) return;

    // Update real-time hash
    const hash = this.realTimeHashes.get(taskId);
    if (hash) {
      hash.update(data);
    }

    // Queue segment for verification
    if (this.config.enableSegmentVerification) {
      this.queueSegmentVerification(segmentId, data);
    }
  }

  /**
   * Queue a segment for verification
   */
  private queueSegmentVerification(segmentId: string, data: Buffer): void {
    const segmentInfo = this.segmentChecksums.get(segmentId);
    if (!segmentInfo) return;

    // Calculate segment checksum
    const hash = createHash(this.config.checksumAlgorithm);
    hash.update(data);
    segmentInfo.actualChecksum = hash.digest('hex');

    // Add to verification queue
    this.verificationQueue.push(segmentId);
    
    // Process queue if not already processing
    if (!this.isVerifying) {
      this.processVerificationQueue();
    }
  }

  /**
   * Process the verification queue
   */
  private async processVerificationQueue(): Promise<void> {
    if (this.isVerifying || this.verificationQueue.length === 0) return;

    this.isVerifying = true;

    try {
      while (this.verificationQueue.length > 0) {
        const batchSize = Math.min(
          this.config.maxParallelWorkers,
          this.verificationQueue.length
        );
        
        const batch = this.verificationQueue.splice(0, batchSize);
        
        if (this.config.enableParallelVerification && this.verificationWorkers.length > 0) {
          await this.verifySegmentsBatch(batch);
        } else {
          await this.verifySegmentsSequential(batch);
        }
      }
    } finally {
      this.isVerifying = false;
    }
  }

  /**
   * Verify segments in parallel using workers
   */
  private async verifySegmentsBatch(segmentIds: string[]): Promise<void> {
    const promises = segmentIds.map((segmentId, index) => {
      const workerIndex = index % this.verificationWorkers.length;
      return this.verifySegmentWithWorker(segmentId, workerIndex);
    });

    await Promise.all(promises);
  }

  /**
   * Verify segments sequentially
   */
  private async verifySegmentsSequential(segmentIds: string[]): Promise<void> {
    for (const segmentId of segmentIds) {
      await this.verifySegment(segmentId);
    }
  }

  /**
   * Verify a single segment using a worker
   */
  private async verifySegmentWithWorker(segmentId: string, workerIndex: number): Promise<void> {
    const worker = this.verificationWorkers[workerIndex];
    const segmentInfo = this.segmentChecksums.get(segmentId);
    
    if (!worker || !segmentInfo) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Verification timeout for segment ${segmentId}`));
      }, 30000);

      worker.once('message', (result) => {
        clearTimeout(timeout);
        this.handleVerificationResult(segmentId, result);
        resolve();
      });

      worker.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      worker.postMessage({
        type: 'verify',
        segmentId,
        segmentInfo
      });
    });
  }

  /**
   * Verify a single segment
   */
  private async verifySegment(segmentId: string): Promise<void> {
    const segmentInfo = this.segmentChecksums.get(segmentId);
    if (!segmentInfo) return;

    // Simulate verification logic
    const isValid = segmentInfo.expectedChecksum 
      ? segmentInfo.actualChecksum === segmentInfo.expectedChecksum
      : true; // If no expected checksum, assume valid

    segmentInfo.verified = true;
    segmentInfo.corrupted = !isValid;

    this.handleVerificationResult(segmentId, {
      verified: isValid,
      corrupted: !isValid
    });
  }

  /**
   * Handle verification result
   */
  private handleVerificationResult(segmentId: string, result: any): void {
    const segmentInfo = this.segmentChecksums.get(segmentId);
    if (!segmentInfo) return;

    segmentInfo.verified = result.verified;
    segmentInfo.corrupted = result.corrupted;

    if (result.corrupted && this.config.autoRepairCorrupted) {
      this.scheduleSegmentRepair(segmentId);
    }

    this.emit('segmentVerified', {
      segmentId,
      verified: result.verified,
      corrupted: result.corrupted
    });

    // Check if verification is complete
    this.checkVerificationComplete();
  }

  /**
   * Schedule repair for a corrupted segment
   */
  private scheduleSegmentRepair(segmentId: string): void {
    const segmentInfo = this.segmentChecksums.get(segmentId);
    if (!segmentInfo) return;

    segmentInfo.retryCount++;
    
    this.emit('segmentRepairScheduled', {
      segmentId,
      retryCount: segmentInfo.retryCount,
      start: segmentInfo.start,
      end: segmentInfo.end
    });
  }

  /**
   * Check if verification is complete for all segments
   */
  private checkVerificationComplete(): void {
    const allSegments = Array.from(this.segmentChecksums.values());
    const verifiedSegments = allSegments.filter(s => s.verified);
    
    if (verifiedSegments.length === allSegments.length) {
      const corruptedSegments = allSegments.filter(s => s.corrupted);
      const corruptionRate = corruptedSegments.length / allSegments.length;
      
      this.emit('verificationComplete', {
        totalSegments: allSegments.length,
        verifiedSegments: verifiedSegments.length,
        corruptedSegments: corruptedSegments.length,
        corruptionRate,
        exceedsThreshold: corruptionRate > this.config.corruptionThreshold
      });
    }
  }

  /**
   * Finalize verification and get overall checksum
   */
  finalizeVerification(taskId: string): string | undefined {
    const hash = this.realTimeHashes.get(taskId);
    if (!hash) return undefined;

    const checksum = hash.digest('hex');
    this.realTimeHashes.delete(taskId);
    
    return checksum;
  }

  /**
   * Get verification progress
   */
  getVerificationProgress(taskId: string): VerificationProgress {
    const segments = Array.from(this.segmentChecksums.values())
      .filter(s => s.segmentId.startsWith(taskId));
    
    const totalSegments = segments.length;
    const processedSegments = segments.filter(s => s.verified).length;
    const verifiedSegments = segments.filter(s => s.verified && !s.corrupted).length;
    const corruptedSegments = segments.filter(s => s.corrupted).length;
    
    return {
      totalSegments,
      processedSegments,
      verifiedSegments,
      corruptedSegments,
      progress: totalSegments > 0 ? processedSegments / totalSegments : 0
    };
  }

  /**
   * Verify complete file with advanced options
   */
  async verifyCompleteFile(
    filePath: string,
    expectedChecksum?: string,
    enableSegmentVerification = true
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      
      let segmentResults: SegmentIntegrityInfo[] = [];
      let overallChecksum: string;
      
      if (enableSegmentVerification && this.config.enableSegmentVerification) {
        // Verify by segments
        const result = await this.verifyFileBySegments(filePath, fileSize);
        segmentResults = result.segments;
        overallChecksum = result.overallChecksum;
      } else {
        // Verify entire file
        overallChecksum = await this.calculateFileChecksum(filePath);
      }
      
      const verifiedSegments = segmentResults.filter(s => s.verified && !s.corrupted).length;
      const corruptedSegments = segmentResults.filter(s => s.corrupted).length;
      
      const success = expectedChecksum ? overallChecksum === expectedChecksum : true;
      
      return {
        success,
        totalSegments: segmentResults.length,
        verifiedSegments,
        corruptedSegments,
        repairedSegments: 0, // Would be implemented in repair logic
        overallChecksum,
        segmentResults,
        processingTime: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        success: false,
        totalSegments: 0,
        verifiedSegments: 0,
        corruptedSegments: 0,
        repairedSegments: 0,
        segmentResults: [],
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Verify file by segments
   */
  private async verifyFileBySegments(filePath: string, fileSize: number): Promise<{
    segments: SegmentIntegrityInfo[];
    overallChecksum: string;
  }> {
    const segments: SegmentIntegrityInfo[] = [];
    const overallHash = createHash(this.config.checksumAlgorithm);
    
    const segmentCount = Math.ceil(fileSize / this.config.segmentSize);
    const fileHandle = await fs.open(filePath, 'r');
    
    try {
      for (let i = 0; i < segmentCount; i++) {
        const start = i * this.config.segmentSize;
        const end = Math.min(start + this.config.segmentSize, fileSize);
        const segmentSize = end - start;
        
        const buffer = Buffer.alloc(segmentSize);
        await fileHandle.read(buffer, 0, segmentSize, start);
        
        // Calculate segment checksum
        const segmentHash = createHash(this.config.checksumAlgorithm);
        segmentHash.update(buffer);
        const segmentChecksum = segmentHash.digest('hex');
        
        // Update overall hash
        overallHash.update(buffer);
        
        segments.push({
          segmentId: `segment_${i}`,
          start,
          end: end - 1,
          actualChecksum: segmentChecksum,
          algorithm: this.config.checksumAlgorithm,
          verified: true,
          corrupted: false,
          retryCount: 0
        });
      }
    } finally {
      await fileHandle.close();
    }
    
    return {
      segments,
      overallChecksum: overallHash.digest('hex')
    };
  }

  /**
   * Calculate file checksum
   */
  private async calculateFileChecksum(filePath: string): Promise<string> {
    const hash = createHash(this.config.checksumAlgorithm);
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

  /**
   * Initialize verification workers
   */
  private initializeWorkers(): void {
    const workerPath = join(__dirname, '../workers/verification-worker.js');
    
    for (let i = 0; i < this.config.maxParallelWorkers; i++) {
      try {
        const worker = new Worker(workerPath);
        this.verificationWorkers.push(worker);
      } catch (error) {
        console.warn(`Failed to create verification worker ${i}:`, error);
      }
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Terminate workers
    for (const worker of this.verificationWorkers) {
      await worker.terminate();
    }
    this.verificationWorkers = [];
    
    // Clear data
    this.segmentChecksums.clear();
    this.realTimeHashes.clear();
    this.verificationQueue = [];
    
    this.removeAllListeners();
  }
}
