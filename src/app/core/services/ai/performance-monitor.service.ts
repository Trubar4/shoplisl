// src/app/core/services/ai/performance-monitor.service.ts
import { Injectable } from '@angular/core';
import { LoggerService } from '../logger.service';

export interface PerformanceMetric {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  cacheHit?: boolean;
  error?: string;
}

export interface PerformanceStats {
  totalOperations: number;
  averageResponseTime: number;
  successRate: number;
  cacheHitRate: number;
  slowestOperations: PerformanceMetric[];
  recentErrors: PerformanceMetric[];
}

@Injectable({
  providedIn: 'root'
})
export class PerformanceMonitorService {
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 1000; // Keep last 1000 operations
  private readonly slowOperationThreshold = 2000; // 2 seconds

  constructor(private logger: LoggerService) {}

  /**
   * Start timing an operation
   */
  startOperation(operation: string): string {
    const id = `${operation}_${Date.now()}_${Math.random()}`;
    const metric: PerformanceMetric = {
      operation,
      startTime: performance.now(),
      success: false
    };

    this.metrics.push(metric);
    this.trimMetrics();

    return id;
  }

  /**
   * End timing an operation
   */
  endOperation(operation: string, success: boolean, cacheHit?: boolean, error?: string): void {
    const metric = this.metrics
      .filter(m => m.operation === operation && !m.endTime)
      .pop(); // Get the most recent unfinished operation

    if (metric) {
      metric.endTime = performance.now();
      metric.duration = metric.endTime - metric.startTime;
      metric.success = success;
      metric.cacheHit = cacheHit;
      metric.error = error;

      // Log slow operations
      if (metric.duration > this.slowOperationThreshold) {
        this.logger.warn('analytics', `Slow operation detected: ${operation} took ${metric.duration.toFixed(2)}ms`);
      }

      // Log cache hits for optimization insights
      if (cacheHit) {
        this.logger.debug('cache', `Cache hit for ${operation} (${metric.duration.toFixed(2)}ms)`);
      }
    }
  }

  /**
   * Record a cached operation (much faster)
   */
  recordCacheHit(operation: string, duration: number = 1): void {
    const metric: PerformanceMetric = {
      operation,
      startTime: performance.now() - duration,
      endTime: performance.now(),
      duration,
      success: true,
      cacheHit: true
    };

    this.metrics.push(metric);
    this.trimMetrics();
  }

  /**
   * Get comprehensive performance statistics
   */
  getStats(): PerformanceStats {
    const completedMetrics = this.metrics.filter(m => m.endTime !== undefined);
    
    if (completedMetrics.length === 0) {
      return {
        totalOperations: 0,
        averageResponseTime: 0,
        successRate: 0,
        cacheHitRate: 0,
        slowestOperations: [],
        recentErrors: []
      };
    }

    const totalOperations = completedMetrics.length;
    const successfulOperations = completedMetrics.filter(m => m.success).length;
    const cacheHits = completedMetrics.filter(m => m.cacheHit).length;
    
    const averageResponseTime = completedMetrics.reduce((sum, m) => sum + (m.duration || 0), 0) / totalOperations;
    const successRate = successfulOperations / totalOperations;
    const cacheHitRate = cacheHits / totalOperations;

    const slowestOperations = completedMetrics
      .filter(m => (m.duration || 0) > this.slowOperationThreshold)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10);

    const recentErrors = completedMetrics
      .filter(m => !m.success && m.error)
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
      .slice(0, 10);

