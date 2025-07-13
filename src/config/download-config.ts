import { DownloadConfig } from '../types/download.js';

export interface IntegrityConfig {
  enabled: boolean;
  algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512';
  expectedChecksum?: string;
  enableSegmentVerification: boolean;
  enableRealTimeVerification: boolean;
  verifyAfterMerge: boolean;
}

export interface SessionConfig {
  enabled: boolean;
  userAgent?: string;
  enableCookies: boolean;
  cookieJarPath?: string;
  maxRedirects: number;
  enableCompression: boolean;
  customHeaders?: Record<string, string>;
  proxyUrl?: string;
}

export interface SegmentationConfig {
  enableSmartSegmentation: boolean;
  minChunkSize: number;
  maxChunkSize: number;
  optimalChunkSize: number;
  enableDynamicRebalancing: boolean;
  networkSpeedThreshold: number; // bytes per second
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  enableJitter: boolean;
  retryOnNetworkError: boolean;
  retryOnServerError: boolean;
  retryOnTimeout: boolean;
}

export interface MonitoringConfig {
  enabled: boolean;
  enablePerformanceTracking: boolean;
  enableSpeedHistory: boolean;
  speedHistorySize: number;
  enableDetailedLogging: boolean;
  reportInterval: number; // milliseconds
}

export interface AdvancedConfig {
  enableWorkerPool: boolean;
  workerPoolSize?: number;
  enableMemoryOptimization: boolean;
  enableDiskCache: boolean;
  diskCacheSize: number; // bytes
  enableBandwidthControl: boolean;
  maxBandwidth?: number; // bytes per second
}

export interface ExtendedDownloadConfig extends DownloadConfig {
  // 核心配置保持不变
  // url: string;
  // outputPath: string;
  // maxConcurrency: number;
  // timeout: number;
  // retryCount: number;
  // headers?: Record<string, string>;

  // 新增配置选项
  integrity?: IntegrityConfig;
  session?: SessionConfig;
  segmentation?: SegmentationConfig;
  retry?: RetryConfig;
  monitoring?: MonitoringConfig;
  advanced?: AdvancedConfig;

  // 兼容性和功能开关
  enableAdvancedFeatures?: boolean;
  configVersion?: string;
}

export class DownloadConfigManager {
  private static readonly CONFIG_VERSION = '2.0';
  private static readonly DEFAULT_CONFIG: Partial<ExtendedDownloadConfig> = {
    configVersion: this.CONFIG_VERSION,
    enableAdvancedFeatures: false,

    integrity: {
      enabled: false,
      algorithm: 'sha256',
      enableSegmentVerification: false,
      enableRealTimeVerification: false,
      verifyAfterMerge: true
    },

    session: {
      enabled: false,
      enableCookies: true,
      maxRedirects: 5,
      enableCompression: true
    },

    segmentation: {
      enableSmartSegmentation: false,
      minChunkSize: 100 * 1024, // 100KB
      maxChunkSize: 10 * 1024 * 1024, // 10MB
      optimalChunkSize: 1024 * 1024, // 1MB
      enableDynamicRebalancing: false,
      networkSpeedThreshold: 1024 * 1024 // 1MB/s
    },

    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      enableJitter: true,
      retryOnNetworkError: true,
      retryOnServerError: true,
      retryOnTimeout: true
    },

    monitoring: {
      enabled: false,
      enablePerformanceTracking: false,
      enableSpeedHistory: false,
      speedHistorySize: 100,
      enableDetailedLogging: false,
      reportInterval: 1000
    },

