/**
 * Enterprise Sliding Window Telemetry Aggregator
 * 
 * Computes rolling averages, event rates, focus intervals, and EWMA
 * over moving time windows (e.g. 60s window) for employee activity monitoring and AI proctoring.
 */

export interface TimedSample {
  timestamp: number;
  value: number;
}

export class SlidingWindowAggregator {
  private windowSizeMs: number;
  private samples: TimedSample[] = [];
  private ewmaValue: number | null = null;
  private ewmaAlpha: number;

  constructor(windowSizeSeconds = 60, ewmaAlpha = 0.2) {
    this.windowSizeMs = windowSizeSeconds * 1000;
    this.ewmaAlpha = Math.max(0.01, Math.min(1.0, ewmaAlpha));
  }

  /**
   * Add a data sample with timestamp. Updates both rolling window and EWMA.
   */
  addSample(value: number, timestamp = Date.now()): void {
    this.samples.push({ timestamp, value });
    this.cleanExpired(timestamp);

    // Update Exponentially Weighted Moving Average (EWMA)
    if (this.ewmaValue === null) {
      this.ewmaValue = value;
    } else {
      this.ewmaValue = this.ewmaAlpha * value + (1 - this.ewmaAlpha) * this.ewmaValue;
    }
  }

  /**
   * Remove samples older than windowSizeMs.
   */
  private cleanExpired(now = Date.now()): void {
    const cutoff = now - this.windowSizeMs;
    while (this.samples.length > 0 && this.samples[0].timestamp < cutoff) {
      this.samples.shift();
    }
  }

  /**
   * Calculate average value in the current sliding window.
   */
  getAverage(now = Date.now()): number {
    this.cleanExpired(now);
    if (this.samples.length === 0) return 0;
    const sum = this.samples.reduce((acc, s) => acc + s.value, 0);
    return sum / this.samples.length;
  }

  /**
   * Get the current EWMA smoothed value.
   */
  getEWMA(): number {
    return this.ewmaValue ?? 0;
  }

  /**
   * Calculate total count of events in current sliding window.
   */
  getEventCount(now = Date.now()): number {
    this.cleanExpired(now);
    return this.samples.length;
  }

  /**
   * Check if event frequency in window exceeds a critical threshold.
   */
  isRateLimitExceeded(maxAllowedEvents: number, now = Date.now()): boolean {
    return this.getEventCount(now) > maxAllowedEvents;
  }

  /**
   * Get maximum value in window.
   */
  getMax(now = Date.now()): number {
    this.cleanExpired(now);
    if (this.samples.length === 0) return 0;
    return Math.max(...this.samples.map(s => s.value));
  }

  /**
   * Get minimum value in window.
   */
  getMin(now = Date.now()): number {
    this.cleanExpired(now);
    if (this.samples.length === 0) return 0;
    return Math.min(...this.samples.map(s => s.value));
  }

  /**
   * Reset aggregator.
   */
  reset(): void {
    this.samples = [];
    this.ewmaValue = null;
  }
}
