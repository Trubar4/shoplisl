// src/app/core/services/ai/circuit-breaker.service.ts
import { Injectable } from '@angular/core';
import { Observable, throwError, of, timer } from 'rxjs';
import { catchError, retryWhen, delay, take, concatMap, timeout } from 'rxjs/operators';
import { LoggerService } from '../logger.service';
import { PerformanceMonitorService } from './performance-monitor.service';

export enum CircuitState {
  CLOSED = 'closed',      // Normal operation
  OPEN = 'open',          // Failing, blocking requests
  HALF_OPEN = 'half_open' // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Failures before opening circuit
  successThreshold: number;      // Successes to close from half-open
  timeout: number;               // Request timeout in ms
  resetTimeout: number;          // Time before trying half-open
  retryAttempts: number;         // Max retry attempts
  retryDelay: number;            // Base retry delay in ms
  enableFallback: boolean;       // Enable fallback responses
  enableMetrics: boolean;        // Enable performance tracking
}

export interface CircuitBreakerMetrics {
  serviceName: string;
  state: CircuitState;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  lastFailureTime?: number;
  stateChangedAt: number;
  failureRate: number;
  averageResponseTime: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

export interface ServiceHealth {
  serviceName: string;
  isHealthy: boolean;
  state: CircuitState;
  lastCheck: number;
  failureRate: number;
  responseTime: number;
  errors: string[];
}

@Injectable({
  providedIn: 'root'
})
export class CircuitBreakerService {
  
  private circuits = new Map<string, CircuitBreakerState>();
  private readonly defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,      // Open after 5 failures
    successThreshold: 3,      // Close after 3 successes
    timeout: 10000,           // 10 second timeout
    resetTimeout: 30000,      // 30 seconds before half-open
    retryAttempts: 3,         // 3 retry attempts
    retryDelay: 1000,         // 1 second base delay
    enableFallback: true,     // Enable fallbacks
    enableMetrics: true       // Track performance
  };

  constructor(
    private logger: LoggerService,
    private performanceMonitor: PerformanceMonitorService
  ) {
    // Add to window for debugging
    if (typeof window !== 'undefined') {
      (window as any).circuitBreaker = this;
    }
    
    this.logger.info('ai', 'Circuit Breaker Service initialized');
  }

  /**
   * Execute operation with circuit breaker protection
   */
  execute<T>(
    serviceName: string,
    operation: () => Observable<T> | Promise<T>,
    fallback?: () => T,
    config?: Partial<CircuitBreakerConfig>
  ): Observable<T> {
    const circuit = this.getOrCreateCircuit(serviceName, config);
    const finalConfig = { ...this.defaultConfig, ...config };

    // Check circuit state before execution
    if (circuit.state === CircuitState.OPEN) {
      return this.handleOpenCircuit(serviceName, fallback);
    }

    const startTime = Date.now();
    const operationObservable = this.toObservable(operation);

    return operationObservable.pipe(
      timeout(finalConfig.timeout),
      
      // Retry with exponential backoff
      retryWhen(errors => 
        errors.pipe(
          take(finalConfig.retryAttempts),
          concatMap((error, index) => {
            const retryDelay = finalConfig.retryDelay * Math.pow(2, index);
            this.logger.warn('ai', `Retry ${index + 1}/${finalConfig.retryAttempts} for ${serviceName} in ${retryDelay}ms`, error);
            return timer(retryDelay);
          })
        )
      ),
      
      catchError(error => {
        this.recordFailure(serviceName, error, startTime);
        
        if (finalConfig.enableFallback && fallback) {
          this.logger.info('ai', `Using fallback for ${serviceName}`);
          return of(fallback());
        }
        
        return throwError(error);
      })
    ).pipe(
      // Record success on completion
      concatMap(result => {
        this.recordSuccess(serviceName, startTime);
        return of(result);
      })
    );
  }

