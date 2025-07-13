export interface PerformanceMetrics {
  taskId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  totalSize: number;
  downloadedSize: number;
  averageSpeed: number;
  currentSpeed: number;
  peakSpeed: number;
  connectionCount: number;
  retryCount: number;
  errorCount: number;
  segmentMetrics: SegmentMetrics[];
}

export interface SegmentMetrics {
  segmentId: string;
  startTime: number;
  endTime?: number;
  size: number;
  downloadedSize: number;
  speed: number;
  retryCount: number;
  errorCount: number;
}

export interface SpeedSample {
  timestamp: number;
  speed: number;
  downloadedSize: number;
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private speedSamples: Map<string, SpeedSample[]> = new Map();
  private segmentMetrics: Map<string, Map<string, SegmentMetrics>> = new Map();
  private readonly maxSamples = 100; // 保留最近100个速度样本

  /**
   * 开始监控任务
   */
  startTask(taskId: string, totalSize: number, connectionCount: number): void {
    const metrics: PerformanceMetrics = {
      taskId,
      startTime: Date.now(),
      totalSize,
      downloadedSize: 0,
      averageSpeed: 0,
      currentSpeed: 0,
      peakSpeed: 0,
      connectionCount,
      retryCount: 0,
      errorCount: 0,
      segmentMetrics: []
    };

    this.metrics.set(taskId, metrics);
    this.speedSamples.set(taskId, []);
    this.segmentMetrics.set(taskId, new Map());
  }

  /**
   * 开始监控分段
   */
  startSegment(taskId: string, segmentId: string, size: number): void {
    const taskSegments = this.segmentMetrics.get(taskId);
    if (!taskSegments) return;

    const segmentMetric: SegmentMetrics = {
      segmentId,
      startTime: Date.now(),
      size,
      downloadedSize: 0,
      speed: 0,
      retryCount: 0,
      errorCount: 0
    };

    taskSegments.set(segmentId, segmentMetric);
  }

  /**
   * 更新下载进度
   */
  updateProgress(
    taskId: string,
    downloadedSize: number,
    segmentId?: string,
    segmentDownloaded?: number
  ): void {
    const metrics = this.metrics.get(taskId);
    if (!metrics) return;

    const now = Date.now();
    const timeDiff = (now - metrics.startTime) / 1000; // 秒

    // 更新任务级别指标
    metrics.downloadedSize = downloadedSize;
    metrics.averageSpeed = timeDiff > 0 ? downloadedSize / timeDiff : 0;

    // 计算当前速度
    const samples = this.speedSamples.get(taskId)!;
    const currentSpeed = this.calculateCurrentSpeed(samples, downloadedSize, now);
    metrics.currentSpeed = currentSpeed;

    // 更新峰值速度
    if (currentSpeed > metrics.peakSpeed) {
      metrics.peakSpeed = currentSpeed;
    }

    // 添加速度样本
    this.addSpeedSample(taskId, now, currentSpeed, downloadedSize);

    // 更新分段指标
    if (segmentId && segmentDownloaded !== undefined) {
      this.updateSegmentProgress(taskId, segmentId, segmentDownloaded);
    }
  }

  /**
   * 记录重试
   */
  recordRetry(taskId: string, segmentId?: string): void {
    const metrics = this.metrics.get(taskId);
    if (!metrics) return;

    metrics.retryCount++;

    if (segmentId) {
      const taskSegments = this.segmentMetrics.get(taskId);
      const segmentMetric = taskSegments?.get(segmentId);
      if (segmentMetric) {
        segmentMetric.retryCount++;
      }
    }
  }

  /**
   * 记录错误
   */
  recordError(taskId: string, segmentId?: string): void {
    const metrics = this.metrics.get(taskId);
    if (!metrics) return;

    metrics.errorCount++;

    if (segmentId) {
      const taskSegments = this.segmentMetrics.get(taskId);
      const segmentMetric = taskSegments?.get(segmentId);
      if (segmentMetric) {
        segmentMetric.errorCount++;
      }
    }
  }

  /**
   * 完成任务监控
   */
  finishTask(taskId: string): PerformanceMetrics | null {
    const metrics = this.metrics.get(taskId);
    if (!metrics) return null;

    const now = Date.now();
    metrics.endTime = now;
    metrics.duration = now - metrics.startTime;

    // 收集分段指标
    const taskSegments = this.segmentMetrics.get(taskId);
    if (taskSegments) {
      metrics.segmentMetrics = Array.from(taskSegments.values());
    }

    return metrics;
  }

