import { parentPort, workerData } from 'worker_threads';
import { createWriteStream, WriteStream } from 'fs';
import { createHash } from 'crypto';

interface WorkerData {
  url: string;
  headers: Record<string, string>;
  segment: {
    id: string;
    start: number;
    end: number;
    filePath: string;
  };
  timeout: number;
  retryCount: number;
}

interface ProgressMessage {
  type: 'progress';
  segmentId: string;
  downloaded: number;
  speed: number;
}

interface CompletedMessage {
  type: 'completed';
  segmentId: string;
  checksum: string;
}

interface ErrorMessage {
  type: 'error';
  segmentId: string;
  error: string;
  retryable: boolean;
}

class DownloadWorker {
  private abortController: AbortController;
  private data: WorkerData;
  private startTime: number;
  private lastProgressTime: number;
  private lastDownloadedSize: number;

  constructor(data: WorkerData) {
    this.data = data;
    this.abortController = new AbortController();
    this.startTime = Date.now();
    this.lastProgressTime = this.startTime;
    this.lastDownloadedSize = 0;
  }

  async start(): Promise<void> {
    try {
      await this.downloadWithRetry();
    } catch (error) {
      this.postError(error as Error, false);
    }
  }

  private async downloadWithRetry(): Promise<void> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.data.retryCount; attempt++) {
      try {
        await this.downloadSegment(attempt);
        return; // 成功完成
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.data.retryCount) {
          // 指数退避延迟
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await this.sleep(delay);

          // 重置控制器
          this.abortController = new AbortController();
        }
      }
    }

    throw lastError!;
  }

  private async downloadSegment(attempt: number): Promise<void> {
    const timeout = this.data.timeout * attempt; // 递增超时
    const timeoutId = setTimeout(() => this.abortController.abort(), timeout);

    try {
      const response = await fetch(this.data.url, {
        headers: {
          ...this.data.headers,
          'Range': `bytes=${this.data.segment.start}-${this.data.segment.end}`
        },
        signal: this.abortController.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await this.processResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async processResponse(response: Response): Promise<void> {
    const writeStream = createWriteStream(this.data.segment.filePath);
    const hash = createHash('sha256');
    let downloaded = 0;

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 更新哈希
        hash.update(value);
        downloaded += value.length;

        // 写入文件
        await this.writeToStream(writeStream, value);

        // 报告进度
        this.reportProgress(downloaded);
      }

      // 关闭文件流
      await this.closeStream(writeStream);

      // 报告完成
      this.postCompleted(hash.digest('hex'));
    } finally {
      reader.releaseLock();
      writeStream.destroy();
    }
  }

  private writeToStream(stream: WriteStream, data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      const success = stream.write(data);
      if (success) {
        resolve();
      } else {
        stream.once('drain', resolve);
        stream.once('error', reject);
      }
    });
  }

  private closeStream(stream: WriteStream): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.end((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private reportProgress(downloaded: number): void {
    const now = Date.now();
    const timeDiff = (now - this.lastProgressTime) / 1000;
    const sizeDiff = downloaded - this.lastDownloadedSize;

    const speed = timeDiff > 0 ? sizeDiff / timeDiff : 0;

    this.postProgress(downloaded, speed);

    this.lastProgressTime = now;
    this.lastDownloadedSize = downloaded;
  }

  private postProgress(downloaded: number, speed: number): void {
    const message: ProgressMessage = {
      type: 'progress',
      segmentId: this.data.segment.id,
      downloaded,
      speed
    };
    this.postMessage(message);
  }

  private postCompleted(checksum: string): void {
    const message: CompletedMessage = {
      type: 'completed',
      segmentId: this.data.segment.id,
      checksum
    };
    this.postMessage(message);
  }

  private postError(error: Error, retryable: boolean): void {
    const message: ErrorMessage = {
      type: 'error',
      segmentId: this.data.segment.id,
      error: error.message,
      retryable
    };
    this.postMessage(message);
  }

  private postMessage(message: any): void {
    parentPort?.postMessage(message);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Worker入口点
if (parentPort && workerData) {
  const worker = new DownloadWorker(workerData);
  worker.start();
}