  /**
   * Execute with automatic fallback to degraded mode
   */
  executeWithDegradation<T, F>(
    serviceName: string,
    primaryOperation: () => Observable<T> | Promise<T>,
    degradedOperation: () => Observable<F> | Promise<F>,
    config?: Partial<CircuitBreakerConfig>
  ): Observable<T | F> {
    const circuit = this.getOrCreateCircuit(serviceName, config);
    
    // If circuit is open, go straight to degraded mode
    if (circuit.state === CircuitState.OPEN) {
      this.logger.info('ai', `Circuit open for ${serviceName}, using degraded operation`);
      return this.toObservable(degradedOperation);
    }

    // Try primary operation with fallback to degraded
    return this.execute(
      serviceName,
      primaryOperation,
      undefined,
      config
    ).pipe(
      catchError(error => {
        this.logger.warn('ai', `Primary operation failed for ${serviceName}, falling back to degraded mode`, error);
        return this.toObservable(degradedOperation);
      })
    );
  }

  /**
   * Check service health
   */
  async checkServiceHealth(
    serviceName: string,
    healthCheck: () => Promise<boolean>
  ): Promise<ServiceHealth> {
    const circuit = this.circuits.get(serviceName);
    const startTime = Date.now();
    
    try {
      const isHealthy = await Promise.race([
        healthCheck(),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        )
      ]);
      
      const responseTime = Date.now() - startTime;
      
      return {
        serviceName,
        isHealthy,
        state: circuit?.state || CircuitState.CLOSED,
        lastCheck: Date.now(),
        failureRate: circuit ? this.calculateFailureRate(circuit) : 0,
        responseTime,
        errors: []
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        serviceName,
        isHealthy: false,
        state: circuit?.state || CircuitState.CLOSED,
        lastCheck: Date.now(),
        failureRate: circuit ? this.calculateFailureRate(circuit) : 1,
        responseTime,
        errors: [error instanceof Error ? error.message : 'Health check failed']
      };
    }
  }

  /**
   * Get comprehensive system health status
   */
  async getSystemHealth(): Promise<{
    overallHealth: 'healthy' | 'degraded' | 'unhealthy';
    services: ServiceHealth[];
    summary: {
      totalServices: number;
      healthyServices: number;
      degradedServices: number;
      unhealthyServices: number;
    };
  }> {
    const serviceNames = Array.from(this.circuits.keys());
    const healthChecks = serviceNames.map(name => 
      this.checkServiceHealth(name, () => this.basicHealthCheck(name))
    );
    
    const services = await Promise.all(healthChecks);
    const healthyCount = services.filter(s => s.isHealthy).length;
    const degradedCount = services.filter(s => !s.isHealthy && s.state === CircuitState.HALF_OPEN).length;
    const unhealthyCount = services.filter(s => !s.isHealthy && s.state === CircuitState.OPEN).length;
    
    let overallHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (unhealthyCount > serviceNames.length * 0.5) {
      overallHealth = 'unhealthy';
    } else if (degradedCount > 0 || unhealthyCount > 0) {
      overallHealth = 'degraded';
    }
    
    return {
      overallHealth,
      services,
      summary: {
        totalServices: serviceNames.length,
        healthyServices: healthyCount,
        degradedServices: degradedCount,
        unhealthyServices: unhealthyCount
      }
    };
  }

  /**
   * Force circuit state change (for testing/manual override)
   */
  forceCircuitState(serviceName: string, state: CircuitState): void {
    const circuit = this.getOrCreateCircuit(serviceName);
    circuit.state = state;
    circuit.stateChangedAt = Date.now();
    
    this.logger.warn('ai', `Manually forced ${serviceName} circuit to ${state}`);
  }

  /**
   * Reset circuit to closed state
   */
  resetCircuit(serviceName: string): void {
    const circuit = this.circuits.get(serviceName);
    if (circuit) {
      circuit.state = CircuitState.CLOSED;
      circuit.consecutiveFailures = 0;
      circuit.consecutiveSuccesses = 0;
      circuit.stateChangedAt = Date.now();
      
      this.logger.info('ai', `Reset circuit for ${serviceName}`);
    }
  }

  /**
   * Get metrics for specific service
   */
  getServiceMetrics(serviceName: string): CircuitBreakerMetrics | null {
    const circuit = this.circuits.get(serviceName);
    if (!circuit) return null;

    return {
      serviceName,
      state: circuit.state,
      totalRequests: circuit.totalRequests,
      successfulRequests: circuit.successfulRequests,
      failedRequests: circuit.failedRequests,
      lastFailureTime: circuit.lastFailureTime,
      stateChangedAt: circuit.stateChangedAt,
      failureRate: this.calculateFailureRate(circuit),
      averageResponseTime: circuit.totalResponseTime / Math.max(1, circuit.totalRequests),
      consecutiveFailures: circuit.consecutiveFailures,
      consecutiveSuccesses: circuit.consecutiveSuccesses
    };
  }

  /**
   * Get metrics for all services
   */
  getAllMetrics(): CircuitBreakerMetrics[] {
    return Array.from(this.circuits.keys())
      .map(serviceName => this.getServiceMetrics(serviceName))
      .filter(metrics => metrics !== null) as CircuitBreakerMetrics[];
  }

  /**
   * Generate comprehensive status report
   */
  generateStatusReport(): string {
    const metrics = this.getAllMetrics();
    const timestamp = new Date().toLocaleString();
    
    let report = `🔌 Circuit Breaker Status Report - ${timestamp}\n`;
    report += `===============================================\n\n`;
    
    if (metrics.length === 0) {
      report += `No services monitored yet.\n`;
      return report;
    }
    
    // Summary
    const closedCount = metrics.filter(m => m.state === CircuitState.CLOSED).length;
    const openCount = metrics.filter(m => m.state === CircuitState.OPEN).length;
    const halfOpenCount = metrics.filter(m => m.state === CircuitState.HALF_OPEN).length;
    
    report += `📊 Summary:\n`;
    report += `- Total Services: ${metrics.length}\n`;
    report += `- 🟢 Healthy (Closed): ${closedCount}\n`;
    report += `- 🟡 Testing (Half-Open): ${halfOpenCount}\n`;
    report += `- 🔴 Failed (Open): ${openCount}\n\n`;
    
    // Service Details
    report += `📋 Service Details:\n`;
    for (const metric of metrics) {
      const stateEmoji = this.getStateEmoji(metric.state);
      report += `${stateEmoji} ${metric.serviceName}:\n`;
      report += `  - State: ${metric.state}\n`;
      report += `  - Requests: ${metric.totalRequests} (${metric.successfulRequests} success, ${metric.failedRequests} failed)\n`;
      report += `  - Failure Rate: ${(metric.failureRate * 100).toFixed(1)}%\n`;
      report += `  - Avg Response: ${metric.averageResponseTime.toFixed(0)}ms\n`;
      report += `  - Consecutive Failures: ${metric.consecutiveFailures}\n\n`;
    }
    
    return report;
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

  private getOrCreateCircuit(serviceName: string, config?: Partial<CircuitBreakerConfig>): CircuitBreakerState {
    if (!this.circuits.has(serviceName)) {
      this.circuits.set(serviceName, {
        serviceName,
        state: CircuitState.CLOSED,
        config: { ...this.defaultConfig, ...config },
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalResponseTime: 0,
        stateChangedAt: Date.now(),
        lastFailureTime: undefined
      });
    }
    
    return this.circuits.get(serviceName)!;
  }

  private toObservable<T>(operation: () => Observable<T> | Promise<T>): Observable<T> {
    const result = operation();
    if (result instanceof Promise) {
      return new Observable<T>(subscriber => {
        result
          .then(data => {
            subscriber.next(data);
            subscriber.complete();
          })
          .catch(error => subscriber.error(error));
      });
    }
    return result;
  }

  private handleOpenCircuit<T>(serviceName: string, fallback?: () => T): Observable<T> {
    const circuit = this.circuits.get(serviceName)!;
    const now = Date.now();
    
    // Check if we should try half-open
    if (now - circuit.stateChangedAt >= circuit.config.resetTimeout) {
      circuit.state = CircuitState.HALF_OPEN;
      circuit.stateChangedAt = now;
      this.logger.info('ai', `Circuit for ${serviceName} moved to half-open state`);
      
      // Allow the request to proceed in half-open state
      return throwError(new Error(`Circuit breaker open for ${serviceName} - transitioning to half-open`));
    }
    
    if (fallback) {
      this.logger.info('ai', `Circuit open for ${serviceName}, using fallback`);
      return of(fallback());
    }
    
    return throwError(new Error(`Circuit breaker open for ${serviceName}`));
  }

  private recordSuccess(serviceName: string, startTime: number): void {
    const circuit = this.circuits.get(serviceName);
    if (!circuit) return;

    const responseTime = Date.now() - startTime;
    
    circuit.totalRequests++;
    circuit.successfulRequests++;
    circuit.totalResponseTime += responseTime;
    circuit.consecutiveFailures = 0;
    circuit.consecutiveSuccesses++;

    // Track performance metrics
    if (circuit.config.enableMetrics) {
      this.performanceMonitor.endOperation(serviceName, true, false);
    }

    // Transition from half-open to closed if enough successes
    if (circuit.state === CircuitState.HALF_OPEN && 
        circuit.consecutiveSuccesses >= circuit.config.successThreshold) {
      circuit.state = CircuitState.CLOSED;
      circuit.stateChangedAt = Date.now();
      this.logger.info('ai', `Circuit for ${serviceName} closed after ${circuit.consecutiveSuccesses} successful requests`);
    }
  }

  private recordFailure(serviceName: string, error: any, startTime: number): void {
    const circuit = this.circuits.get(serviceName);
    if (!circuit) return;

    const responseTime = Date.now() - startTime;
    
    circuit.totalRequests++;
    circuit.failedRequests++;
    circuit.totalResponseTime += responseTime;
    circuit.consecutiveFailures++;
    circuit.consecutiveSuccesses = 0;
    circuit.lastFailureTime = Date.now();

    // Track performance metrics
    if (circuit.config.enableMetrics) {
      this.performanceMonitor.endOperation(serviceName, false, false, error.message);
    }

    this.logger.warn('ai', `Circuit breaker recorded failure for ${serviceName}`, {
      consecutiveFailures: circuit.consecutiveFailures,
      threshold: circuit.config.failureThreshold,
      error: error.message
    });

    // Open circuit if failure threshold reached
    if (circuit.consecutiveFailures >= circuit.config.failureThreshold) {
      circuit.state = CircuitState.OPEN;
      circuit.stateChangedAt = Date.now();
      this.logger.error('ai', `Circuit OPENED for ${serviceName} after ${circuit.consecutiveFailures} consecutive failures`);
    }
  }

  private calculateFailureRate(circuit: CircuitBreakerState): number {
    if (circuit.totalRequests === 0) return 0;
    return circuit.failedRequests / circuit.totalRequests;
  }

  private async basicHealthCheck(serviceName: string): Promise<boolean> {
    const circuit = this.circuits.get(serviceName);
    if (!circuit) return true;
    
    // Simple health check based on recent failure rate
    const recentFailureRate = this.calculateFailureRate(circuit);
    return recentFailureRate < 0.5; // Healthy if less than 50% failure rate
  }

  private getStateEmoji(state: CircuitState): string {
    switch (state) {
      case CircuitState.CLOSED: return '🟢';
      case CircuitState.HALF_OPEN: return '🟡';
      case CircuitState.OPEN: return '🔴';
      default: return '⚪';
    }
  }
}

// Internal circuit state interface
interface CircuitBreakerState {
  serviceName: string;
  state: CircuitState;
  config: CircuitBreakerConfig;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalResponseTime: number;
  stateChangedAt: number;
  lastFailureTime?: number;
}

// Decorator for automatic circuit breaker protection
export function WithCircuitBreaker(
  serviceName: string,
  config?: Partial<CircuitBreakerConfig>
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = function (...args: any[]) {
      const circuitBreaker = (this as any).circuitBreaker || (this as any).circuit;
      
      if (!circuitBreaker) {
        return originalMethod.apply(this, args);
      }
      
      return circuitBreaker.execute(
        serviceName,
        () => originalMethod.apply(this, args),
        undefined,
        config
      );
    };
    
    return descriptor;
  };
}