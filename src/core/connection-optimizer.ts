import { EventEmitter } from 'events';

export interface NetworkMetrics {
  latency: number;
  bandwidth: number;
  packetLoss: number;
  jitter: number;
  timestamp: number;
}

export interface ConnectionMetrics {
  connectionId: string;
  speed: number;
  errorRate: number;
  responseTime: number;
  bytesTransferred: number;
  isActive: boolean;
  lastActivity: number;
}

export interface OptimizationConfig {
  minConnections: number;
  maxConnections: number;
  targetBandwidthUtilization: number; // 0.0 - 1.0
  adaptationInterval: number; // ms
  errorThreshold: number; // 0.0 - 1.0
  latencyThreshold: number; // ms
  bandwidthThreshold: number; // bytes/s
  enableLoadBalancing: boolean;
  enableBandwidthControl: boolean;
  enableAdaptiveTimeout: boolean;
}

export interface ConnectionPoolStats {
  activeConnections: number;
  totalConnections: number;
  averageSpeed: number;
  totalBandwidth: number;
  errorRate: number;
  efficiency: number;
}

export class ConnectionOptimizer extends EventEmitter {
  private config: OptimizationConfig;
  private connections: Map<string, ConnectionMetrics> = new Map();
  private networkHistory: NetworkMetrics[] = [];
  private optimizationTimer?: NodeJS.Timeout;
  private bandwidthLimiter?: BandwidthLimiter;
  private loadBalancer?: LoadBalancer;

  constructor(config: Partial<OptimizationConfig> = {}) {
    super();

    this.config = {
      minConnections: 1,
      maxConnections: 16,
      targetBandwidthUtilization: 0.8,
      adaptationInterval: 5000,
      errorThreshold: 0.1,
      latencyThreshold: 1000,
      bandwidthThreshold: 100000, // 100KB/s
      enableLoadBalancing: true,
      enableBandwidthControl: true,
      enableAdaptiveTimeout: true,
      ...config
    };

    if (this.config.enableBandwidthControl) {
      this.bandwidthLimiter = new BandwidthLimiter();
    }

    if (this.config.enableLoadBalancing) {
      this.loadBalancer = new LoadBalancer();
    }

    this.startOptimization();
  }

  /**
   * Calculate optimal number of connections based on current conditions
   */
  calculateOptimalConnections(fileSize: number, currentConnections: number): number {
    const networkCondition = this.evaluateNetworkCondition();
    const connectionEfficiency = this.calculateConnectionEfficiency();

    let optimal = currentConnections;

    // Base calculation on file size
    if (fileSize < 1024 * 1024) { // < 1MB
      optimal = 1;
    } else if (fileSize < 100 * 1024 * 1024) { // < 100MB
      optimal = Math.min(4, this.config.maxConnections);
    } else {
      optimal = Math.min(8, this.config.maxConnections);
    }

    // Adjust based on network condition
    switch (networkCondition) {
      case 'poor':
        optimal = Math.max(1, Math.floor(optimal * 0.5));
        break;
      case 'fair':
        optimal = Math.max(1, Math.floor(optimal * 0.75));
        break;
      case 'good':
        // Keep as calculated
        break;
      case 'excellent':
        optimal = Math.min(this.config.maxConnections, Math.floor(optimal * 1.5));
        break;
    }

    // Adjust based on connection efficiency
    if (connectionEfficiency < 0.5) {
      optimal = Math.max(1, Math.floor(optimal * 0.7));
    } else if (connectionEfficiency > 0.8) {
      optimal = Math.min(this.config.maxConnections, optimal + 1);
    }

    // Ensure within bounds
    return Math.max(
      this.config.minConnections,
      Math.min(this.config.maxConnections, optimal)
    );
  }

