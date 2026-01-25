/**
 * Performance Monitoring for Asterisk Matching Engine
 *
 * Tracks performance metrics for:
 * - LLM API calls (latency, token usage)
 * - Matching engine operations (tier 1/2/3)
 * - E2E form filling workflow
 *
 * Usage:
 *   const timer = PerformanceMonitor.startTimer('llm_match');
 *   // ... do work ...
 *   timer.stop();
 *   const metrics = PerformanceMonitor.getMetrics();
 */

export interface PerformanceMetric {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface PerformanceStats {
  count: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
}

export interface LLMMetrics {
  requestCount: number;
  totalTokens: number;
  avgTokensPerRequest: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  estimatedCost: number; // in USD
}

export interface MatchingMetrics {
  tier1Matches: number; // Autocomplete
  tier2Matches: number; // Pattern
  tier3Matches: number; // LLM
  tier1AvgMs: number;
  tier2AvgMs: number;
  tier3AvgMs: number;
  cacheHits: number;
  cacheMisses: number;
}

class PerformanceTimer {
  constructor(
    private operation: string,
    private monitor: PerformanceMonitor,
    private startTime: number,
    private metadata?: Record<string, unknown>
  ) {}

  stop(additionalMetadata?: Record<string, unknown>): number {
    const endTime = performance.now();
    const duration = endTime - this.startTime;

    this.monitor.recordMetric({
      operation: this.operation,
      startTime: this.startTime,
      endTime,
      duration,
      metadata: { ...this.metadata, ...additionalMetadata },
    });

    return duration;
  }
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 1000; // Keep last 1000 metrics

  // LLM-specific tracking
  private llmMetrics = {
    totalRequests: 0,
    totalTokens: 0,
    totalLatencyMs: 0,
  };

  // Matching-specific tracking
  private matchingMetrics = {
    tier1Matches: 0,
    tier2Matches: 0,
    tier3Matches: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  private constructor() {
    // Singleton
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start timing an operation
   */
  startTimer(operation: string, metadata?: Record<string, unknown>): PerformanceTimer {
    return new PerformanceTimer(operation, this, performance.now(), metadata);
  }

  /**
   * Record a metric
   */
  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    // Keep only the last N metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Update aggregate metrics
    this.updateAggregates(metric);
  }

  /**
   * Record LLM API call metrics
   */
  recordLLMCall(latencyMs: number, tokens: number): void {
    this.llmMetrics.totalRequests++;
    this.llmMetrics.totalTokens += tokens;
    this.llmMetrics.totalLatencyMs += latencyMs;

    this.recordMetric({
      operation: 'llm_api_call',
      startTime: performance.now() - latencyMs,
      endTime: performance.now(),
      duration: latencyMs,
      metadata: { tokens },
    });
  }

  /**
   * Record matching tier metrics
   */
  recordMatch(tier: 1 | 2 | 3, durationMs: number, cacheHit = false): void {
    if (tier === 1) {
      this.matchingMetrics.tier1Matches++;
    } else if (tier === 2) {
      this.matchingMetrics.tier2Matches++;
    } else if (tier === 3) {
      this.matchingMetrics.tier3Matches++;
    }

    if (cacheHit) {
      this.matchingMetrics.cacheHits++;
    } else {
      this.matchingMetrics.cacheMisses++;
    }

    this.recordMetric({
      operation: `tier${tier}_match`,
      startTime: performance.now() - durationMs,
      endTime: performance.now(),
      duration: durationMs,
      metadata: { tier, cacheHit },
    });
  }

  /**
   * Get statistics for a specific operation
   */
  getStats(operation: string): PerformanceStats | null {
    const operationMetrics = this.metrics.filter(
      (m) => m.operation === operation && m.duration !== undefined
    );

    if (operationMetrics.length === 0) {
      return null;
    }

    const durations = operationMetrics
      .map((m) => m.duration!)
      .sort((a, b) => a - b);

    const totalDuration = durations.reduce((sum, d) => sum + d, 0);

    return {
      count: durations.length,
      totalDuration,
      averageDuration: totalDuration / durations.length,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p50Duration: this.percentile(durations, 50),
      p95Duration: this.percentile(durations, 95),
      p99Duration: this.percentile(durations, 99),
    };
  }

  /**
   * Get LLM-specific metrics
   */
  getLLMMetrics(): LLMMetrics {
    const avgLatency =
      this.llmMetrics.totalRequests > 0
        ? this.llmMetrics.totalLatencyMs / this.llmMetrics.totalRequests
        : 0;

    const llmStats = this.getStats('llm_api_call');
    const p95Latency = llmStats?.p95Duration || 0;

    // Estimate cost based on Claude Sonnet 3.5 pricing
    // Input: $3 / MTok, Output: $15 / MTok (assume 50/50 split)
    const avgCostPerToken = (3 + 15) / 2 / 1_000_000;
    const estimatedCost = this.llmMetrics.totalTokens * avgCostPerToken;

    return {
      requestCount: this.llmMetrics.totalRequests,
      totalTokens: this.llmMetrics.totalTokens,
      avgTokensPerRequest:
        this.llmMetrics.totalRequests > 0
          ? this.llmMetrics.totalTokens / this.llmMetrics.totalRequests
          : 0,
      avgLatencyMs: avgLatency,
      p95LatencyMs: p95Latency,
      estimatedCost,
    };
  }

  /**
   * Get matching engine metrics
   */
  getMatchingMetrics(): MatchingMetrics {
    const tier1Stats = this.getStats('tier1_match');
    const tier2Stats = this.getStats('tier2_match');
    const tier3Stats = this.getStats('tier3_match');

    return {
      tier1Matches: this.matchingMetrics.tier1Matches,
      tier2Matches: this.matchingMetrics.tier2Matches,
      tier3Matches: this.matchingMetrics.tier3Matches,
      tier1AvgMs: tier1Stats?.averageDuration || 0,
      tier2AvgMs: tier2Stats?.averageDuration || 0,
      tier3AvgMs: tier3Stats?.averageDuration || 0,
      cacheHits: this.matchingMetrics.cacheHits,
      cacheMisses: this.matchingMetrics.cacheMisses,
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, PerformanceStats | null> {
    const operations = [...new Set(this.metrics.map((m) => m.operation))];
    const stats: Record<string, PerformanceStats | null> = {};

    for (const operation of operations) {
      stats[operation] = this.getStats(operation);
    }

    return stats;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.llmMetrics = {
      totalRequests: 0,
      totalTokens: 0,
      totalLatencyMs: 0,
    };
    this.matchingMetrics = {
      tier1Matches: 0,
      tier2Matches: 0,
      tier3Matches: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  /**
   * Export metrics as JSON
   */
  export(): string {
    return JSON.stringify(
      {
        timestamp: Date.now(),
        metrics: this.metrics,
        llmMetrics: this.getLLMMetrics(),
        matchingMetrics: this.getMatchingMetrics(),
        stats: this.getAllMetrics(),
      },
      null,
      2
    );
  }

  // Private helpers

  private updateAggregates(metric: PerformanceMetric): void {
    // This is called after each metric is recorded
    // Currently we recalculate stats on demand in getStats()
    // Could optimize by maintaining running aggregates here
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;

    const index = (p / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();
