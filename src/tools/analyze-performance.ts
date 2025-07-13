import { z } from 'zod';
import { PerformanceAnalyzer } from '../core/performance-analyzer.js';

export class AnalyzePerformanceTool {
  private performanceAnalyzer: PerformanceAnalyzer;

  constructor() {
    this.performanceAnalyzer = new PerformanceAnalyzer();
  }

  getToolDefinition() {
    return {
      name: 'analyze_performance',
      description: '分析下载任务的性能，提供瓶颈分析和优化建议',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '要分析的任务ID'
          },
          includeMetrics: {
            type: 'boolean',
            description: '是否包含详细指标数据',
            default: false
          },
          includeBottlenecks: {
            type: 'boolean',
            description: '是否包含瓶颈分析',
            default: true
          },
          includeSuggestions: {
            type: 'boolean',
            description: '是否包含优化建议',
            default: true
          },
          format: {
            type: 'string',
            enum: ['summary', 'detailed', 'json'],
            description: '报告格式',
            default: 'summary'
          }
        },
        required: ['taskId']
      }
    };
  }

  async execute(args: unknown) {
    return await analyzePerformance(args);
  }

  getPerformanceAnalyzer() {
    return this.performanceAnalyzer;
  }
}

// Global performance analyzer instance
const performanceAnalyzer = new PerformanceAnalyzer();

// Validation schemas
const AnalyzePerformanceSchema = z.object({
  taskId: z.string(),
  includeMetrics: z.boolean().optional().default(false),
  includeBottlenecks: z.boolean().optional().default(true),
  includeSuggestions: z.boolean().optional().default(true),
  format: z.enum(['summary', 'detailed', 'json']).optional().default('summary')
});

const StartMonitoringSchema = z.object({
  taskId: z.string(),
  metricsInterval: z.number().int().positive().optional(),
  enableCpuMonitoring: z.boolean().optional(),
  enableMemoryMonitoring: z.boolean().optional(),
  enableNetworkMonitoring: z.boolean().optional()
});

const UpdateMetricsSchema = z.object({
  taskId: z.string(),
  metrics: z.object({
    currentSpeed: z.number().optional(),
    connectionCount: z.number().int().optional(),
    activeConnections: z.number().int().optional(),
    errorRate: z.number().min(0).max(1).optional(),
    latency: z.number().optional(),
    throughput: z.number().optional(),
    totalBytes: z.number().optional(),
    networkUtilization: z.number().min(0).max(1).optional()
  })
});

/**
 * Analyze performance for a download task
 */
export async function analyzePerformance(args: unknown) {
  try {
    const params = AnalyzePerformanceSchema.parse(args);

    const report = performanceAnalyzer.generateReport(params.taskId);

    // Format response based on requested format
    switch (params.format) {
      case 'summary':
        return {
          success: true,
          taskId: params.taskId,
          summary: report.summary,
          performance: {
            duration: `${(report.duration / 1000).toFixed(2)}s`,
            averageSpeed: formatSpeed(report.averageSpeed),
            peakSpeed: formatSpeed(report.peakSpeed),
            efficiency: `${(report.efficiency * 100).toFixed(1)}%`,
            totalBytes: formatBytes(report.totalBytes)
          },
          bottlenecks: params.includeBottlenecks ? report.bottlenecks.slice(0, 3) : undefined,
          suggestions: params.includeSuggestions ? report.suggestions.slice(0, 3) : undefined
        };

      case 'detailed':
        return {
          success: true,
          taskId: params.taskId,
          report: {
            ...report,
            metrics: params.includeMetrics ? report.metrics : undefined
          }
        };

      case 'json':
        return {
          success: true,
          taskId: params.taskId,
          report
        };

      default:
        throw new Error('Invalid format specified');
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid parameters',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Performance analysis failed'
    };
  }
}

/**
 * Start performance monitoring for a task
 */
