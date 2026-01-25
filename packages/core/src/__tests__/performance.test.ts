/**
 * Performance Monitoring Tests
 *
 * Tests the performance monitoring system for:
 * - Timer functionality
 * - Metrics recording
 * - Statistics calculation
 * - LLM and matching metrics tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceMonitor, performanceMonitor } from '../performance';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = PerformanceMonitor.getInstance();
    monitor.clear();

    // Mock performance.now()
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });

  describe('Timer functionality', () => {
    it('starts and stops a timer', () => {
      vi.spyOn(performance, 'now').mockReturnValueOnce(0); // start
      const timer = monitor.startTimer('test_operation');

      vi.spyOn(performance, 'now').mockReturnValueOnce(100); // stop
      const duration = timer.stop();

      expect(duration).toBe(100);

      const stats = monitor.getStats('test_operation');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(1);
      expect(stats!.averageDuration).toBe(100);
    });

    it('records metadata with timer', () => {
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(0) // start
        .mockReturnValueOnce(50); // stop

      const timer = monitor.startTimer('test_op', { userId: '123' });
      timer.stop({ success: true });

      const stats = monitor.getStats('test_op');
      expect(stats!.count).toBe(1);
    });
  });

  describe('Statistics calculation', () => {
    it('calculates average duration correctly', () => {
      let time = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => time);

      // Record 3 operations with durations: 10ms, 20ms, 30ms
      for (const duration of [10, 20, 30]) {
        const timer = monitor.startTimer('calc_test');
        time += duration;
        timer.stop();
      }

      const stats = monitor.getStats('calc_test');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(3);
      expect(stats!.averageDuration).toBe(20); // (10+20+30)/3
      expect(stats!.minDuration).toBe(10);
      expect(stats!.maxDuration).toBe(30);
    });

    it('calculates percentiles correctly', () => {
      let time = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => time);

      // Record 100 operations with increasing durations (1ms to 100ms)
      for (let i = 1; i <= 100; i++) {
        const timer = monitor.startTimer('percentile_test');
        time += i;
        timer.stop();
      }

      const stats = monitor.getStats('percentile_test');
      expect(stats).not.toBeNull();

      // P50 should be in the middle range (45-55ms)
      expect(stats!.p50Duration).toBeGreaterThanOrEqual(45);
      expect(stats!.p50Duration).toBeLessThanOrEqual(55);

      // P95 should be in the upper range (90-100ms)
      expect(stats!.p95Duration).toBeGreaterThanOrEqual(90);
      expect(stats!.p95Duration).toBeLessThanOrEqual(100);

      // P99 should be in the very upper range (95-100ms)
      expect(stats!.p99Duration).toBeGreaterThanOrEqual(95);
      expect(stats!.p99Duration).toBeLessThanOrEqual(100);
    });

    it('returns null for non-existent operations', () => {
      const stats = monitor.getStats('non_existent');
      expect(stats).toBeNull();
    });
  });

  describe('LLM metrics tracking', () => {
    it('records LLM API calls', () => {
      monitor.recordLLMCall(2000, 500); // 2s latency, 500 tokens
      monitor.recordLLMCall(3000, 750); // 3s latency, 750 tokens

      const llmMetrics = monitor.getLLMMetrics();

      expect(llmMetrics.requestCount).toBe(2);
      expect(llmMetrics.totalTokens).toBe(1250);
      expect(llmMetrics.avgTokensPerRequest).toBe(625);
      expect(llmMetrics.avgLatencyMs).toBe(2500); // (2000+3000)/2
    });

    it('calculates estimated cost', () => {
      // Record 1000 tokens
      monitor.recordLLMCall(2000, 1000);

      const llmMetrics = monitor.getLLMMetrics();

      // Cost should be approximately 1000 * ((3 + 15) / 2) / 1M = $0.009
      expect(llmMetrics.estimatedCost).toBeCloseTo(0.009, 4);
    });

    it('handles zero requests', () => {
      const llmMetrics = monitor.getLLMMetrics();

      expect(llmMetrics.requestCount).toBe(0);
      expect(llmMetrics.totalTokens).toBe(0);
      expect(llmMetrics.avgTokensPerRequest).toBe(0);
      expect(llmMetrics.avgLatencyMs).toBe(0);
      expect(llmMetrics.estimatedCost).toBe(0);
    });
  });

  describe('Matching metrics tracking', () => {
    it('records tier 1 matches (autocomplete)', () => {
      monitor.recordMatch(1, 0.5); // 0.5ms for tier 1
      monitor.recordMatch(1, 0.7);

      const matchingMetrics = monitor.getMatchingMetrics();

      expect(matchingMetrics.tier1Matches).toBe(2);
      expect(matchingMetrics.tier1AvgMs).toBeCloseTo(0.6, 1);
    });

    it('records tier 2 matches (pattern)', () => {
      monitor.recordMatch(2, 5); // 5ms for tier 2
      monitor.recordMatch(2, 7);
      monitor.recordMatch(2, 3);

      const matchingMetrics = monitor.getMatchingMetrics();

      expect(matchingMetrics.tier2Matches).toBe(3);
      expect(matchingMetrics.tier2AvgMs).toBe(5); // (5+7+3)/3
    });

    it('records tier 3 matches (LLM)', () => {
      monitor.recordMatch(3, 2000); // 2s for LLM
      monitor.recordMatch(3, 3000);

      const matchingMetrics = monitor.getMatchingMetrics();

      expect(matchingMetrics.tier3Matches).toBe(2);
      expect(matchingMetrics.tier3AvgMs).toBe(2500);
    });

    it('tracks cache hits and misses', () => {
      monitor.recordMatch(1, 0.5, true); // cache hit
      monitor.recordMatch(2, 5, false); // cache miss
      monitor.recordMatch(3, 2000, true); // cache hit

      const matchingMetrics = monitor.getMatchingMetrics();

      expect(matchingMetrics.cacheHits).toBe(2);
      expect(matchingMetrics.cacheMisses).toBe(1);
    });
  });

  describe('Memory management', () => {
    it('limits metrics to maxMetrics', () => {
      let time = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => time);

      // Record 1500 metrics (max is 1000)
      for (let i = 0; i < 1500; i++) {
        const timer = monitor.startTimer('memory_test');
        time += 1;
        timer.stop();
      }

      const stats = monitor.getStats('memory_test');

      // Should only keep the last 1000 metrics
      expect(stats!.count).toBeLessThanOrEqual(1000);
    });
  });

  describe('Clear functionality', () => {
    it('clears all metrics', () => {
      monitor.recordLLMCall(2000, 500);
      monitor.recordMatch(1, 0.5);
      monitor.recordMatch(2, 5);

      expect(monitor.getLLMMetrics().requestCount).toBe(1);
      expect(monitor.getMatchingMetrics().tier1Matches).toBe(1);

      monitor.clear();

      expect(monitor.getLLMMetrics().requestCount).toBe(0);
      expect(monitor.getMatchingMetrics().tier1Matches).toBe(0);
      expect(monitor.getStats('test')).toBeNull();
    });
  });

  describe('Export functionality', () => {
    it('exports metrics as JSON', () => {
      monitor.recordLLMCall(2000, 500);
      monitor.recordMatch(1, 0.5);

      const exported = monitor.export();
      const data = JSON.parse(exported);

      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('metrics');
      expect(data).toHaveProperty('llmMetrics');
      expect(data).toHaveProperty('matchingMetrics');
      expect(data).toHaveProperty('stats');

      expect(data.llmMetrics.requestCount).toBe(1);
      expect(data.matchingMetrics.tier1Matches).toBe(1);
    });
  });

  describe('Singleton pattern', () => {
    it('returns same instance', () => {
      const instance1 = PerformanceMonitor.getInstance();
      const instance2 = PerformanceMonitor.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('exported singleton matches getInstance', () => {
      expect(performanceMonitor).toBe(PerformanceMonitor.getInstance());
    });
  });

  describe('Edge cases', () => {
    it('handles operations with zero duration', () => {
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(100) // start
        .mockReturnValueOnce(100); // stop (same time)

      const timer = monitor.startTimer('zero_duration');
      const duration = timer.stop();

      expect(duration).toBe(0);

      const stats = monitor.getStats('zero_duration');
      expect(stats!.averageDuration).toBe(0);
      expect(stats!.minDuration).toBe(0);
      expect(stats!.maxDuration).toBe(0);
    });

    it('handles single metric for percentiles', () => {
      let time = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => time);

      const timer = monitor.startTimer('single_metric');
      time += 100;
      timer.stop();

      const stats = monitor.getStats('single_metric');

      expect(stats!.p50Duration).toBe(100);
      expect(stats!.p95Duration).toBe(100);
      expect(stats!.p99Duration).toBe(100);
    });
  });
});