  /**
   * 完成分段监控
   */
  finishSegment(taskId: string, segmentId: string): void {
    const taskSegments = this.segmentMetrics.get(taskId);
    const segmentMetric = taskSegments?.get(segmentId);
    if (!segmentMetric) return;

    segmentMetric.endTime = Date.now();
    const duration = (segmentMetric.endTime - segmentMetric.startTime) / 1000;
    segmentMetric.speed = duration > 0 ? segmentMetric.downloadedSize / duration : 0;
  }

  /**
   * 获取任务指标
   */
  getMetrics(taskId: string): PerformanceMetrics | null {
    return this.metrics.get(taskId) || null;
  }

  /**
   * 获取速度历史
   */
  getSpeedHistory(taskId: string): SpeedSample[] {
    return this.speedSamples.get(taskId) || [];
  }

  /**
   * 清理任务数据
   */
  cleanup(taskId: string): void {
    this.metrics.delete(taskId);
    this.speedSamples.delete(taskId);
    this.segmentMetrics.delete(taskId);
  }

  /**
   * 获取性能报告
   */
  generateReport(taskId: string): string {
    const metrics = this.metrics.get(taskId);
    if (!metrics) return 'No metrics found';

    const duration = metrics.duration || (Date.now() - metrics.startTime);
    const durationSec = duration / 1000;
    const durationMin = durationSec / 60;

    const report = [
      `Performance Report for Task: ${taskId}`,
      `=====================================`,
      `Duration: ${durationMin.toFixed(2)} minutes (${durationSec.toFixed(2)} seconds)`,
      `Total Size: ${this.formatBytes(metrics.totalSize)}`,
      `Downloaded: ${this.formatBytes(metrics.downloadedSize)}`,
      `Progress: ${((metrics.downloadedSize / metrics.totalSize) * 100).toFixed(2)}%`,
      `Average Speed: ${this.formatSpeed(metrics.averageSpeed)}`,
      `Current Speed: ${this.formatSpeed(metrics.currentSpeed)}`,
      `Peak Speed: ${this.formatSpeed(metrics.peakSpeed)}`,
      `Connections: ${metrics.connectionCount}`,
      `Retries: ${metrics.retryCount}`,
      `Errors: ${metrics.errorCount}`,
      ``,
      `Segment Performance:`,
      `-------------------`
    ];

    for (const segment of metrics.segmentMetrics) {
      const segmentDuration = segment.endTime
        ? (segment.endTime - segment.startTime) / 1000
        : (Date.now() - segment.startTime) / 1000;

      report.push(
        `${segment.segmentId}: ${this.formatBytes(segment.downloadedSize)}/${this.formatBytes(segment.size)} ` +
        `(${this.formatSpeed(segment.speed)}, ${segmentDuration.toFixed(1)}s, ${segment.retryCount} retries)`
      );
    }

    return report.join('\n');
  }

  /**
   * 计算当前速度
   */
  private calculateCurrentSpeed(
    samples: SpeedSample[],
    currentDownloaded: number,
    currentTime: number
  ): number {
    if (samples.length === 0) {
      return 0;
    }

    // 使用最近5秒的数据计算当前速度
    const recentSamples = samples.filter(s => currentTime - s.timestamp <= 5000);

    if (recentSamples.length < 2) {
      return 0;
    }

    const oldest = recentSamples[0];
    if (!oldest) {
      return 0;
    }

    const timeDiff = (currentTime - oldest.timestamp) / 1000;
    const sizeDiff = currentDownloaded - oldest.downloadedSize;

    return timeDiff > 0 ? sizeDiff / timeDiff : 0;
  }

  /**
   * 添加速度样本
   */
  private addSpeedSample(
    taskId: string,
    timestamp: number,
    speed: number,
    downloadedSize: number
  ): void {
    const samples = this.speedSamples.get(taskId)!;

    samples.push({ timestamp, speed, downloadedSize });

    // 保持样本数量在限制内
    if (samples.length > this.maxSamples) {
      samples.shift();
    }
  }

  /**
   * 更新分段进度
   */
  private updateSegmentProgress(
    taskId: string,
    segmentId: string,
    downloadedSize: number
  ): void {
    const taskSegments = this.segmentMetrics.get(taskId);
    const segmentMetric = taskSegments?.get(segmentId);
    if (!segmentMetric) return;

    segmentMetric.downloadedSize = downloadedSize;

    const now = Date.now();
    const duration = (now - segmentMetric.startTime) / 1000;
    segmentMetric.speed = duration > 0 ? downloadedSize / duration : 0;
  }

  /**
   * 格式化字节数
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * 格式化速度
   */
  private formatSpeed(bytesPerSecond: number): string {
    return `${this.formatBytes(bytesPerSecond)}/s`;
  }
}
