import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

export interface PerformanceMetrics {
  timestamp: number;
  downloadSpeed: number; // bytes/second
  connectionCount: number;
  activeConnections: number;
  errorRate: number;
  latency: number;
  throughput: number;
  cpuUsage: number;
  memoryUsage: number;
  networkUtilization: number;
}

export interface BottleneckAnalysis {
  type: 'network' | 'cpu' | 'memory' | 'disk' | 'connection' | 'server';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: number; // 0.0 - 1.0
  suggestions: string[];
  metrics: Record<string, number>;
}

export interface OptimizationSuggestion {
  category: 'connection' | 'bandwidth' | 'retry' | 'timeout' | 'chunking';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  expectedImprovement: string;
  implementation: string;
  parameters?: Record<string, any>;
}

export interface PerformanceReport {
  taskId: string;
  duration: number;
  totalBytes: number;
  averageSpeed: number;
  peakSpeed: number;
  efficiency: number;
  bottlenecks: BottleneckAnalysis[];
  suggestions: OptimizationSuggestion[];
  metrics: PerformanceMetrics[];
  summary: {
    overallRating: 'poor' | 'fair' | 'good' | 'excellent';
    keyFindings: string[];
    recommendations: string[];
  };
}

export interface PerformanceConfig {
  metricsInterval: number;
  historySize: number;
  enableCpuMonitoring: boolean;
  enableMemoryMonitoring: boolean;
  enableNetworkMonitoring: boolean;
  bottleneckThresholds: {
    lowSpeed: number; // bytes/s
    highErrorRate: number; // 0.0 - 1.0
    highLatency: number; // ms
    highCpuUsage: number; // 0.0 - 1.0
    highMemoryUsage: number; // 0.0 - 1.0
  };
}

export class PerformanceAnalyzer extends EventEmitter {
  private config: PerformanceConfig;
  private metricsHistory: Map<string, PerformanceMetrics[]> = new Map();
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private taskStartTimes: Map<string, number> = new Map();
  private taskMetrics: Map<string, any> = new Map();

  constructor(config: Partial<PerformanceConfig> = {}) {
    super();

    this.config = {
      metricsInterval: 1000, // 1 second
      historySize: 1000,
      enableCpuMonitoring: true,
      enableMemoryMonitoring: true,
      enableNetworkMonitoring: true,
      bottleneckThresholds: {
        lowSpeed: 100000, // 100KB/s
        highErrorRate: 0.1, // 10%
        highLatency: 1000, // 1 second
        highCpuUsage: 0.8, // 80%
        highMemoryUsage: 0.9 // 90%
      },
      ...config
    };
  }

  /**
   * Start monitoring performance for a task
   */
  startMonitoring(taskId: string): void {
    this.taskStartTimes.set(taskId, performance.now());
    this.metricsHistory.set(taskId, []);

    const interval = setInterval(() => {
      this.collectMetrics(taskId);
    }, this.config.metricsInterval);

    this.monitoringIntervals.set(taskId, interval);

    this.emit('monitoringStarted', { taskId });
  }

  /**
   * Stop monitoring performance for a task
   */
  stopMonitoring(taskId: string): void {
    const interval = this.monitoringIntervals.get(taskId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(taskId);
    }

    this.emit('monitoringStopped', { taskId });
  }

  /**
   * Collect performance metrics
   */
  private async collectMetrics(taskId: string): Promise<void> {
    const metrics: PerformanceMetrics = {
      timestamp: Date.now(),
      downloadSpeed: this.getCurrentDownloadSpeed(taskId),
      connectionCount: this.getConnectionCount(taskId),
      activeConnections: this.getActiveConnectionCount(taskId),
      errorRate: this.getErrorRate(taskId),
      latency: this.getAverageLatency(taskId),
      throughput: this.getThroughput(taskId),
      cpuUsage: this.config.enableCpuMonitoring ? await this.getCpuUsage() : 0,
      memoryUsage: this.config.enableMemoryMonitoring ? this.getMemoryUsage() : 0,
      networkUtilization: this.config.enableNetworkMonitoring ? this.getNetworkUtilization(taskId) : 0
    };

    const history = this.metricsHistory.get(taskId) || [];
    history.push(metrics);

    // Limit history size
    if (history.length > this.config.historySize) {
      history.shift();
    }

    this.metricsHistory.set(taskId, history);

    this.emit('metricsCollected', { taskId, metrics });
  }

