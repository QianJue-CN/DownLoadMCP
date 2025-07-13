import { DownloadSegment, DownloadStatus } from '../types/download.js';

export interface SegmentCalculationOptions {
  totalSize: number;
  maxConcurrency: number;
  networkSpeed?: number; // bytes per second
  minChunkSize?: number;
  maxChunkSize?: number;
  optimalChunkSize?: number;
  enableDynamicAdjustment?: boolean;
}

export interface NetworkCondition {
  averageSpeed: number; // bytes per second
  latency: number; // milliseconds
  stability: number; // 0-1, 1 is most stable
  connectionQuality: 'poor' | 'fair' | 'good' | 'excellent';
}

export class SegmentCalculator {
  private static readonly MIN_CHUNK_SIZE = 100 * 1024; // 100KB
  private static readonly MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly OPTIMAL_CHUNK_SIZE = 1024 * 1024; // 1MB
  private static readonly SMALL_FILE_THRESHOLD = 1024 * 1024; // 1MB
  private static readonly LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB

  /**
   * 计算下载分段
   */
  static calculateSegments(
    options: SegmentCalculationOptions,
    outputPath: string
  ): DownloadSegment[] {
    const {
      totalSize,
      maxConcurrency,
      networkSpeed,
      minChunkSize = this.MIN_CHUNK_SIZE,
      maxChunkSize = this.MAX_CHUNK_SIZE,
      optimalChunkSize = this.OPTIMAL_CHUNK_SIZE
    } = options;

    // 计算最优连接数
    const optimalConnections = this.calculateOptimalConnections(
      totalSize,
      maxConcurrency,
      networkSpeed
    );

    // 计算分块大小
    const chunkSize = this.calculateChunkSize(
      totalSize,
      optimalConnections,
      minChunkSize,
      maxChunkSize,
      optimalChunkSize
    );

    // 生成分段
    return this.generateSegments(
      totalSize,
      optimalConnections,
      chunkSize,
      outputPath
    );
  }

  /**
   * 计算最优连接数
   */
  private static calculateOptimalConnections(
    totalSize: number,
    maxConcurrency: number,
    networkSpeed?: number
  ): number {
    // 小文件使用单连接
    if (totalSize < this.SMALL_FILE_THRESHOLD) {
      return 1;
    }

    // 基于文件大小的连接数
    let sizeBasedConnections: number;
    if (totalSize < this.LARGE_FILE_THRESHOLD) {
      // 中等文件：1MB per connection
      sizeBasedConnections = Math.ceil(totalSize / (1024 * 1024));
    } else {
      // 大文件：10MB per connection
      sizeBasedConnections = Math.ceil(totalSize / (10 * 1024 * 1024));
    }

    // 限制在最大并发数内
    sizeBasedConnections = Math.min(sizeBasedConnections, maxConcurrency);

    // 基于网络速度的调整
    if (networkSpeed) {
      const speedBasedConnections = this.calculateSpeedBasedConnections(
        networkSpeed,
        totalSize
      );
      return Math.min(sizeBasedConnections, speedBasedConnections);
    }

    return sizeBasedConnections;
  }

  /**
   * 基于网络速度计算连接数
   */
  private static calculateSpeedBasedConnections(
    networkSpeed: number,
    totalSize: number
  ): number {
    // 网络速度分类
    if (networkSpeed < 100 * 1024) { // < 100KB/s
      return Math.min(2, Math.ceil(totalSize / (5 * 1024 * 1024))); // 慢速网络，少连接
    } else if (networkSpeed < 1024 * 1024) { // < 1MB/s
      return Math.min(4, Math.ceil(totalSize / (2 * 1024 * 1024))); // 中速网络
    } else if (networkSpeed < 10 * 1024 * 1024) { // < 10MB/s
      return Math.min(8, Math.ceil(totalSize / (1024 * 1024))); // 高速网络
    } else {
      return Math.min(16, Math.ceil(totalSize / (512 * 1024))); // 超高速网络
    }
  }

  /**
   * 计算分块大小
   */
  private static calculateChunkSize(
    totalSize: number,
    connections: number,
    minChunkSize: number,
    maxChunkSize: number,
    optimalChunkSize: number
  ): number {
    const baseChunkSize = Math.floor(totalSize / connections);

    // 确保分块大小在合理范围内
    let chunkSize = Math.max(minChunkSize, Math.min(maxChunkSize, baseChunkSize));

    // 对于大文件，倾向于使用较大的分块
    if (totalSize > this.LARGE_FILE_THRESHOLD) {
      chunkSize = Math.max(chunkSize, optimalChunkSize);
    }

    return chunkSize;
  }

  /**
   * 生成下载分段
   */
  private static generateSegments(
    totalSize: number,
    connections: number,
    chunkSize: number,
    outputPath: string
  ): DownloadSegment[] {
    const segments: DownloadSegment[] = [];
    let currentPos = 0;

    for (let i = 0; i < connections; i++) {
      const start = currentPos;
      const end = i === connections - 1
        ? totalSize - 1
        : Math.min(currentPos + chunkSize - 1, totalSize - 1);

      segments.push({
        id: `segment_${i}`,
        start,
        end,
        downloaded: 0,
        status: DownloadStatus.PENDING,
        filePath: `${outputPath}.part${i}`,
        checksum: '',
        retryCount: 0
      });

      currentPos = end + 1;
    }

    return segments;
  }

