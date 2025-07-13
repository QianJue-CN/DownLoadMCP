import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { createWriteStream, promises as fs } from 'fs';
import { dirname, join } from 'path';
import {
  DownloadConfig,
  DownloadProgress,
  DownloadSegment,
  DownloadStatus,
  DownloadResult
} from '../types/download.js';
import { ErrorHandler } from './error-handler.js';
import { PerformanceMonitor } from '../utils/performance-monitor.js';

export class MultiThreadDownloader extends EventEmitter {
  private config: DownloadConfig;
  private segments: DownloadSegment[] = [];
  private workers: Worker[] = [];
  private totalSize: number = 0;
  private downloadedSize: number = 0;
  private startTime: number = 0;
  private lastProgressTime: number = 0;
  private lastDownloadedSize: number = 0;
  private currentSpeed: number = 0;
  private isActive: boolean = false;
  private isPaused: boolean = false;
  private isCancelled: boolean = false;
  private performanceMonitor: PerformanceMonitor;
  private taskId: string;

  constructor(config: DownloadConfig, taskId?: string) {
    super();
    this.config = config;
    this.taskId = taskId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.performanceMonitor = new PerformanceMonitor();
  }

  /**
   * 开始下载
   */
  async start(): Promise<void> {
    if (this.isActive) {
      throw new Error('下载已在进行中');
    }

    try {
      this.isActive = true;
      this.isPaused = false;
      this.isCancelled = false;
      this.startTime = Date.now();
      this.lastProgressTime = this.startTime;

      // 获取文件信息
      const fileInfo = await this.getFileInfo();
      this.totalSize = fileInfo.contentLength || 0;

      // 检查是否支持分段下载
      if (fileInfo.supportsRange && this.totalSize > this.config.chunkSize) {
        await this.startMultiThreadDownload();
      } else {
        await this.startSingleThreadDownload();
      }

    } catch (error) {
      this.isActive = false;
      this.emit('error', error);
    }
  }

  /**
   * 暂停下载
   */
  async pause(): Promise<void> {
    if (!this.isActive || this.isPaused) {
      return;
    }

    this.isPaused = true;

    // 终止所有工作线程
    for (const worker of this.workers) {
      await worker.terminate();
    }
    this.workers = [];

    this.emit('paused');
  }

  /**
   * 取消下载
   */
  async cancel(): Promise<void> {
    this.isCancelled = true;
    this.isActive = false;

    // 终止所有工作线程
    for (const worker of this.workers) {
      await worker.terminate();
    }
    this.workers = [];

    // 清理临时文件
    await this.cleanupTempFiles();

    this.emit('cancelled');
  }