  /**
   * Update task metrics
   */
  updateTaskMetrics(taskId: string, metrics: Partial<any>): void {
    const current = this.taskMetrics.get(taskId) || {};
    this.taskMetrics.set(taskId, { ...current, ...metrics });
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport(taskId: string): PerformanceReport {
    const startTime = this.taskStartTimes.get(taskId);
    const metrics = this.metricsHistory.get(taskId) || [];
    const taskData = this.taskMetrics.get(taskId) || {};

    if (!startTime || metrics.length === 0) {
      throw new Error(`No performance data available for task ${taskId}`);
    }

    const duration = performance.now() - startTime;
    const totalBytes = taskData.totalBytes || 0;
    const averageSpeed = this.calculateAverageSpeed(metrics);
    const peakSpeed = this.calculatePeakSpeed(metrics);
    const efficiency = this.calculateEfficiency(metrics);

    const bottlenecks = this.analyzeBottlenecks(metrics);
    const suggestions = this.generateOptimizationSuggestions(metrics, bottlenecks);

    const overallRating = this.calculateOverallRating(efficiency, bottlenecks);
    const keyFindings = this.extractKeyFindings(metrics, bottlenecks);
    const recommendations = this.generateRecommendations(suggestions);

    return {
      taskId,
      duration,
      totalBytes,
      averageSpeed,
      peakSpeed,
      efficiency,
      bottlenecks,
      suggestions,
      metrics,
      summary: {
        overallRating,
        keyFindings,
        recommendations
      }
    };
  }

  /**
   * Analyze performance bottlenecks
   */
  private analyzeBottlenecks(metrics: PerformanceMetrics[]): BottleneckAnalysis[] {
    const bottlenecks: BottleneckAnalysis[] = [];

    if (metrics.length === 0) return bottlenecks;

    // Analyze network bottlenecks
    const avgSpeed = metrics.reduce((sum, m) => sum + m.downloadSpeed, 0) / metrics.length;
    if (avgSpeed < this.config.bottleneckThresholds.lowSpeed) {
      bottlenecks.push({
        type: 'network',
        severity: avgSpeed < this.config.bottleneckThresholds.lowSpeed * 0.5 ? 'high' : 'medium',
        description: 'Low download speed detected',
        impact: 1 - (avgSpeed / this.config.bottleneckThresholds.lowSpeed),
        suggestions: [
          'Increase connection count',
          'Check network connectivity',
          'Consider using a different server'
        ],
        metrics: { averageSpeed: avgSpeed, threshold: this.config.bottleneckThresholds.lowSpeed }
      });
    }

    // Analyze error rate bottlenecks
    const avgErrorRate = metrics.reduce((sum, m) => sum + m.errorRate, 0) / metrics.length;
    if (avgErrorRate > this.config.bottleneckThresholds.highErrorRate) {
      bottlenecks.push({
        type: 'connection',
        severity: avgErrorRate > this.config.bottleneckThresholds.highErrorRate * 2 ? 'critical' : 'high',
        description: 'High error rate affecting performance',
        impact: avgErrorRate,
        suggestions: [
          'Reduce connection count',
          'Increase retry timeout',
          'Check server stability'
        ],
        metrics: { errorRate: avgErrorRate, threshold: this.config.bottleneckThresholds.highErrorRate }
      });
    }

    // Analyze latency bottlenecks
    const avgLatency = metrics.reduce((sum, m) => sum + m.latency, 0) / metrics.length;
    if (avgLatency > this.config.bottleneckThresholds.highLatency) {
      bottlenecks.push({
        type: 'network',
        severity: avgLatency > this.config.bottleneckThresholds.highLatency * 2 ? 'high' : 'medium',
        description: 'High latency affecting responsiveness',
        impact: Math.min(1, avgLatency / (this.config.bottleneckThresholds.highLatency * 2)),
        suggestions: [
          'Use servers closer to your location',
          'Optimize connection timeout',
          'Consider connection pooling'
        ],
        metrics: { latency: avgLatency, threshold: this.config.bottleneckThresholds.highLatency }
      });
    }

    // Analyze CPU bottlenecks
    if (this.config.enableCpuMonitoring) {
      const avgCpuUsage = metrics.reduce((sum, m) => sum + m.cpuUsage, 0) / metrics.length;
      if (avgCpuUsage > this.config.bottleneckThresholds.highCpuUsage) {
        bottlenecks.push({
          type: 'cpu',
          severity: avgCpuUsage > 0.95 ? 'critical' : 'high',
          description: 'High CPU usage limiting performance',
          impact: avgCpuUsage,
          suggestions: [
            'Reduce concurrent connections',
            'Optimize chunk processing',
            'Consider hardware upgrade'
          ],
          metrics: { cpuUsage: avgCpuUsage, threshold: this.config.bottleneckThresholds.highCpuUsage }
        });
      }
    }

    // Analyze memory bottlenecks
    if (this.config.enableMemoryMonitoring) {
      const avgMemoryUsage = metrics.reduce((sum, m) => sum + m.memoryUsage, 0) / metrics.length;
      if (avgMemoryUsage > this.config.bottleneckThresholds.highMemoryUsage) {
        bottlenecks.push({
          type: 'memory',
          severity: avgMemoryUsage > 0.98 ? 'critical' : 'high',
          description: 'High memory usage may cause instability',
          impact: avgMemoryUsage,
          suggestions: [
            'Reduce chunk size',
            'Limit concurrent downloads',
            'Implement memory cleanup'
          ],
          metrics: { memoryUsage: avgMemoryUsage, threshold: this.config.bottleneckThresholds.highMemoryUsage }
        });
      }
    }

    return bottlenecks.sort((a, b) => b.impact - a.impact);
  }

  /**
   * Generate optimization suggestions
   */
  private generateOptimizationSuggestions(
    metrics: PerformanceMetrics[],
    bottlenecks: BottleneckAnalysis[]
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Connection optimization
    const avgConnections = metrics.reduce((sum, m) => sum + m.connectionCount, 0) / metrics.length;
    const avgSpeed = metrics.reduce((sum, m) => sum + m.downloadSpeed, 0) / metrics.length;

    if (avgConnections < 4 && avgSpeed < 1000000) { // Less than 1MB/s
      suggestions.push({
        category: 'connection',
        priority: 'high',
        title: 'Increase Connection Count',
        description: 'Current connection count is low. Increasing connections may improve speed.',
        expectedImprovement: '20-50% speed increase',
        implementation: 'Set maxConcurrency to 6-8 connections',
        parameters: { maxConcurrency: Math.min(8, avgConnections * 2) }
      });
    }

    // Bandwidth optimization
    if (bottlenecks.some(b => b.type === 'network')) {
      suggestions.push({
        category: 'bandwidth',
        priority: 'medium',
        title: 'Optimize Chunk Size',
        description: 'Adjust chunk size based on network conditions.',
        expectedImprovement: '10-30% efficiency gain',
        implementation: 'Use larger chunks for stable connections',
        parameters: { chunkSize: 2 * 1024 * 1024 } // 2MB
      });
    }

    // Retry optimization
    const avgErrorRate = metrics.reduce((sum, m) => sum + m.errorRate, 0) / metrics.length;
    if (avgErrorRate > 0.05) {
      suggestions.push({
        category: 'retry',
        priority: 'high',
        title: 'Improve Error Handling',
        description: 'High error rate detected. Adjust retry strategy.',
        expectedImprovement: '15-25% reliability improvement',
        implementation: 'Increase retry count and timeout',
        parameters: { retryCount: 5, timeout: 60000 }
      });
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  // Helper methods for metric calculation
  private getCurrentDownloadSpeed(taskId: string): number {
    const taskData = this.taskMetrics.get(taskId);
    return taskData?.currentSpeed || 0;
  }

  private getConnectionCount(taskId: string): number {
    const taskData = this.taskMetrics.get(taskId);
    return taskData?.connectionCount || 0;
  }

  private getActiveConnectionCount(taskId: string): number {
    const taskData = this.taskMetrics.get(taskId);
    return taskData?.activeConnections || 0;
  }

  private getErrorRate(taskId: string): number {
    const taskData = this.taskMetrics.get(taskId);
    return taskData?.errorRate || 0;
  }

  private getAverageLatency(taskId: string): number {
    const taskData = this.taskMetrics.get(taskId);
    return taskData?.latency || 0;
  }

  private getThroughput(taskId: string): number {
    const taskData = this.taskMetrics.get(taskId);
    return taskData?.throughput || 0;
  }

  private async getCpuUsage(): Promise<number> {
    // Simplified CPU usage calculation
    // In a real implementation, this would use system monitoring
    return Math.random() * 0.5; // Placeholder
  }

  private getMemoryUsage(): number {
    const used = process.memoryUsage();
    const total = used.heapTotal + used.external;
    return used.heapUsed / total;
  }

  private getNetworkUtilization(taskId: string): number {
    const taskData = this.taskMetrics.get(taskId);
    return taskData?.networkUtilization || 0;
  }

  private calculateAverageSpeed(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.downloadSpeed, 0) / metrics.length;
  }

  private calculatePeakSpeed(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;
    return Math.max(...metrics.map(m => m.downloadSpeed));
  }

  private calculateEfficiency(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;

    const avgSpeed = this.calculateAverageSpeed(metrics);
    const peakSpeed = this.calculatePeakSpeed(metrics);
    const avgErrorRate = metrics.reduce((sum, m) => sum + m.errorRate, 0) / metrics.length;

    const speedEfficiency = peakSpeed > 0 ? avgSpeed / peakSpeed : 0;
    const errorPenalty = 1 - avgErrorRate;

    return speedEfficiency * errorPenalty;
  }

  private calculateOverallRating(
    efficiency: number,
    bottlenecks: BottleneckAnalysis[]
  ): 'poor' | 'fair' | 'good' | 'excellent' {
    const criticalBottlenecks = bottlenecks.filter(b => b.severity === 'critical').length;
    const highBottlenecks = bottlenecks.filter(b => b.severity === 'high').length;

    if (criticalBottlenecks > 0 || efficiency < 0.3) return 'poor';
    if (highBottlenecks > 1 || efficiency < 0.6) return 'fair';
    if (highBottlenecks > 0 || efficiency < 0.8) return 'good';
    return 'excellent';
  }

  private extractKeyFindings(
    metrics: PerformanceMetrics[],
    bottlenecks: BottleneckAnalysis[]
  ): string[] {
    const findings: string[] = [];

    const avgSpeed = this.calculateAverageSpeed(metrics);
    findings.push(`Average download speed: ${(avgSpeed / 1024 / 1024).toFixed(2)} MB/s`);

    if (bottlenecks.length > 0) {
      findings.push(`${bottlenecks.length} performance bottleneck(s) identified`);
      if (bottlenecks[0]) {
        findings.push(`Primary bottleneck: ${bottlenecks[0].description}`);
      }
    }

    const efficiency = this.calculateEfficiency(metrics);
    findings.push(`Overall efficiency: ${(efficiency * 100).toFixed(1)}%`);

    return findings;
  }

  private generateRecommendations(suggestions: OptimizationSuggestion[]): string[] {
    return suggestions
      .filter(s => s.priority === 'high')
      .slice(0, 3)
      .map(s => s.title);
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Stop all monitoring intervals
    for (const [, interval] of this.monitoringIntervals) {
      clearInterval(interval);
    }

    this.monitoringIntervals.clear();
    this.metricsHistory.clear();
    this.taskStartTimes.clear();
    this.taskMetrics.clear();

    this.removeAllListeners();
  }
}