  /**
   * 动态重新分配分段
   */
  static rebalanceSegments(
    segments: DownloadSegment[],
    networkCondition?: NetworkCondition
  ): DownloadSegment[] {
    const activeSegments = segments.filter(s =>
      s.status === DownloadStatus.DOWNLOADING &&
      (s.end - s.start - s.downloaded) > this.MIN_CHUNK_SIZE
    );

    const completedSegments = segments.filter(s =>
      s.status === DownloadStatus.COMPLETED
    );

    const failedSegments = segments.filter(s =>
      s.status === DownloadStatus.FAILED
    );

    // 如果有失败的分段，优先处理
    if (failedSegments.length > 0) {
      return this.redistributeFailedSegments(segments, failedSegments);
    }

    // 如果网络条件良好且有空闲容量，分割大分段
    if (networkCondition?.connectionQuality === 'excellent' && completedSegments.length > 0) {
      return this.splitLargeSegments(segments, activeSegments);
    }

    return segments;
  }

  /**
   * 重新分配失败的分段
   */
  private static redistributeFailedSegments(
    segments: DownloadSegment[],
    failedSegments: DownloadSegment[]
  ): DownloadSegment[] {
    const newSegments = [...segments];

    for (const failedSegment of failedSegments) {
      // 重置失败分段的状态
      failedSegment.status = DownloadStatus.PENDING;
      failedSegment.downloaded = 0;
      failedSegment.retryCount = (failedSegment.retryCount || 0) + 1;

      // 如果重试次数过多，分割成更小的分段
      if (failedSegment.retryCount > 3) {
        const splitSegments = this.splitSegment(failedSegment, 2);
        const index = newSegments.indexOf(failedSegment);
        newSegments.splice(index, 1, ...splitSegments);
      }
    }

    return newSegments;
  }

  /**
   * 分割大分段
   */
  private static splitLargeSegments(
    segments: DownloadSegment[],
    activeSegments: DownloadSegment[]
  ): DownloadSegment[] {
    if (activeSegments.length === 0) return segments;

    // 找到最大的活跃分段
    const largestSegment = activeSegments.reduce((prev, current) => {
      const prevRemaining = prev.end - prev.start - prev.downloaded;
      const currentRemaining = current.end - current.start - current.downloaded;
      return currentRemaining > prevRemaining ? current : prev;
    });

    const remainingSize = largestSegment.end - largestSegment.start - largestSegment.downloaded;

    // 只有当剩余大小足够大时才分割
    if (remainingSize > this.MIN_CHUNK_SIZE * 2) {
      const newSegments = [...segments];
      const splitSegments = this.splitSegment(largestSegment, 2);
      const index = newSegments.indexOf(largestSegment);
      newSegments.splice(index, 1, ...splitSegments);
      return newSegments;
    }

    return segments;
  }

  /**
   * 分割单个分段
   */
  private static splitSegment(
    segment: DownloadSegment,
    parts: number
  ): DownloadSegment[] {
    const totalSize = segment.end - segment.start + 1;
    const partSize = Math.floor(totalSize / parts);
    const splitSegments: DownloadSegment[] = [];

    for (let i = 0; i < parts; i++) {
      const start = segment.start + i * partSize;
      const end = i === parts - 1
        ? segment.end
        : segment.start + (i + 1) * partSize - 1;

      splitSegments.push({
        id: `${segment.id}_split_${i}`,
        start,
        end,
        downloaded: 0,
        status: DownloadStatus.PENDING,
        filePath: `${segment.filePath}_split_${i}`,
        checksum: '',
        retryCount: 0
      });
    }

    return splitSegments;
  }

  /**
   * 评估网络条件
   */
  static evaluateNetworkCondition(
    speedHistory: number[],
    latencyHistory: number[]
  ): NetworkCondition {
    if (speedHistory.length === 0) {
      return {
        averageSpeed: 0,
        latency: 0,
        stability: 0,
        connectionQuality: 'poor'
      };
    }

    const averageSpeed = speedHistory.reduce((a, b) => a + b, 0) / speedHistory.length;
    const averageLatency = latencyHistory.length > 0
      ? latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length
      : 100;

    // 计算速度稳定性（变异系数的倒数）
    const speedVariance = this.calculateVariance(speedHistory);
    const speedStdDev = Math.sqrt(speedVariance);
    const coefficientOfVariation = speedStdDev / averageSpeed;
    const stability = Math.max(0, 1 - coefficientOfVariation);

    // 评估连接质量
    let connectionQuality: NetworkCondition['connectionQuality'];
    if (averageSpeed > 5 * 1024 * 1024 && averageLatency < 50 && stability > 0.8) {
      connectionQuality = 'excellent';
    } else if (averageSpeed > 1024 * 1024 && averageLatency < 100 && stability > 0.6) {
      connectionQuality = 'good';
    } else if (averageSpeed > 100 * 1024 && averageLatency < 200 && stability > 0.4) {
      connectionQuality = 'fair';
    } else {
      connectionQuality = 'poor';
    }

    return {
      averageSpeed,
      latency: averageLatency,
      stability,
      connectionQuality
    };
  }

  /**
   * 计算方差
   */
  private static calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }
}