  /**
   * Add a new connection to the pool
   */
  addConnection(connectionId: string): void {
    const metrics: ConnectionMetrics = {
      connectionId,
      speed: 0,
      errorRate: 0,
      responseTime: 0,
      bytesTransferred: 0,
      isActive: true,
      lastActivity: Date.now()
    };

    this.connections.set(connectionId, metrics);
    this.emit('connectionAdded', connectionId);

    if (this.loadBalancer) {
      this.loadBalancer.addConnection(connectionId);
    }
  }

  /**
   * Remove a connection from the pool
   */
  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
    this.emit('connectionRemoved', connectionId);

    if (this.loadBalancer) {
      this.loadBalancer.removeConnection(connectionId);
    }
  }

  /**
   * Update connection metrics
   */
  updateConnectionMetrics(connectionId: string, metrics: Partial<ConnectionMetrics>): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    Object.assign(connection, metrics, { lastActivity: Date.now() });
    this.connections.set(connectionId, connection);

    if (this.loadBalancer) {
      this.loadBalancer.updateConnectionMetrics(connectionId, connection);
    }
  }

  /**
   * Get the best connection for a new request
   */
  getBestConnection(): string | null {
    if (this.loadBalancer) {
      return this.loadBalancer.getBestConnection();
    }

    // Simple fallback: return connection with lowest error rate and highest speed
    let bestConnection: string | null = null;
    let bestScore = -1;

    for (const [id, metrics] of this.connections) {
      if (!metrics.isActive) continue;

      const score = metrics.speed * (1 - metrics.errorRate);
      if (score > bestScore) {
        bestScore = score;
        bestConnection = id;
      }
    }

    return bestConnection;
  }

  /**
   * Apply bandwidth limiting to a connection
   */
  async applyBandwidthLimit(connectionId: string, bytes: number): Promise<void> {
    if (!this.bandwidthLimiter) return;

    await this.bandwidthLimiter.throttle(connectionId, bytes);
  }

  /**
   * Record network metrics
   */
  recordNetworkMetrics(metrics: NetworkMetrics): void {
    this.networkHistory.push(metrics);

    // Keep only recent history (last 100 measurements)
    if (this.networkHistory.length > 100) {
      this.networkHistory.shift();
    }

    this.emit('networkMetricsUpdated', metrics);
  }

  /**
   * Evaluate current network condition
   */
  private evaluateNetworkCondition(): 'poor' | 'fair' | 'good' | 'excellent' {
    if (this.networkHistory.length === 0) return 'fair';

    const recent = this.networkHistory.slice(-10);
    const avgLatency = recent.reduce((sum, m) => sum + m.latency, 0) / recent.length;
    const avgBandwidth = recent.reduce((sum, m) => sum + m.bandwidth, 0) / recent.length;
    const avgPacketLoss = recent.reduce((sum, m) => sum + m.packetLoss, 0) / recent.length;

    if (avgLatency > 500 || avgPacketLoss > 0.05 || avgBandwidth < 100000) {
      return 'poor';
    } else if (avgLatency > 200 || avgPacketLoss > 0.02 || avgBandwidth < 1000000) {
      return 'fair';
    } else if (avgLatency > 50 || avgPacketLoss > 0.005 || avgBandwidth < 10000000) {
      return 'good';
    } else {
      return 'excellent';
    }
  }

  /**
   * Calculate overall connection efficiency
   */
  private calculateConnectionEfficiency(): number {
    if (this.connections.size === 0) return 0;

    let totalEfficiency = 0;
    let activeConnections = 0;

    for (const metrics of this.connections.values()) {
      if (!metrics.isActive) continue;

      activeConnections++;
      const efficiency = metrics.speed > 0 ? (1 - metrics.errorRate) * (metrics.speed / 1000000) : 0;
      totalEfficiency += Math.min(1, efficiency);
    }

    return activeConnections > 0 ? totalEfficiency / activeConnections : 0;
  }

  /**
   * Start the optimization loop
   */
  private startOptimization(): void {
    this.optimizationTimer = setInterval(() => {
      this.optimizeConnections();
    }, this.config.adaptationInterval);
  }

  /**
   * Optimize connections based on current metrics
   */
  private optimizeConnections(): void {
    const stats = this.getPoolStats();

    // Remove underperforming connections
    for (const [id, metrics] of this.connections) {
      if (metrics.errorRate > this.config.errorThreshold ||
        (Date.now() - metrics.lastActivity) > 30000) { // 30s timeout
        this.removeConnection(id);
      }
    }

    // Emit optimization event
    this.emit('optimizationPerformed', {
      stats,
      networkCondition: this.evaluateNetworkCondition(),
      efficiency: this.calculateConnectionEfficiency()
    });
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats(): ConnectionPoolStats {
    const activeConnections = Array.from(this.connections.values()).filter(c => c.isActive);

    const totalSpeed = activeConnections.reduce((sum, c) => sum + c.speed, 0);
    const totalErrors = activeConnections.reduce((sum, c) => sum + c.errorRate, 0);

    return {
      activeConnections: activeConnections.length,
      totalConnections: this.connections.size,
      averageSpeed: activeConnections.length > 0 ? totalSpeed / activeConnections.length : 0,
      totalBandwidth: totalSpeed,
      errorRate: activeConnections.length > 0 ? totalErrors / activeConnections.length : 0,
      efficiency: this.calculateConnectionEfficiency()
    };
  }

  /**
   * Cleanup and stop optimization
   */
  cleanup(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = undefined;
    }

    this.connections.clear();
    this.networkHistory = [];

    if (this.bandwidthLimiter) {
      this.bandwidthLimiter.cleanup();
    }

    if (this.loadBalancer) {
      this.loadBalancer.cleanup();
    }

    this.removeAllListeners();
  }
}