    return {
      totalOperations,
      averageResponseTime,
      successRate,
      cacheHitRate,
      slowestOperations,
      recentErrors
    };
  }

  /**
   * Get operations by type
   */
  getOperationStats(operation: string): {
    count: number;
    averageTime: number;
    successRate: number;
    cacheHitRate: number;
  } {
    const operationMetrics = this.metrics.filter(m => 
      m.operation === operation && m.endTime !== undefined
    );

    if (operationMetrics.length === 0) {
      return { count: 0, averageTime: 0, successRate: 0, cacheHitRate: 0 };
    }

    const count = operationMetrics.length;
    const averageTime = operationMetrics.reduce((sum, m) => sum + (m.duration || 0), 0) / count;
    const successCount = operationMetrics.filter(m => m.success).length;
    const cacheHitCount = operationMetrics.filter(m => m.cacheHit).length;

    return {
      count,
      averageTime,
      successRate: successCount / count,
      cacheHitRate: cacheHitCount / count
    };
  }

  /**
   * Performance decorator for automatic timing
   */
  withTiming<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    
    return fn()
      .then(result => {
        this.endOperation(operation, true);
        return result;
      })
      .catch(error => {
        this.endOperation(operation, false, false, error.message);
        throw error;
      });
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.logger.debug('analytics', 'Performance metrics cleared');
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get performance recommendations
   */
  getRecommendations(): string[] {
    const stats = this.getStats();
    const recommendations: string[] = [];

    if (stats.cacheHitRate < 0.3) {
      recommendations.push('💡 Niedrige Cache-Trefferrate - erwäge längere TTL-Zeiten');
    }

    if (stats.averageResponseTime > 1000) {
      recommendations.push('🐌 Hohe Antwortzeiten - prüfe langsame Operationen');
    }

    if (stats.successRate < 0.95) {
      recommendations.push('❌ Niedrige Erfolgsrate - verbessere Fehlerbehandlung');
    }

    if (stats.slowestOperations.length > 0) {
      const slowOp = stats.slowestOperations[0];
      recommendations.push(`⚠️ Langsamste Operation: ${slowOp.operation} (${slowOp.duration?.toFixed(2)}ms)`);
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Performance sieht gut aus!');
    }

    return recommendations;
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const stats = this.getStats();
    const recommendations = this.getRecommendations();

    return `
📊 AI Services Performance Report
================================

📈 General Statistics:
- Total Operations: ${stats.totalOperations}
- Average Response Time: ${stats.averageResponseTime.toFixed(2)}ms
- Success Rate: ${(stats.successRate * 100).toFixed(1)}%
- Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(1)}%

🔍 Specific Operations:
${this.getTopOperations().map(op => 
  `- ${op.operation}: ${op.count} calls, ${op.averageTime.toFixed(2)}ms avg, ${(op.cacheHitRate * 100).toFixed(1)}% cached`
).join('\n')}

💡 Recommendations:
${recommendations.map(rec => `- ${rec}`).join('\n')}

Generated: ${new Date().toLocaleString()}
    `.trim();
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

  private trimMetrics(): void {
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  private getTopOperations(): Array<{operation: string; count: number; averageTime: number; cacheHitRate: number}> {
    const operationGroups = this.metrics
      .filter(m => m.endTime !== undefined)
      .reduce((groups, metric) => {
        if (!groups[metric.operation]) {
          groups[metric.operation] = [];
        }
        groups[metric.operation].push(metric);
        return groups;
      }, {} as Record<string, PerformanceMetric[]>);

    return Object.entries(operationGroups)
      .map(([operation, metrics]) => {
        const count = metrics.length;
        const averageTime = metrics.reduce((sum, m) => sum + (m.duration || 0), 0) / count;
        const cacheHits = metrics.filter(m => m.cacheHit).length;
        const cacheHitRate = cacheHits / count;

        return { operation, count, averageTime, cacheHitRate };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }
}

// Performance decorator for easy method timing
export function MonitorPerformance(operation?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const operationName = operation || `${target.constructor.name}.${propertyKey}`;
    
    descriptor.value = function (...args: any[]) {
      const monitor = (this as any).performanceMonitor || (this as any).monitor;
      
      if (!monitor) {
        return originalMethod.apply(this, args);
      }
      
      return monitor.withTiming(operationName, () => originalMethod.apply(this, args));
    };
    
    return descriptor;
  };
}