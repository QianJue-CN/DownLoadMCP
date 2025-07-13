export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  FILE_SYSTEM_ERROR = 'FILE_SYSTEM_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface DownloadError {
  type: ErrorType;
  message: string;
  code?: string | number;
  retryable: boolean;
  retryAfter?: number; // 建议重试延迟（毫秒）
  originalError?: Error;
}

export class ErrorHandler {
  /**
   * 分析错误并返回标准化的错误信息
   */
  static analyzeError(error: any): DownloadError {
    // 网络相关错误
    if (error.name === 'AbortError') {
      return {
        type: ErrorType.TIMEOUT_ERROR,
        message: 'Request timeout',
        retryable: true,
        retryAfter: 2000
      };
    }

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return {
        type: ErrorType.NETWORK_ERROR,
        message: 'Network connection failed',
        retryable: true,
        retryAfter: 1000
      };
    }

    // HTTP错误
    if (error.message.includes('HTTP')) {
      const statusMatch = error.message.match(/HTTP (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 0;

      if (status >= 500) {
        return {
          type: ErrorType.SERVER_ERROR,
          message: `Server error: ${error.message}`,
          code: status,
          retryable: true,
          retryAfter: 5000
        };
      }

      if (status === 401 || status === 403) {
        return {
          type: ErrorType.AUTHENTICATION_ERROR,
          message: `Authentication failed: ${error.message}`,
          code: status,
          retryable: false
        };
      }

      if (status >= 400 && status < 500) {
        return {
          type: ErrorType.SERVER_ERROR,
          message: `Client error: ${error.message}`,
          code: status,
          retryable: false
        };
      }
    }

    // 文件系统错误
    if (error.code === 'ENOENT' || error.code === 'EACCES' || error.code === 'ENOSPC') {
      return {
        type: ErrorType.FILE_SYSTEM_ERROR,
        message: `File system error: ${error.message}`,
        code: error.code,
        retryable: error.code !== 'EACCES', // 权限错误不可重试
        retryAfter: 1000
      };
    }

    // 默认错误
    return {
      type: ErrorType.UNKNOWN_ERROR,
      message: error.message || 'Unknown error occurred',
      retryable: true,
      retryAfter: 3000,
      originalError: error
    };
  }

  /**
   * 计算重试延迟（指数退避）
   */
  static calculateRetryDelay(
    attempt: number,
    baseDelay: number = 1000,
    maxDelay: number = 30000
  ): number {
    const delay = baseDelay * Math.pow(2, attempt - 1);
    return Math.min(delay, maxDelay);
  }

  /**
   * 判断错误是否应该重试
   */
  static shouldRetry(error: DownloadError, attempt: number, maxRetries: number): boolean {
    if (attempt >= maxRetries) {
      return false;
    }

    return error.retryable;
  }

  /**
   * 格式化错误信息用于日志
   */
  static formatErrorForLog(error: DownloadError): string {
    return `[${error.type}] ${error.message}${error.code ? ` (Code: ${error.code})` : ''}`;
  }

  /**
   * 创建用户友好的错误消息
   */
  static createUserMessage(error: DownloadError): string {
    switch (error.type) {
      case ErrorType.NETWORK_ERROR:
        return '网络连接失败，请检查网络设置';
      case ErrorType.TIMEOUT_ERROR:
        return '请求超时，请稍后重试';
      case ErrorType.FILE_SYSTEM_ERROR:
        return '文件操作失败，请检查磁盘空间和权限';
      case ErrorType.AUTHENTICATION_ERROR:
        return '身份验证失败，请检查登录信息';
      case ErrorType.SERVER_ERROR:
        return '服务器错误，请稍后重试';
      default:
        return '下载过程中发生未知错误';
    }
  }
}

/**
 * 重试装饰器
 */
export function withRetry<T extends any[], R>(
  maxRetries: number = 3,
  baseDelay: number = 1000
) {
  return function (
    _target: any,
    _propertyName: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ) {
    const method = descriptor.value!;

    descriptor.value = async function (...args: T): Promise<R> {
      let lastError: DownloadError;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await method.apply(this, args);
        } catch (error) {
          lastError = ErrorHandler.analyzeError(error);

          if (!ErrorHandler.shouldRetry(lastError, attempt, maxRetries)) {
            throw lastError;
          }

          const delay = ErrorHandler.calculateRetryDelay(attempt, baseDelay);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      throw lastError!;
    };

    return descriptor;
  };
}
