import { EventEmitter } from 'events';
import { DownloadProgress } from '../types/download.js';

interface SpeedSample {
  timestamp: number;
  downloadedSize: number;
}

interface TaskMonitorData {
  taskId: string;
  samples: SpeedSample[];
  lastUpdate: number;
  averageSpeed: number;
  instantSpeed: number;
  eta: number;
}

export class ProgressMonitor extends EventEmitter {
  private monitoredTasks: Map<string, TaskMonitorData> = new Map();
  private updateInterval: number = 1000; // 1秒更新一次
  private maxSamples: number = 60; // 保留60个样本（1分钟的历史数据）
  private monitorTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startMonitoring();
  }

  /**
   * 开始监控任务
   */
  startMonitoringTask(taskId: string): void {
    if (this.monitoredTasks.has(taskId)) {
      return;
    }

    const monitorData: TaskMonitorData = {
      taskId,
      samples: [],
      lastUpdate: Date.now(),
      averageSpeed: 0,
      instantSpeed: 0,
      eta: 0
    };

    this.monitoredTasks.set(taskId, monitorData);
    this.emit('monitor:started', { taskId });
  }

  /**
   * 停止监控任务
   */
  stopMonitoringTask(taskId: string): void {
    if (this.monitoredTasks.has(taskId)) {
      this.monitoredTasks.delete(taskId);
      this.emit('monitor:stopped', { taskId });
    }
  }

  /**
   * 更新任务进度
   */
  updateProgress(taskId: string, progress: DownloadProgress): void {
    const monitorData = this.monitoredTasks.get(taskId);
    if (!monitorData) {
      return;
    }

    const now = Date.now();

    // 添加新的样本
    monitorData.samples.push({
      timestamp: now,
      downloadedSize: progress.downloadedSize
    });

    // 保持样本数量在限制内
    if (monitorData.samples.length > this.maxSamples) {
      monitorData.samples.shift();
    }

    // 计算速度和ETA
    this.calculateMetrics(monitorData, progress);

    monitorData.lastUpdate = now;

    // 发出更新事件
    this.emit('progress:updated', {
      taskId,
      progress: {
        ...progress,
        speed: monitorData.instantSpeed,
        eta: monitorData.eta
      },
      averageSpeed: monitorData.averageSpeed
    });
  }

  /**
   * 获取任务监控数据
   */
  getMonitorData(taskId: string): TaskMonitorData | undefined {
    return this.monitoredTasks.get(taskId);
  }

  /**
   * 获取所有监控任务的统计信息
   */
  getGlobalStats(): {
    totalTasks: number;
    totalSpeed: number;
    averageSpeed: number;
    totalDownloaded: number;
    totalSize: number;
  } {
    const tasks = Array.from(this.monitoredTasks.values());

    const totalSpeed = tasks.reduce((sum, task) => sum + task.instantSpeed, 0);
    const averageSpeed = tasks.length > 0 ? totalSpeed / tasks.length : 0;

    return {
      totalTasks: tasks.length,
      totalSpeed,
      averageSpeed,
      totalDownloaded: 0, // 需要从外部传入
      totalSize: 0 // 需要从外部传入
    };
  }

  /**
   * 格式化速度显示
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
   * 格式化文件大小显示
   */
  static formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
  }

  /**
   * 格式化时间显示
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
   * 生成进度报告
   */
  generateProgressReport(taskId: string, progress: DownloadProgress): string {
    const monitorData = this.monitoredTasks.get(taskId);
    if (!monitorData) {
      return '任务监控数据不可用';
    }

    const percentage = progress.percentage.toFixed(1);
    const downloadedSize = ProgressMonitor.formatSize(progress.downloadedSize);
    const totalSize = ProgressMonitor.formatSize(progress.totalSize);
    const speed = ProgressMonitor.formatSpeed(monitorData.instantSpeed);
    const avgSpeed = ProgressMonitor.formatSpeed(monitorData.averageSpeed);
    const eta = monitorData.eta > 0 ? ProgressMonitor.formatTime(monitorData.eta) : '计算中...';

    return `
下载进度: ${percentage}% (${downloadedSize} / ${totalSize})
当前速度: ${speed}
平均速度: ${avgSpeed}
预计剩余时间: ${eta}
活跃分段: ${progress.segments.length}
    `.trim();
  }

  /**
   * 开始监控循环
   */
  private startMonitoring(): void {
    if (this.monitorTimer) {
      return;
    }

    this.monitorTimer = setInterval(() => {
      this.performMonitoringCycle();
    }, this.updateInterval);
  }

  /**
   * 停止监控循环
   */
  private stopMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  /**
   * 执行监控周期
   */
  private performMonitoringCycle(): void {
    const now = Date.now();

    for (const [taskId, monitorData] of this.monitoredTasks) {
      // 检查任务是否长时间未更新
      if (now - monitorData.lastUpdate > 30000) { // 30秒无更新
        this.emit('monitor:stale', { taskId, lastUpdate: monitorData.lastUpdate });
      }

      // 清理过期样本
      monitorData.samples = monitorData.samples.filter(
        sample => now - sample.timestamp < 60000 // 保留1分钟内的样本
      );
    }
  }

  /**
   * 计算速度和ETA指标
   */
  private calculateMetrics(monitorData: TaskMonitorData, progress: DownloadProgress): void {
    const samples = monitorData.samples;
    if (samples.length < 2) {
      return;
    }

    // 计算瞬时速度（最近两个样本）
    const latestSample = samples[samples.length - 1];
    const previousSample = samples[samples.length - 2];

    if (!latestSample || !previousSample) {
      return;
    }

    const timeDiff = (latestSample.timestamp - previousSample.timestamp) / 1000; // 转换为秒
    const sizeDiff = latestSample.downloadedSize - previousSample.downloadedSize;

    monitorData.instantSpeed = timeDiff > 0 ? sizeDiff / timeDiff : 0;

    // 计算平均速度（所有样本）
    if (samples.length >= 2) {
      const firstSample = samples[0];
      if (firstSample) {
        const totalTimeDiff = (latestSample.timestamp - firstSample.timestamp) / 1000;
        const totalSizeDiff = latestSample.downloadedSize - firstSample.downloadedSize;

        monitorData.averageSpeed = totalTimeDiff > 0 ? totalSizeDiff / totalTimeDiff : 0;
      }
    }

    // 计算ETA
    const remainingSize = progress.totalSize - progress.downloadedSize;
    const effectiveSpeed = monitorData.instantSpeed > 0 ? monitorData.instantSpeed : monitorData.averageSpeed;

    monitorData.eta = effectiveSpeed > 0 ? remainingSize / effectiveSpeed : 0;
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.stopMonitoring();
    this.monitoredTasks.clear();
    this.removeAllListeners();
  }
}
