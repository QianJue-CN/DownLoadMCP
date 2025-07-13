import { NetworkErrorType } from '../types/download.js';

/**
 * 网络工具函数集合
 */
export class NetworkUtils {
  /**
   * 检查 URL 是否有效
   */
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查服务器是否支持 Range 请求
   */
  static async supportsRangeRequests(url: string, headers?: Record<string, string>): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'HEAD',
        headers: headers || {},
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const acceptRanges = response.headers.get('accept-ranges');
      return acceptRanges === 'bytes';
    } catch {
      return false;
    }
  }

  /**
   * 获取文件的内容长度
   */
  static async getContentLength(url: string, headers?: Record<string, string>): Promise<number | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'HEAD',
        headers: headers || {},
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const contentLength = response.headers.get('content-length');
      return contentLength ? parseInt(contentLength, 10) : null;
    } catch {
      return null;
    }
  }

  /**
   * 获取文件的元数据信息
   */
  static async getFileMetadata(url: string, headers?: Record<string, string>): Promise<{
    contentLength?: number;
    contentType?: string;
    lastModified?: string;
    etag?: string;
    supportsRange: boolean;
    filename?: string;
  }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'HEAD',
        headers: headers || {},
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const contentLength = response.headers.get('content-length');
      const contentDisposition = response.headers.get('content-disposition');

      // 从 Content-Disposition 头中提取文件名
      let filename: string | undefined;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) {
          filename = match[1].replace(/['"]/g, '');
        }
      }

      return {
        contentLength: contentLength ? parseInt(contentLength, 10) : undefined,
        contentType: response.headers.get('content-type') || undefined,
        lastModified: response.headers.get('last-modified') || undefined,
        etag: response.headers.get('etag') || undefined,
        supportsRange: response.headers.get('accept-ranges') === 'bytes',
        filename
      };
    } catch (error) {
      throw this.classifyNetworkError(error);
    }
  }

  /**
   * 测试网络连接速度
   */
  static async testConnectionSpeed(url: string, testDuration: number = 5000): Promise<number> {
    const startTime = Date.now();
    let downloadedBytes = 0;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), testDuration + 1000);

      const response = await fetch(url, {
        headers: {
          'Range': 'bytes=0-1048576' // 下载前1MB进行测试
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.body) {
        throw new Error('响应体为空');
      }

      return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
          const duration = (Date.now() - startTime) / 1000;
          const speed = downloadedBytes / duration; // bytes per second
          resolve(speed);
        }, testDuration);

        try {
          const reader = response.body!.getReader();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              downloadedBytes += value.length;
            }

            clearTimeout(timeout);
            const duration = (Date.now() - startTime) / 1000;
            const speed = downloadedBytes / duration;
            resolve(speed);
          } finally {
            reader.releaseLock();
          }
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });
    } catch (error) {
      throw this.classifyNetworkError(error);
    }
  }

  /**
   * 检查网络连接状态
   */
  static async checkConnectivity(testUrls: string[] = [
    'https://www.baidu.com',
    'https://www.google.com',
    'https://www.cloudflare.com',
    'https://httpbin.org/get'
  ]): Promise<boolean> {
    for (const url of testUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return true;
        }
      } catch {
        // 继续尝试下一个 URL
      }
    }

    return false;
  }

  /**
   * 重试机制包装器
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
    backoffMultiplier: number = 2
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // 如果是最后一次尝试，直接抛出错误
        if (attempt === maxRetries) {
          break;
        }

        // 检查错误是否可重试
        if (!this.isRetryableError(error)) {
          break;
        }

        // 等待后重试
        const waitTime = delay * Math.pow(backoffMultiplier, attempt);
        await this.sleep(waitTime);
      }
    }

    throw lastError!;
  }

  /**
   * 判断错误是否可重试
   */
  static isRetryableError(error: any): boolean {
    // 网络超时错误
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
      return true;
    }

    // HTTP 5xx 错误
    if (error.status >= 500 && error.status < 600) {
      return true;
    }

    // 特定的 HTTP 4xx 错误
    if (error.status === 408 || error.status === 429) {
      return true;
    }

    return false;
  }

  /**
   * 分类网络错误
   */
  static classifyNetworkError(error: any): Error {
    let errorType: NetworkErrorType = NetworkErrorType.UNKNOWN;
    let message = '未知网络错误';

    if (error.code) {
      switch (error.code) {
        case 'ETIMEDOUT':
          errorType = NetworkErrorType.CONNECTION_TIMEOUT;
          message = '连接超时';
          break;
        case 'ECONNREFUSED':
          errorType = NetworkErrorType.CONNECTION_REFUSED;
          message = '连接被拒绝';
          break;
        case 'ENOTFOUND':
          errorType = NetworkErrorType.DNS_RESOLUTION_FAILED;
          message = 'DNS 解析失败';
          break;
        case 'ECONNRESET':
          errorType = NetworkErrorType.READ_TIMEOUT;
          message = '连接被重置';
          break;
        default:
          message = `网络错误: ${error.code}`;
      }
    } else if (error.status) {
      errorType = NetworkErrorType.HTTP_ERROR;
      message = `HTTP ${error.status}: ${error.statusText || '未知错误'}`;
    } else if (error.message) {
      if (error.message.includes('timeout')) {
        errorType = NetworkErrorType.CONNECTION_TIMEOUT;
        message = '请求超时';
      } else if (error.message.includes('SSL') || error.message.includes('certificate')) {
        errorType = NetworkErrorType.SSL_ERROR;
        message = 'SSL/TLS 错误';
      } else {
        message = error.message;
      }
    }

    const networkError = new Error(message);
    (networkError as any).type = errorType;
    (networkError as any).retryable = this.isRetryableError(error);
    (networkError as any).originalError = error;

    return networkError;
  }

  /**
   * 格式化网络速度
   */
  static formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) {
      return `${bytesPerSecond.toFixed(0)} B/s`;
    } else if (bytesPerSecond < 1024 * 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    } else if (bytesPerSecond < 1024 * 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    } else {
      return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
    }
  }

  /**
   * 估算下载时间
   */
  static estimateDownloadTime(fileSize: number, speed: number): number {
    if (speed <= 0) return 0;
    return fileSize / speed; // 返回秒数
  }

  /**
   * 格式化时间
   */
  static formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}秒`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}分${remainingSeconds}秒`;
    } else if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}小时${minutes}分钟`;
    } else {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      return `${days}天${hours}小时`;
    }
  }

  /**
   * 睡眠函数
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 验证 HTTP 响应状态
   */
  static validateResponse(response: Response): void {
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      (error as any).status = response.status;
      (error as any).statusText = response.statusText;
      throw error;
    }
  }

  /**
   * 构建带有用户代理的默认请求头
   */
  static getDefaultHeaders(): Record<string, string> {
    return {
      'User-Agent': 'Download-MCP/1.0.0 (Multi-threaded downloader with resume support)',
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive'
    };
  }
}