  /**
   * 获取文件信息
   */
  private async getFileInfo(): Promise<{
    contentLength?: number;
    contentType?: string;
    supportsRange: boolean;
    lastModified?: string;
    etag?: string;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.url, {
        method: 'HEAD',
        headers: this.config.headers || {},
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const acceptRanges = response.headers.get('accept-ranges');
      const contentType = response.headers.get('content-type');
      const lastModified = response.headers.get('last-modified');
      const etag = response.headers.get('etag');

      return {
        contentLength: contentLength ? parseInt(contentLength, 10) : undefined,
        contentType: contentType || undefined,
        supportsRange: acceptRanges === 'bytes',
        lastModified: lastModified || undefined,
        etag: etag || undefined
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * 多线程下载
   */
  private async startMultiThreadDownload(): Promise<void> {
    // 计算分段
    this.calculateSegments();

    // 确保输出目录存在
    await fs.mkdir(dirname(this.config.outputPath), { recursive: true });

    // 创建工作线程
    const promises = this.segments.map((segment, index) =>
      this.createDownloadWorker(segment, index)
    );

    // 开始进度监控
    this.startProgressMonitoring();

    try {
      await Promise.all(promises);

      if (!this.isCancelled && !this.isPaused) {
        await this.mergeSegments();
        this.emitCompletion();
      }
    } catch (error) {
      if (!this.isCancelled && !this.isPaused) {
        this.emit('error', error);
      }
    }
  }

  /**
   * 单线程下载
   */
  private async startSingleThreadDownload(): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    const response = await fetch(this.config.url, {
      headers: this.config.headers || {},
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 确保输出目录存在
    await fs.mkdir(dirname(this.config.outputPath), { recursive: true });

    const writeStream = createWriteStream(this.config.outputPath);

    this.startProgressMonitoring();

    return new Promise(async (resolve, reject) => {
      writeStream.on('error', reject);

      if (!response.body) {
        reject(new Error('响应体为空'));
        return;
      }

      try {
        const reader = response.body.getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (this.isCancelled || this.isPaused) {
              writeStream.destroy();
              return;
            }

            this.downloadedSize += value.length;

            // 使用 Promise 包装 writeStream.write 以确保数据被写入
            await new Promise<void>((writeResolve, writeReject) => {
              const success = writeStream.write(value);
              if (success) {
                writeResolve();
              } else {
                writeStream.once('drain', () => writeResolve());
                writeStream.once('error', writeReject);
              }
            });
          }

          // 使用 Promise 包装 writeStream.end 以确保文件被正确关闭
          await new Promise<void>((endResolve, endReject) => {
            writeStream.end((error?: Error) => {
              if (error) {
                endReject(error);
              } else {
                endResolve();
              }
            });
          });

          if (!this.isCancelled && !this.isPaused) {
            this.emitCompletion();
            resolve();
          }
        } finally {
          reader.releaseLock();
        }
      } catch (error) {
        writeStream.destroy();
        reject(error);
      }
    });
  }

  /**
   * 计算下载分段
   */
  private calculateSegments(): void {
    const segmentCount = Math.min(this.config.maxConcurrency,
      Math.ceil(this.totalSize / this.config.chunkSize));

    const segmentSize = Math.floor(this.totalSize / segmentCount);

    this.segments = [];

    for (let i = 0; i < segmentCount; i++) {
      const start = i * segmentSize;
      const end = i === segmentCount - 1 ? this.totalSize - 1 : start + segmentSize - 1;

      this.segments.push({
        id: `segment_${i}`,
        start,
        end,
        downloaded: 0,
        status: DownloadStatus.PENDING,
        filePath: `${this.config.outputPath}.part${i}`
      });
    }
  }

  /**
   * 创建下载工作线程
   */
  private async createDownloadWorker(segment: DownloadSegment, _index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // 使用独立的Worker文件，移除eval安全隐患
      const workerPath = join(__dirname, '../workers/download-worker.js');

      // 确保Worker文件存在
      try {
        require.resolve(workerPath);
      } catch (error) {
        reject(new Error(`Worker file not found: ${workerPath}. Please run 'npm run build:workers' first.`));
        return;
      }

      const worker = new Worker(workerPath, {
        workerData: {
          url: this.config.url,
          headers: this.config.headers || {},
          segment: {
            id: segment.id,
            start: segment.start,
            end: segment.end,
            filePath: segment.filePath
          },
          timeout: this.config.timeout || 30000,
          retryCount: this.config.retryCount || 3
        }
      });

      this.workers.push(worker);

      // 开始监控分段性能
      this.performanceMonitor.startSegment(
        this.taskId,
        segment.id,
        segment.end - segment.start + 1
      );

      worker.on('message', (message) => {
        switch (message.type) {
          case 'progress':
            segment.downloaded = message.downloaded;
            this.updateDownloadedSize();

            // 更新性能监控
            this.performanceMonitor.updateProgress(
              this.taskId,
              this.downloadedSize,
              segment.id,
              message.downloaded
            );
            break;

          case 'completed':
            segment.status = DownloadStatus.COMPLETED;
            segment.checksum = message.checksum;

            // 完成分段监控
            this.performanceMonitor.finishSegment(this.taskId, segment.id);
            resolve();
            break;

          case 'error':
            segment.status = DownloadStatus.FAILED;

            // 记录错误
            this.performanceMonitor.recordError(this.taskId, segment.id);

            const error = ErrorHandler.analyzeError(new Error(message.error));

            if (message.retryable && (segment.retryCount || 0) < this.config.retryCount) {
              // 记录重试
              this.performanceMonitor.recordRetry(this.taskId, segment.id);
              segment.retryCount = (segment.retryCount || 0) + 1;

              // 延迟后重试
              const delay = ErrorHandler.calculateRetryDelay(segment.retryCount);
              setTimeout(() => {
                this.createDownloadWorker(segment, _index).then(resolve).catch(reject);
              }, delay);
            } else {
              reject(error);
            }
            break;
        }
      });

      worker.on('error', (error) => {
        this.performanceMonitor.recordError(this.taskId, segment.id);
        reject(ErrorHandler.analyzeError(error));
      });
    });
  }

  /**
   * 合并文件段
   */
  private async mergeSegments(): Promise<void> {
    const writeStream = createWriteStream(this.config.outputPath);

    for (const segment of this.segments) {
      const data = await fs.readFile(segment.filePath);
      writeStream.write(data);

      // 删除临时文件
      await fs.unlink(segment.filePath).catch(() => { });
    }

    writeStream.end();
  }

  /**
   * 开始进度监控
   */
  private startProgressMonitoring(): void {
    const interval = setInterval(() => {
      if (!this.isActive || this.isPaused || this.isCancelled) {
        clearInterval(interval);
        return;
      }

      this.updateProgress();
    }, 1000);
  }

  /**
   * 更新下载进度
   */
  private updateProgress(): void {
    const now = Date.now();
    const timeDiff = (now - this.lastProgressTime) / 1000;
    const sizeDiff = this.downloadedSize - this.lastDownloadedSize;

    this.currentSpeed = timeDiff > 0 ? sizeDiff / timeDiff : 0;
    this.lastProgressTime = now;
    this.lastDownloadedSize = this.downloadedSize;

    const progress: DownloadProgress = {
      taskId: '',
      totalSize: this.totalSize,
      downloadedSize: this.downloadedSize,
      percentage: this.totalSize > 0 ? (this.downloadedSize / this.totalSize) * 100 : 0,
      speed: this.currentSpeed,
      eta: this.currentSpeed > 0 ? (this.totalSize - this.downloadedSize) / this.currentSpeed : 0,
      segments: [...this.segments]
    };

    this.emit('progress', progress);
  }

  /**
   * 更新已下载大小
   */
  private updateDownloadedSize(): void {
    this.downloadedSize = this.segments.reduce((sum, segment) => sum + segment.downloaded, 0);
  }

  /**
   * 发出完成事件
   */
  private emitCompletion(): void {
    this.isActive = false;

    const result: DownloadResult = {
      taskId: '',
      success: true,
      filePath: this.config.outputPath,
      fileSize: this.downloadedSize,
      duration: Date.now() - this.startTime,
      averageSpeed: this.downloadedSize / ((Date.now() - this.startTime) / 1000)
    };

    this.emit('completed', result);
  }

  /**
   * 清理临时文件
   */
  private async cleanupTempFiles(): Promise<void> {
    for (const segment of this.segments) {
      try {
        await fs.unlink(segment.filePath);
      } catch {
        // 忽略删除失败
      }
    }
  }
}
