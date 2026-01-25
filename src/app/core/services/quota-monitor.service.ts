import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Quota Monitoring Service
 *
 * Tracks Firestore read operations and provides quota usage analytics.
 * Helps monitor the effectiveness of quota optimizations.
 */
@Injectable({
  providedIn: 'root'
})
export class QuotaMonitorService {
  // Daily limits (Firebase free tier)
  private readonly DAILY_READ_LIMIT = 50000;
  private readonly WARNING_THRESHOLD = 0.7; // 70% of limit
  private readonly CRITICAL_THRESHOLD = 0.9; // 90% of limit

  // Operation counters
  private sessionReads = 0;
  private estimatedDailyReads = 0;
  private operationLog: QuotaOperation[] = [];

  // Optimization metrics
  private optimizationMetrics = new BehaviorSubject<OptimizationMetrics>({
    analyticsReads: 0,
    sharedListPolls: 0,
    batchLoadReads: 0,
    totalReads: 0,
    timestamp: new Date()
  });

  // Alert subject
  private quotaAlerts = new BehaviorSubject<QuotaAlert | null>(null);

  constructor() {
    this.loadSessionData();
    this.startDailyReset();
    this.startAutomaticReporting();
  }

  /**
   * AUTOMATIC REPORTING: Log quota status every 10 seconds
   * Eliminates need for manual testing
   */
  private startAutomaticReporting(): void {
    let lastReportedReads = 0;

    setInterval(() => {
      const newReads = this.sessionReads - lastReportedReads;

      if (newReads > 0) {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📊 AUTOMATIC QUOTA REPORT (every 10 seconds)`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`New reads in last 10 sec: ${newReads}`);
        console.log(`Total session reads: ${this.sessionReads}`);
        console.log(`Status: ${this.getQuotaStatus().status}`);

        // If significant reads occurred, show breakdown
        if (newReads > 5) {
          console.log(`\n⚠️ Significant activity detected! Breakdown:`);
          this.logDetailedBreakdown();
        }

        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      }

      lastReportedReads = this.sessionReads;
    }, 10000); // Every 10 seconds
  }

  /**
   * Track a read operation
   */
  trackRead(operation: string, count: number = 1, metadata?: any): void {
    this.sessionReads += count;
    this.estimatedDailyReads += count;

    // Log operation
    this.operationLog.push({
      timestamp: new Date(),
      operation,
      count,
      metadata,
      sessionTotal: this.sessionReads
    });

    // Keep last 500 operations (increased from 100 to catch all operations)
    if (this.operationLog.length > 500) {
      this.operationLog = this.operationLog.slice(-500);
    }

    // Update metrics based on operation type
    this.updateMetrics(operation, count);

    // Check thresholds
    this.checkThresholds();

    // Persist to localStorage
    this.saveSessionData();

    console.log(`📊 QUOTA: ${operation} (+${count} reads) | Session: ${this.sessionReads} | Estimated Daily: ${this.estimatedDailyReads}`);
  }

  /**
   * Update optimization metrics
   */
  private updateMetrics(operation: string, count: number): void {
    const current = this.optimizationMetrics.value;

    if (operation.includes('analytics') || operation.includes('Analytics')) {
      current.analyticsReads += count;
    } else if (operation.includes('poll') || operation.includes('Poll')) {
      current.sharedListPolls += count;
    } else if (operation.includes('batch') || operation.includes('Batch')) {
      current.batchLoadReads += count;
    }

    current.totalReads += count;
    current.timestamp = new Date();

    this.optimizationMetrics.next(current);
  }

  /**
   * Check if we're approaching quota limits
   */
  private checkThresholds(): void {
    const usagePercent = this.estimatedDailyReads / this.DAILY_READ_LIMIT;

    if (usagePercent >= this.CRITICAL_THRESHOLD) {
      this.quotaAlerts.next({
        level: 'critical',
        message: `CRITICAL: ${Math.round(usagePercent * 100)}% of daily quota used (${this.estimatedDailyReads}/${this.DAILY_READ_LIMIT})`,
        reads: this.estimatedDailyReads,
        limit: this.DAILY_READ_LIMIT,
        timestamp: new Date()
      });
    } else if (usagePercent >= this.WARNING_THRESHOLD) {
      this.quotaAlerts.next({
        level: 'warning',
        message: `Warning: ${Math.round(usagePercent * 100)}% of daily quota used (${this.estimatedDailyReads}/${this.DAILY_READ_LIMIT})`,
        reads: this.estimatedDailyReads,
        limit: this.DAILY_READ_LIMIT,
        timestamp: new Date()
      });
    }
  }

  /**
   * Get current quota status
   */
  getQuotaStatus(): QuotaStatus {
    const usagePercent = this.estimatedDailyReads / this.DAILY_READ_LIMIT;
    const remaining = this.DAILY_READ_LIMIT - this.estimatedDailyReads;

    return {
      sessionReads: this.sessionReads,
      estimatedDailyReads: this.estimatedDailyReads,
      dailyLimit: this.DAILY_READ_LIMIT,
      usagePercent: usagePercent * 100,
      remaining,
      status: usagePercent >= this.CRITICAL_THRESHOLD ? 'critical'
            : usagePercent >= this.WARNING_THRESHOLD ? 'warning'
            : 'healthy'
    };
  }

  /**
   * Get optimization metrics observable
   */
  getOptimizationMetrics(): Observable<OptimizationMetrics> {
    return this.optimizationMetrics.asObservable();
  }

  /**
   * Get quota alerts observable
   */
  getQuotaAlerts(): Observable<QuotaAlert | null> {
    return this.quotaAlerts.asObservable();
  }

  /**
   * Get recent operation log
   */
  getOperationLog(): QuotaOperation[] {
    return [...this.operationLog];
  }

  /**
   * Generate optimization report
   */
  getOptimizationReport(): OptimizationReport {
    const metrics = this.optimizationMetrics.value;
    const status = this.getQuotaStatus();

    // Calculate optimization effectiveness
    // Before optimizations: ~13,000 reads per similar session
    // Target: ~500-1,000 reads per session
    const expectedBeforeOptimization = 13000;
    const actualReads = this.sessionReads;
    const savings = expectedBeforeOptimization - actualReads;
    const savingsPercent = (savings / expectedBeforeOptimization) * 100;

    return {
      sessionReads: this.sessionReads,
      estimatedDailyReads: this.estimatedDailyReads,
      analyticsReads: metrics.analyticsReads,
      sharedListPolls: metrics.sharedListPolls,
      batchLoadReads: metrics.batchLoadReads,
      otherReads: metrics.totalReads - metrics.analyticsReads - metrics.sharedListPolls - metrics.batchLoadReads,
      expectedBeforeOptimization,
      actualReads,
      savings,
      savingsPercent,
      status: status.status,
      recommendations: this.getRecommendations(status, metrics)
    };
  }

  /**
   * Get recommendations based on usage patterns
   */
  private getRecommendations(status: QuotaStatus, metrics: OptimizationMetrics): string[] {
    const recommendations: string[] = [];

    // Check analytics usage
    if (metrics.analyticsReads > 1000) {
      recommendations.push('Analytics queries are high. Consider increasing cache duration or reducing dashboard refreshes.');
    }

    // Check polling frequency
    if (metrics.sharedListPolls > 100) {
      recommendations.push('Many shared list polls detected. Consider increasing poll interval from 20s to 30s.');
    }

    // Check batch loading
    if (metrics.batchLoadReads > 500) {
      recommendations.push('High batch loading reads. Verify article owner caching is working correctly.');
    }

    // Check overall status
    if (status.status === 'critical') {
      recommendations.push('CRITICAL: Approaching daily quota limit. Consider temporary rate limiting or contact support for quota increase.');
    } else if (status.status === 'warning') {
      recommendations.push('Warning: High quota usage detected. Monitor closely and optimize high-read operations.');
    }

    // Check if optimizations are working
    if (this.sessionReads > 5000) {
      recommendations.push('Session reads higher than expected. Verify all optimizations are active (check browser console for optimization logs).');
    }

    return recommendations;
  }

  /**
   * Reset session counters
   */
  resetSession(): void {
    this.sessionReads = 0;
    this.operationLog = [];
    this.optimizationMetrics.next({
      analyticsReads: 0,
      sharedListPolls: 0,
      batchLoadReads: 0,
      totalReads: 0,
      timestamp: new Date()
    });
    this.saveSessionData();
    console.log('📊 QUOTA: Session counters reset');
  }

  /**
   * Reset daily counters (called at midnight)
   */
  private resetDaily(): void {
    this.estimatedDailyReads = 0;
    this.saveSessionData();
    console.log('📊 QUOTA: Daily counters reset');
  }

  /**
   * Start daily reset timer
   */
  private startDailyReset(): void {
    // Calculate time until midnight
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeUntilMidnight = tomorrow.getTime() - now.getTime();

    // Schedule reset at midnight
    setTimeout(() => {
      this.resetDaily();
      // Then reset every 24 hours
      setInterval(() => this.resetDaily(), 24 * 60 * 60 * 1000);
    }, timeUntilMidnight);
  }

  /**
   * Save session data to localStorage
   */
  private saveSessionData(): void {
    const data = {
      sessionReads: this.sessionReads,
      estimatedDailyReads: this.estimatedDailyReads,
      lastUpdate: new Date().toISOString(),
      metrics: this.optimizationMetrics.value
    };
    localStorage.setItem('quota_monitor', JSON.stringify(data));
  }

  /**
   * Load session data from localStorage
   */
  private loadSessionData(): void {
    const stored = localStorage.getItem('quota_monitor');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        const lastUpdate = new Date(data.lastUpdate);
        const now = new Date();

        // Only restore if from today
        if (lastUpdate.toDateString() === now.toDateString()) {
          this.sessionReads = data.sessionReads || 0;
          this.estimatedDailyReads = data.estimatedDailyReads || 0;
          if (data.metrics) {
            this.optimizationMetrics.next(data.metrics);
          }
          console.log('📊 QUOTA: Restored session data', data);
        } else {
          console.log('📊 QUOTA: Previous session was from different day, starting fresh');
        }
      } catch (error) {
        console.warn('Failed to load quota monitor data:', error);
      }
    }
  }

  /**
   * Export monitoring data for analysis
   */
  exportData(): string {
    const report = this.getOptimizationReport();
    const status = this.getQuotaStatus();
    const log = this.getOperationLog();

    return JSON.stringify({
      timestamp: new Date().toISOString(),
      status,
      report,
      operationLog: log
    }, null, 2);
  }

  /**
   * DEBUGGING: Log detailed quota breakdown by operation type
   * Helps identify which operations are consuming the most reads
   */
  logDetailedBreakdown(): void {
    const log = this.getOperationLog();
    const breakdown = new Map<string, { count: number; totalReads: number }>();

    // Group operations by type
    log.forEach(op => {
      const existing = breakdown.get(op.operation) || { count: 0, totalReads: 0 };
      breakdown.set(op.operation, {
        count: existing.count + 1,
        totalReads: existing.totalReads + op.count
      });
    });

    // Sort by total reads (highest first)
    const sorted = Array.from(breakdown.entries())
      .sort((a, b) => b[1].totalReads - a[1].totalReads);

    console.log('\n📊 ===== QUOTA BREAKDOWN (Last 500 Operations) =====');
    console.log(`Total Session Reads: ${this.sessionReads}`);
    console.log(`Estimated Daily Reads: ${this.estimatedDailyReads}`);
    console.log('\nReads by Operation Type:');
    sorted.forEach(([operation, stats]) => {
      const percent = (stats.totalReads / this.sessionReads * 100).toFixed(1);
      console.log(`  ${operation}: ${stats.totalReads} reads (${stats.count} times, ${percent}%)`);
    });
    console.log('==================================================\n');
  }

  /**
   * DEBUGGING: Check if share-invites listener is causing excessive reads
   */
  checkShareInvitesListenerHealth(): { isHealthy: boolean; message: string; fireCount: number; totalReads: number } {
    const log = this.getOperationLog();
    const shareInvitesOps = log.filter(op => op.operation === 'Share-Invites Listener');

    const fireCount = shareInvitesOps.length;
    const totalReads = shareInvitesOps.reduce((sum, op) => sum + op.count, 0);

    // Healthy: Should fire 0-2 times per session (initial + maybe one reload before cleanup)
    // Unhealthy: Fires 3+ times (means cleanup didn't work or listener keeps reloading)
    const isHealthy = fireCount <= 2;

    let message: string;
    if (fireCount === 0) {
      message = '✅ Share-invites listener has not fired yet (expected at app start)';
    } else if (fireCount <= 2) {
      message = `✅ Share-invites listener is healthy (fired ${fireCount} times, ${totalReads} reads)`;
    } else {
      message = `⚠️ Share-invites listener fired ${fireCount} times! Should be cleaned up after first list detail visit. Check cleanup logs.`;
    }

    return { isHealthy, message, fireCount, totalReads };
  }
}

// ==========================================
// Interfaces
// ==========================================

export interface QuotaOperation {
  timestamp: Date;
  operation: string;
  count: number;
  metadata?: any;
  sessionTotal: number;
}

export interface OptimizationMetrics {
  analyticsReads: number;
  sharedListPolls: number;
  batchLoadReads: number;
  totalReads: number;
  timestamp: Date;
}

export interface QuotaStatus {
  sessionReads: number;
  estimatedDailyReads: number;
  dailyLimit: number;
  usagePercent: number;
  remaining: number;
  status: 'healthy' | 'warning' | 'critical';
}

export interface QuotaAlert {
  level: 'warning' | 'critical';
  message: string;
  reads: number;
  limit: number;
  timestamp: Date;
}

export interface OptimizationReport {
  sessionReads: number;
  estimatedDailyReads: number;
  analyticsReads: number;
  sharedListPolls: number;
  batchLoadReads: number;
  otherReads: number;
  expectedBeforeOptimization: number;
  actualReads: number;
  savings: number;
  savingsPercent: number;
  status: 'healthy' | 'warning' | 'critical';
  recommendations: string[];
}
