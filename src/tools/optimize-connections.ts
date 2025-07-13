import { z } from 'zod';
import { ConnectionOptimizer } from '../core/connection-optimizer.js';

export class OptimizeConnectionsTool {
  getToolDefinition() {
    return {
      name: 'optimize_connections',
      description: '优化下载连接数和配置，提供智能连接管理',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '任务ID'
          },
          fileSize: {
            type: 'number',
            description: '文件大小（字节）'
          },
          currentConnections: {
            type: 'number',
            description: '当前连接数',
            default: 4
          },
          maxConnections: {
            type: 'number',
            description: '最大连接数',
            default: 16
          },
          targetBandwidthUtilization: {
            type: 'number',
            description: '目标带宽利用率（0.1-1.0）',
            default: 0.8
          },
          enableLoadBalancing: {
            type: 'boolean',
            description: '启用负载均衡',
            default: true
          },
          enableBandwidthControl: {
            type: 'boolean',
            description: '启用带宽控制',
            default: true
          }
        },
        required: ['taskId', 'fileSize']
      }
    };
  }

  async execute(args: unknown) {
    return await optimizeConnections(args);
  }
}

// Global connection optimizer instances
const connectionOptimizers = new Map<string, ConnectionOptimizer>();

// Validation schemas
const OptimizeConnectionsSchema = z.object({
  taskId: z.string(),
  fileSize: z.number().int().positive(),
  currentConnections: z.number().int().positive().optional().default(4),
  maxConnections: z.number().int().min(1).max(32).optional().default(16),
  targetBandwidthUtilization: z.number().min(0.1).max(1.0).optional().default(0.8),
  enableLoadBalancing: z.boolean().optional().default(true),
  enableBandwidthControl: z.boolean().optional().default(true)
});

const NetworkMetricsSchema = z.object({
  taskId: z.string(),
  latency: z.number().min(0),
  bandwidth: z.number().min(0),
  packetLoss: z.number().min(0).max(1),
  jitter: z.number().min(0)
});

const ConnectionMetricsSchema = z.object({
  taskId: z.string(),
  connectionId: z.string(),
  speed: z.number().min(0),
  errorRate: z.number().min(0).max(1),
  responseTime: z.number().min(0),
  bytesTransferred: z.number().min(0),
  isActive: z.boolean()
});

/**
 * Optimize connection count and configuration for a download task
 */
export async function optimizeConnections(args: unknown) {
  try {
    const params = OptimizeConnectionsSchema.parse(args);

    // Get or create connection optimizer for this task
    let optimizer = connectionOptimizers.get(params.taskId);
    if (!optimizer) {
      optimizer = new ConnectionOptimizer({
        minConnections: 1,
        maxConnections: params.maxConnections,
        targetBandwidthUtilization: params.targetBandwidthUtilization,
        enableLoadBalancing: params.enableLoadBalancing,
        enableBandwidthControl: params.enableBandwidthControl
      });
      connectionOptimizers.set(params.taskId, optimizer);
    }

    // Calculate optimal connection count
    const optimalConnections = optimizer.calculateOptimalConnections(
      params.fileSize,
      params.currentConnections
    );

    // Get current pool statistics
    const poolStats = optimizer.getPoolStats();

    // Generate recommendations
    const recommendations = generateConnectionRecommendations(
      params.currentConnections,
      optimalConnections,
      params.fileSize,
      poolStats
    );

    return {
      success: true,
      taskId: params.taskId,
      optimization: {
        currentConnections: params.currentConnections,
        optimalConnections,
        recommendation: optimalConnections !== params.currentConnections
          ? (optimalConnections > params.currentConnections ? 'increase' : 'decrease')
          : 'maintain',
        expectedImprovement: calculateExpectedImprovement(
          params.currentConnections,
          optimalConnections
        )
      },
      poolStats,
      recommendations,
      configuration: {
        maxConnections: params.maxConnections,
        targetBandwidthUtilization: params.targetBandwidthUtilization,
        loadBalancing: params.enableLoadBalancing,
        bandwidthControl: params.enableBandwidthControl
      }
    };

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
      error: error instanceof Error ? error.message : 'Connection optimization failed'
    };
  }
}