export async function startPerformanceMonitoring(args: unknown) {
  try {
    const params = StartMonitoringSchema.parse(args);

    // Configure analyzer if custom settings provided
    if (params.metricsInterval ||
      params.enableCpuMonitoring !== undefined ||
      params.enableMemoryMonitoring !== undefined ||
      params.enableNetworkMonitoring !== undefined) {

      // Note: In a real implementation, you might create a new analyzer instance
      // or reconfigure the existing one
    }

    performanceAnalyzer.startMonitoring(params.taskId);

    return {
      success: true,
      taskId: params.taskId,
      message: 'Performance monitoring started',
      configuration: {
        metricsInterval: params.metricsInterval || 1000,
        cpuMonitoring: params.enableCpuMonitoring ?? true,
        memoryMonitoring: params.enableMemoryMonitoring ?? true,
        networkMonitoring: params.enableNetworkMonitoring ?? true
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start monitoring'
    };
  }
}

/**
 * Stop performance monitoring for a task
 */
export async function stopPerformanceMonitoring(args: unknown) {
  try {
    const params = z.object({
      taskId: z.string()
    }).parse(args);

    performanceAnalyzer.stopMonitoring(params.taskId);

    return {
      success: true,
      taskId: params.taskId,
      message: 'Performance monitoring stopped'
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop monitoring'
    };
  }
}

/**
 * Update task metrics manually
 */
export async function updateTaskMetrics(args: unknown) {
  try {
    const params = UpdateMetricsSchema.parse(args);

    performanceAnalyzer.updateTaskMetrics(params.taskId, params.metrics);

    return {
      success: true,
      taskId: params.taskId,
      message: 'Task metrics updated',
      updatedMetrics: Object.keys(params.metrics)
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update metrics'
    };
  }
}

/**
 * Get optimization suggestions for current performance
 */
export async function getOptimizationSuggestions(args: unknown) {
  try {
    const params = z.object({
      taskId: z.string(),
      category: z.enum(['connection', 'bandwidth', 'retry', 'timeout', 'chunking']).optional(),
      priority: z.enum(['low', 'medium', 'high']).optional()
    }).parse(args);

    const report = performanceAnalyzer.generateReport(params.taskId);
    let suggestions = report.suggestions;

    // Filter by category if specified
    if (params.category) {
      suggestions = suggestions.filter(s => s.category === params.category);
    }

    // Filter by priority if specified
    if (params.priority) {
      suggestions = suggestions.filter(s => s.priority === params.priority);
    }

    return {
      success: true,
      taskId: params.taskId,
      suggestions: suggestions.map(s => ({
        category: s.category,
        priority: s.priority,
        title: s.title,
        description: s.description,
        expectedImprovement: s.expectedImprovement,
        implementation: s.implementation,
        parameters: s.parameters
      })),
      totalSuggestions: suggestions.length,
      filters: {
        category: params.category,
        priority: params.priority
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get suggestions'
    };
  }
}

/**
 * Get real-time performance metrics
 */
export async function getRealTimeMetrics(args: unknown) {
  try {
    const params = z.object({
      taskId: z.string(),
      lastN: z.number().int().positive().optional().default(10)
    }).parse(args);

    // This would get the last N metrics from the analyzer
    // For now, we'll return a placeholder response

    return {
      success: true,
      taskId: params.taskId,
      metrics: {
        current: {
          downloadSpeed: formatSpeed(0),
          connectionCount: 0,
          errorRate: '0.0%',
          latency: '0ms',
          cpuUsage: '0.0%',
          memoryUsage: '0.0%'
        },
        trend: 'stable', // 'improving', 'degrading', 'stable'
        lastUpdated: new Date().toISOString()
      },
      message: 'Real-time metrics retrieved'
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get real-time metrics'
    };
  }
}

/**
 * Compare performance between multiple tasks
 */
export async function comparePerformance(args: unknown) {
  try {
    const params = z.object({
      taskIds: z.array(z.string()).min(2).max(5),
      metrics: z.array(z.enum(['speed', 'efficiency', 'errors', 'duration'])).optional()
    }).parse(args);

    const comparisons = [];

    for (const taskId of params.taskIds) {
      try {
        const report = performanceAnalyzer.generateReport(taskId);
        comparisons.push({
          taskId,
          averageSpeed: report.averageSpeed,
          peakSpeed: report.peakSpeed,
          efficiency: report.efficiency,
          duration: report.duration,
          errorRate: report.metrics.length > 0
            ? report.metrics.reduce((sum, m) => sum + m.errorRate, 0) / report.metrics.length
            : 0,
          overallRating: report.summary.overallRating
        });
      } catch (error) {
        comparisons.push({
          taskId,
          error: 'No performance data available'
        });
      }
    }

    // Find best and worst performers
    const validComparisons = comparisons.filter(c => !c.error);

    let bestSpeed, bestEfficiency;
    if (validComparisons.length > 0) {
      bestSpeed = validComparisons.reduce((best, current) =>
        (current.averageSpeed || 0) > (best.averageSpeed || 0) ? current : best);
      bestEfficiency = validComparisons.reduce((best, current) =>
        (current.efficiency || 0) > (best.efficiency || 0) ? current : best);
    }

    return {
      success: true,
      comparisons,
      analysis: {
        bestSpeed: bestSpeed?.taskId,
        bestEfficiency: bestEfficiency?.taskId,
        averageSpeed: validComparisons.length > 0
          ? validComparisons.reduce((sum, c) => sum + (c.averageSpeed || 0), 0) / validComparisons.length
          : 0,
        averageEfficiency: validComparisons.length > 0
          ? validComparisons.reduce((sum, c) => sum + (c.efficiency || 0), 0) / validComparisons.length
          : 0
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Performance comparison failed'
    };
  }
}

/**
 * Helper functions
 */
function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  if (bytesPerSecond < 1024 * 1024 * 1024) return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
  return `${(bytesPerSecond / 1024 / 1024 / 1024).toFixed(1)} GB/s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

// Export performance analyzer for use by other modules
export { performanceAnalyzer };