    advanced: {
      enableWorkerPool: false,
      enableMemoryOptimization: false,
      enableDiskCache: false,
      diskCacheSize: 100 * 1024 * 1024, // 100MB
      enableBandwidthControl: false
    }
  };

  /**
   * 创建默认配置
   */
  static createDefaultConfig(baseConfig: DownloadConfig): ExtendedDownloadConfig {
    return {
      ...baseConfig,
      ...this.DEFAULT_CONFIG
    } as ExtendedDownloadConfig;
  }

  /**
   * 合并配置
   */
  static mergeConfig(
    baseConfig: DownloadConfig,
    extendedConfig: Partial<ExtendedDownloadConfig>
  ): ExtendedDownloadConfig {
    const defaultConfig = this.createDefaultConfig(baseConfig);

    return {
      ...defaultConfig,
      ...extendedConfig,
      integrity: {
        ...defaultConfig.integrity!,
        ...extendedConfig.integrity
      },
      session: {
        ...defaultConfig.session!,
        ...extendedConfig.session
      },
      segmentation: {
        ...defaultConfig.segmentation!,
        ...extendedConfig.segmentation
      },
      retry: {
        ...defaultConfig.retry!,
        ...extendedConfig.retry
      },
      monitoring: {
        ...defaultConfig.monitoring!,
        ...extendedConfig.monitoring
      },
      advanced: {
        ...defaultConfig.advanced!,
        ...extendedConfig.advanced
      }
    };
  }

  /**
   * 验证配置
   */
  static validateConfig(config: ExtendedDownloadConfig): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 基础配置验证
    if (!config.url) {
      errors.push('URL is required');
    }

    if (!config.outputPath) {
      errors.push('Output path is required');
    }

    if (config.maxConcurrency <= 0) {
      errors.push('Max concurrency must be greater than 0');
    }

    if (config.timeout <= 0) {
      errors.push('Timeout must be greater than 0');
    }

    // 分段配置验证
    if (config.segmentation?.enableSmartSegmentation) {
      const seg = config.segmentation;
      if (seg.minChunkSize >= seg.maxChunkSize) {
        errors.push('Min chunk size must be less than max chunk size');
      }

      if (seg.optimalChunkSize < seg.minChunkSize || seg.optimalChunkSize > seg.maxChunkSize) {
        warnings.push('Optimal chunk size should be between min and max chunk size');
      }
    }

    // 重试配置验证
    if (config.retry) {
      const retry = config.retry;
      if (retry.maxRetries < 0) {
        errors.push('Max retries cannot be negative');
      }

      if (retry.baseDelay <= 0) {
        errors.push('Base delay must be greater than 0');
      }

      if (retry.maxDelay < retry.baseDelay) {
        errors.push('Max delay must be greater than or equal to base delay');
      }

      if (retry.backoffFactor <= 1) {
        warnings.push('Backoff factor should be greater than 1 for exponential backoff');
      }
    }

    // 完整性验证配置
    if (config.integrity?.enabled) {
      const supportedAlgorithms = ['md5', 'sha1', 'sha256', 'sha512'];
      if (!supportedAlgorithms.includes(config.integrity.algorithm)) {
        errors.push(`Unsupported hash algorithm: ${config.integrity.algorithm}`);
      }
    }

    // 会话配置验证
    if (config.session?.enabled) {
      if (config.session.maxRedirects < 0) {
        errors.push('Max redirects cannot be negative');
      }

      if (config.session.cookieJarPath && !config.session.enableCookies) {
        warnings.push('Cookie jar path specified but cookies are disabled');
      }
    }

    // 高级配置验证
    if (config.advanced?.enableBandwidthControl && !config.advanced.maxBandwidth) {
      warnings.push('Bandwidth control enabled but no max bandwidth specified');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 升级配置版本
   */
  static upgradeConfig(config: any): ExtendedDownloadConfig {
    // 如果没有版本信息，假设是旧版本
    if (!config.configVersion) {
      return this.upgradeFromV1(config);
    }

    // 根据版本进行升级
    switch (config.configVersion) {
      case '1.0':
        return this.upgradeFromV1(config);
      case '2.0':
        return config as ExtendedDownloadConfig;
      default:
        // 未知版本，使用默认配置
        return this.createDefaultConfig(config);
    }
  }

  /**
   * 从V1升级到V2
   */
  private static upgradeFromV1(v1Config: any): ExtendedDownloadConfig {
    const baseConfig: DownloadConfig = {
      url: v1Config.url,
      outputPath: v1Config.outputPath,
      maxConcurrency: v1Config.maxConcurrency || 4,
      chunkSize: v1Config.chunkSize || 1024 * 1024,
      timeout: v1Config.timeout || 30000,
      retryCount: v1Config.retryCount || 3,
      workMode: v1Config.workMode || 'blocking',
      enableResume: v1Config.enableResume !== false,
      filename: v1Config.filename,
      headers: v1Config.headers,
      sessionId: v1Config.sessionId
    };

    const extendedConfig: Partial<ExtendedDownloadConfig> = {
      enableAdvancedFeatures: false,
      configVersion: this.CONFIG_VERSION
    };

    // 迁移旧的重试配置
    if (v1Config.retryCount) {
      extendedConfig.retry = {
        ...this.DEFAULT_CONFIG.retry!,
        maxRetries: v1Config.retryCount
      };
    }

    return this.mergeConfig(baseConfig, extendedConfig);
  }

  /**
   * 导出配置为JSON
   */
  static exportConfig(config: ExtendedDownloadConfig): string {
    return JSON.stringify(config, null, 2);
  }

  /**
   * 从JSON导入配置
   */
  static importConfig(jsonString: string): ExtendedDownloadConfig {
    try {
      const config = JSON.parse(jsonString);
      return this.upgradeConfig(config);
    } catch (error) {
      throw new Error(`Invalid configuration JSON: ${(error as Error).message}`);
    }
  }

  /**
   * 创建配置模板
   */
  static createConfigTemplate(): ExtendedDownloadConfig {
    return {
      url: 'https://example.com/file.zip',
      outputPath: './downloads/file.zip',
      maxConcurrency: 4,
      timeout: 30000,
      retryCount: 3,
      headers: {
        'User-Agent': 'Download Manager 2.0'
      },
      ...this.DEFAULT_CONFIG
    } as ExtendedDownloadConfig;
  }
}
