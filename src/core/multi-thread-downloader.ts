import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { createWriteStream, promises as fs } from 'fs';
import { dirname } from 'path';
import {
  DownloadConfig,
  DownloadProgress,
  DownloadSegment,
  DownloadStatus,
  DownloadResult
} from '../types/download.js';

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

  constructor(config: DownloadConfig) {
    super();
    this.config = config;
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
      const worker = new Worker(`
        const { parentPort } = require('worker_threads');
        const fs = require('fs');

        parentPort.on('message', async ({ url, headers, segment, timeout }) => {
          try {
            // 使用 Node.js 18+ 内置的 fetch API
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout || 30000);

            const response = await fetch(url, {
              headers: {
                ...headers,
                'Range': \`bytes=\${segment.start}-\${segment.end}\`
              },
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
            }

            const writeStream = fs.createWriteStream(segment.filePath);
            let downloaded = 0;

            if (!response.body) {
              throw new Error('Response body is null');
            }

            const reader = response.body.getReader();

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                downloaded += value.length;

                // 确保数据被正确写入
                await new Promise((writeResolve, writeReject) => {
                  const success = writeStream.write(value);
                  if (success) {
                    writeResolve();
                  } else {
                    writeStream.once('drain', () => writeResolve());
                    writeStream.once('error', writeReject);
                  }
                });

                parentPort.postMessage({ type: 'progress', downloaded });
              }

              // 确保文件被正确关闭
              await new Promise((endResolve, endReject) => {
                writeStream.end((error) => {
                  if (error) {
                    endReject(error);
                  } else {
                    endResolve();
                  }
                });
              });

              parentPort.postMessage({ type: 'completed' });
            } finally {
              reader.releaseLock();
            }

          } catch (error) {
            parentPort.postMessage({ type: 'error', error: error.message });
          }
        });
      `, { eval: true });

      this.workers.push(worker);

      worker.on('message', (message) => {
        switch (message.type) {
          case 'progress':
            segment.downloaded = message.downloaded;
            this.updateDownloadedSize();
            break;
          case 'completed':
            segment.status = DownloadStatus.COMPLETED;
            resolve();
            break;
          case 'error':
            segment.status = DownloadStatus.FAILED;
            reject(new Error(message.error));
            break;
        }
      });

      worker.on('error', reject);

      // 发送下载任务
      worker.postMessage({
        url: this.config.url,
        headers: this.config.headers,
        segment,
        timeout: this.config.timeout
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