/**
 * Record network metrics for optimization
 */
export async function recordNetworkMetrics(args: unknown) {
  try {
    const params = NetworkMetricsSchema.parse(args);

    const optimizer = connectionOptimizers.get(params.taskId);
    if (!optimizer) {
      return {
        success: false,
        error: 'No optimizer found for this task. Call optimizeConnections first.'
      };
    }

    optimizer.recordNetworkMetrics({
      latency: params.latency,
      bandwidth: params.bandwidth,
      packetLoss: params.packetLoss,
      jitter: params.jitter,
      timestamp: Date.now()
    });

    return {
      success: true,
      taskId: params.taskId,
      message: 'Network metrics recorded',
      metrics: {
        latency: `${params.latency}ms`,
        bandwidth: formatBandwidth(params.bandwidth),
        packetLoss: `${(params.packetLoss * 100).toFixed(2)}%`,
        jitter: `${params.jitter}ms`
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record network metrics'
    };
  }
}

/**
 * Update connection metrics
 */
export async function updateConnectionMetrics(args: unknown) {
  try {
    const params = ConnectionMetricsSchema.parse(args);

    const optimizer = connectionOptimizers.get(params.taskId);
    if (!optimizer) {
      return {
        success: false,
        error: 'No optimizer found for this task'
      };
    }

    optimizer.updateConnectionMetrics(params.connectionId, {
      connectionId: params.connectionId,
      speed: params.speed,
      errorRate: params.errorRate,
      responseTime: params.responseTime,
      bytesTransferred: params.bytesTransferred,
      isActive: params.isActive,
      lastActivity: Date.now()
    });

    return {
      success: true,
      taskId: params.taskId,
      connectionId: params.connectionId,
      message: 'Connection metrics updated'
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update connection metrics'
    };
  }
}

/**
 * Get the best connection for a new request
 */
export async function getBestConnection(args: unknown) {
  try {
    const params = z.object({
      taskId: z.string()
    }).parse(args);

    const optimizer = connectionOptimizers.get(params.taskId);
    if (!optimizer) {
      return {
        success: false,
        error: 'No optimizer found for this task'
      };
    }

    const bestConnection = optimizer.getBestConnection();
    const poolStats = optimizer.getPoolStats();

    return {
      success: true,
      taskId: params.taskId,
      bestConnection,
      poolStats,
      recommendation: bestConnection
        ? `Use connection ${bestConnection} for optimal performance`
        : 'No active connections available'
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get best connection'
    };
  }
}

/**
 * Add a new connection to the pool
 */
export async function addConnection(args: unknown) {
  try {
    const params = z.object({
      taskId: z.string(),
      connectionId: z.string()
    }).parse(args);

    const optimizer = connectionOptimizers.get(params.taskId);
    if (!optimizer) {
      return {
        success: false,
        error: 'No optimizer found for this task'
      };
    }

    optimizer.addConnection(params.connectionId);

    return {
      success: true,
      taskId: params.taskId,
      connectionId: params.connectionId,
      message: 'Connection added to pool'
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add connection'
    };
  }
}

/**
 * Remove a connection from the pool
 */
export async function removeConnection(args: unknown) {
  try {
    const params = z.object({
      taskId: z.string(),
      connectionId: z.string()
    }).parse(args);

    const optimizer = connectionOptimizers.get(params.taskId);
    if (!optimizer) {
      return {
        success: false,
        error: 'No optimizer found for this task'
      };
    }

    optimizer.removeConnection(params.connectionId);

    return {
      success: true,
      taskId: params.taskId,
      connectionId: params.connectionId,
      message: 'Connection removed from pool'
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove connection'
    };
  }
}

/**
 * Get connection pool statistics
 */
export async function getConnectionPoolStats(args: unknown) {
  try {
    const params = z.object({
      taskId: z.string()
    }).parse(args);

    const optimizer = connectionOptimizers.get(params.taskId);
    if (!optimizer) {
      return {
        success: false,
        error: 'No optimizer found for this task'
      };
    }

    const stats = optimizer.getPoolStats();

    return {
      success: true,
      taskId: params.taskId,
      stats: {
        activeConnections: stats.activeConnections,
        totalConnections: stats.totalConnections,
        averageSpeed: formatBandwidth(stats.averageSpeed),
        totalBandwidth: formatBandwidth(stats.totalBandwidth),
        errorRate: `${(stats.errorRate * 100).toFixed(2)}%`,
        efficiency: `${(stats.efficiency * 100).toFixed(1)}%`
      },
      performance: {
        rating: getPerformanceRating(stats.efficiency),
        bottlenecks: identifyBottlenecks(stats)
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get pool statistics'
    };
  }
}

/**
 * Cleanup optimizer for a task
 */
export async function cleanupOptimizer(args: unknown) {
  try {
    const params = z.object({
      taskId: z.string()
    }).parse(args);

    const optimizer = connectionOptimizers.get(params.taskId);
    if (optimizer) {
      optimizer.cleanup();
      connectionOptimizers.delete(params.taskId);
    }

    return {
      success: true,
      taskId: params.taskId,
      message: 'Optimizer cleaned up'
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cleanup optimizer'
    };
  }
}

/**
 * Helper functions
 */
function generateConnectionRecommendations(
  current: number,
  optimal: number,
  fileSize: number,
  poolStats: any
): string[] {
  const recommendations: string[] = [];

  if (optimal > current) {
    recommendations.push(`Increase connections from ${current} to ${optimal} for better performance`);
    recommendations.push('Monitor error rates when increasing connections');
  } else if (optimal < current) {
    recommendations.push(`Reduce connections from ${current} to ${optimal} to improve stability`);
    recommendations.push('High connection count may be causing server overload');
  } else {
    recommendations.push('Current connection count is optimal');
  }

  if (fileSize > 100 * 1024 * 1024) { // > 100MB
    recommendations.push('Consider using larger chunk sizes for large files');
  }

  if (poolStats.errorRate > 0.1) {
    recommendations.push('High error rate detected - consider reducing connections');
  }

  return recommendations;
}

function calculateExpectedImprovement(current: number, optimal: number): string {
  if (optimal === current) return 'No change needed';

  const ratio = optimal / current;
  if (ratio > 1.5) return '30-50% speed improvement expected';
  if (ratio > 1.2) return '15-30% speed improvement expected';
  if (ratio > 1.1) return '5-15% speed improvement expected';
  if (ratio < 0.8) return '10-25% stability improvement expected';
  if (ratio < 0.9) return '5-15% stability improvement expected';

  return 'Minor optimization expected';
}

function formatBandwidth(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  if (bytesPerSecond < 1024 * 1024 * 1024) return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
  return `${(bytesPerSecond / 1024 / 1024 / 1024).toFixed(1)} GB/s`;
}

function getPerformanceRating(efficiency: number): string {
  if (efficiency > 0.8) return 'excellent';
  if (efficiency > 0.6) return 'good';
  if (efficiency > 0.4) return 'fair';
  return 'poor';
}

function identifyBottlenecks(stats: any): string[] {
  const bottlenecks: string[] = [];

  if (stats.errorRate > 0.1) {
    bottlenecks.push('High error rate');
  }

  if (stats.efficiency < 0.5) {
    bottlenecks.push('Low connection efficiency');
  }

  if (stats.activeConnections < stats.totalConnections * 0.7) {
    bottlenecks.push('Many inactive connections');
  }

  return bottlenecks;
}
