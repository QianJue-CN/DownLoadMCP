import { ErrorHandler, DownloadError } from '../core/error-handler.js';

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  jitter: boolean;
  retryCondition?: (error: DownloadError) => boolean;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  jitter: true
};

export class RetryUtils {
  /**
   * 执行带重试的异步操作
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: DownloadError;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = ErrorHandler.analyzeError(error);

        // 检查是否应该重试
        if (!this.shouldRetry(lastError, attempt, config)) {
          throw lastError;
        }

        // 计算延迟并等待
        const delay = this.calculateDelay(attempt, config);
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * 判断是否应该重试
   */
  private static shouldRetry(
    error: DownloadError,
    attempt: number,
    options: RetryOptions
  ): boolean {
    // 达到最大重试次数
    if (attempt >= options.maxRetries) {
      return false;
    }

    // 自定义重试条件
    if (options.retryCondition && !options.retryCondition(error)) {
      return false;
    }

    // 默认重试条件
    return error.retryable;
  }

  /**
   * 计算重试延迟
   */
  private static calculateDelay(attempt: number, options: RetryOptions): number {
    let delay = options.baseDelay * Math.pow(options.backoffFactor, attempt - 1);

    // 应用最大延迟限制
    delay = Math.min(delay, options.maxDelay);

    // 添加抖动以避免雷群效应
    if (options.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * 睡眠函数
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 创建重试策略
   */
  static createRetryStrategy(options: Partial<RetryOptions> = {}): RetryOptions {
    return { ...DEFAULT_RETRY_OPTIONS, ...options };
  }

  /**
   * 网络操作重试策略
   */
  static networkRetryStrategy(): RetryOptions {
    return {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 15000,
      backoffFactor: 2,
      jitter: true,
      retryCondition: (error) =>
        error.retryable &&
        (error.type === 'NETWORK_ERROR' || error.type === 'TIMEOUT_ERROR')
    };
  }

  /**
   * 文件操作重试策略
   */
  static fileRetryStrategy(): RetryOptions {
    return {
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 5000,
      backoffFactor: 1.5,
      jitter: false,
      retryCondition: (error) =>
        error.retryable && error.type === 'FILE_SYSTEM_ERROR'
    };
  }

  /**
   * 服务器错误重试策略
   */
  static serverErrorRetryStrategy(): RetryOptions {
    return {
      maxRetries: 4,
      baseDelay: 2000,
      maxDelay: 20000,
      backoffFactor: 2.5,
      jitter: true,
      retryCondition: (error) =>
        error.retryable && error.type === 'SERVER_ERROR'
    };
  }
}

/**
 * 重试装饰器工厂
 */
export function retry(options: Partial<RetryOptions> = {}) {
  return function <T extends any[], R>(
    _target: any,
    _propertyName: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ) {
    const originalMethod = descriptor.value!;

    descriptor.value = async function (...args: T): Promise<R> {
      return RetryUtils.executeWithRetry(
        () => originalMethod.apply(this, args),
        options
      );
    };

    return descriptor;
  };
}

/**
 * 网络重试装饰器
 */
export function networkRetry() {
  return retry(RetryUtils.networkRetryStrategy());
}

/**
 * 文件重试装饰器
 */
export function fileRetry() {
  return retry(RetryUtils.fileRetryStrategy());
}

/**
 * 服务器错误重试装饰器
 */
export function serverErrorRetry() {
  return retry(RetryUtils.serverErrorRetryStrategy());
}