/**
 * Bandwidth limiter for connection throttling
 */
class BandwidthLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private globalBucket?: TokenBucket;

  constructor(globalLimit?: number) {
    if (globalLimit) {
      this.globalBucket = new TokenBucket(globalLimit, globalLimit);
    }
  }

  async throttle(connectionId: string, bytes: number): Promise<void> {
    // Global throttling
    if (this.globalBucket) {
      await this.globalBucket.consume(bytes);
    }

    // Per-connection throttling
    let bucket = this.buckets.get(connectionId);
    if (!bucket) {
      bucket = new TokenBucket(1000000, 1000000); // 1MB/s default
      this.buckets.set(connectionId, bucket);
    }

    await bucket.consume(bytes);
  }

  setConnectionLimit(connectionId: string, bytesPerSecond: number): void {
    const bucket = new TokenBucket(bytesPerSecond, bytesPerSecond);
    this.buckets.set(connectionId, bucket);
  }

  cleanup(): void {
    this.buckets.clear();
    this.globalBucket = undefined;
  }
}

/**
 * Load balancer for distributing requests across connections
 */
class LoadBalancer {
  private connections: Map<string, ConnectionMetrics> = new Map();

  addConnection(_connectionId: string): void {
    // Connection will be added when metrics are updated
  }

  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  updateConnectionMetrics(connectionId: string, metrics: ConnectionMetrics): void {
    this.connections.set(connectionId, metrics);
  }

  getBestConnection(): string | null {
    const activeConnections = Array.from(this.connections.entries())
      .filter(([, metrics]) => metrics.isActive);

    if (activeConnections.length === 0) return null;

    // Weighted round-robin based on speed and error rate
    const weights = activeConnections.map(([id, metrics]) => ({
      id,
      weight: metrics.speed * (1 - metrics.errorRate)
    }));

    weights.sort((a, b) => b.weight - a.weight);

    // Return the best performing connection
    return weights[0]?.id || null;
  }

  cleanup(): void {
    this.connections.clear();
  }
}

/**
 * Token bucket for rate limiting
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillRate: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async consume(tokens: number): Promise<void> {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return;
    }

    // Wait for tokens to be available
    const waitTime = ((tokens - this.tokens) / this.refillRate) * 1000;
    await new Promise(resolve => setTimeout(resolve, waitTime));

    this.refill();
    this.tokens -= tokens;
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}
