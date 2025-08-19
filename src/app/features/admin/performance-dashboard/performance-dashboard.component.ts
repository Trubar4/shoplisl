// src/app/features/admin/performance-dashboard/performance-dashboard.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { interval, Subscription } from 'rxjs';
import { PerformanceMonitorService, PerformanceStats } from '../../../core/services/ai/performance-monitor.service';
import { AICachingService } from '../../../core/services/ai/caching.service';
import { AIOrchestrationService } from '../../../core/services/ai/orchestration.service';

@Component({
  selector: 'app-performance-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="performance-dashboard">
      <!-- Header -->
      <div class="dashboard-header">
        <h2>🚀 AI Services Performance Dashboard</h2>
        <div class="actions">
          <button (click)="toggleAutoRefresh()" 
                  [class.active]="autoRefresh"
                  class="btn-toggle">
            {{ autoRefresh ? '⏸️ Pause' : '▶️ Auto Refresh' }}
          </button>
          <button (click)="refreshData()" class="btn-refresh">🔄 Refresh</button>
          <button (click)="clearMetrics()" class="btn-clear">🧹 Clear</button>
          <button (click)="exportReport()" class="btn-export">📊 Export</button>
        </div>
      </div>

      <!-- Key Metrics Cards -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-icon">⚡</div>
          <div class="metric-content">
            <div class="metric-value">{{ stats.averageResponseTime | number:'1.0-2' }}ms</div>
            <div class="metric-label">Avg Response Time</div>
          </div>
          <div class="metric-trend" [class]="getResponseTimeTrend()">
            {{ getResponseTimeTrendIcon() }}
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon">💾</div>
          <div class="metric-content">
            <div class="metric-value">{{ (stats.cacheHitRate * 100) | number:'1.0-1' }}%</div>
            <div class="metric-label">Cache Hit Rate</div>
          </div>
          <div class="metric-trend" [class]="getCacheHitTrend()">
            {{ getCacheHitTrendIcon() }}
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon">✅</div>
          <div class="metric-content">
            <div class="metric-value">{{ (stats.successRate * 100) | number:'1.0-1' }}%</div>
            <div class="metric-label">Success Rate</div>
          </div>
          <div class="metric-trend" [class]="getSuccessRateTrend()">
            {{ getSuccessRateTrendIcon() }}
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon">📊</div>
          <div class="metric-content">
            <div class="metric-value">{{ stats.totalOperations | number }}</div>
            <div class="metric-label">Total Operations</div>
          </div>
          <div class="metric-trend neutral">📈</div>
        </div>
      </div>

      <!-- Charts Section -->
      <div class="charts-section">
        <div class="chart-container">
          <h3>🎯 Operations Breakdown</h3>
          <div class="operations-chart">
            <div *ngFor="let op of topOperations" class="operation-bar">
              <div class="operation-info">
                <span class="operation-name">{{ op.operation }}</span>
                <span class="operation-stats">
                  {{ op.count }} calls • {{ op.averageTime | number:'1.0-2' }}ms avg
                </span>
              </div>
              <div class="operation-progress">
                <div class="progress-bar">
                  <div class="progress-fill" 
                       [style.width.%]="(op.count / maxOperationCount) * 100">
                  </div>
                </div>
                <span class="cache-indicator" 
                      [class.high]="op.cacheHitRate > 0.7"
                      [class.medium]="op.cacheHitRate > 0.3 && op.cacheHitRate <= 0.7"
                      [class.low]="op.cacheHitRate <= 0.3">
                  💾 {{ (op.cacheHitRate * 100) | number:'1.0-0' }}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="chart-container">
          <h3>🐌 Slowest Operations</h3>
          <div class="slow-operations">
            <div *ngFor="let op of stats.slowestOperations.slice(0, 5)" class="slow-operation">
              <div class="slow-op-header">
                <span class="slow-op-name">{{ op.operation }}</span>
                <span class="slow-op-time" [class]="getSlownessSeverity(op.duration || 0)">
                  {{ op.duration | number:'1.0-2' }}ms
                </span>
              </div>
              <div class="slow-op-details">
                <span class="slow-op-status" [class]="op.success ? 'success' : 'error'">
                  {{ op.success ? '✅' : '❌' }} {{ op.success ? 'Success' : 'Failed' }}
                </span>
                <span class="slow-op-cache">
                  {{ op.cacheHit ? '💾 Cached' : '🔄 Fresh' }}
                </span>
              </div>
            </div>
            <div *ngIf="stats.slowestOperations.length === 0" class="no-slow-ops">
              ✨ No slow operations detected!
            </div>
          </div>
        </div>
      </div>

      <!-- Recommendations Section -->
      <div class="recommendations-section">
        <h3>💡 Performance Recommendations</h3>
        <div class="recommendations-list">
          <div *ngFor="let rec of recommendations" class="recommendation">
            <span class="rec-icon">{{ getRecommendationIcon(rec) }}</span>
            <span class="rec-text">{{ rec }}</span>
          </div>
        </div>
      </div>

      <!-- Cache Status -->
      <div class="cache-section">
        <h3>💾 Cache Status</h3>
        <div class="cache-stats">
          <div class="cache-stat">
            <span class="cache-label">Cache Size:</span>
            <span class="cache-value">{{ cacheStats.size }} entries</span>
          </div>
          <div class="cache-stat">
            <span class="cache-label">Memory Usage:</span>
            <span class="cache-value">{{ cacheStats.memoryUsage }}</span>
          </div>
          <div class="cache-stat">
            <span class="cache-label">Hit Rate:</span>
            <span class="cache-value">{{ (cacheStats.hitRate * 100) | number:'1.0-1' }}%</span>
          </div>
        </div>
        <div class="cache-actions">
          <button (click)="optimizeCache()" class="btn-optimize">🚀 Optimize Cache</button>
          <button (click)="clearCache()" class="btn-clear-cache">🗑️ Clear Cache</button>
        </div>
      </div>

      <!-- Recent Errors -->
      <div class="errors-section" *ngIf="stats.recentErrors.length > 0">
        <h3>❌ Recent Errors</h3>
        <div class="errors-list">
          <div *ngFor="let error of stats.recentErrors.slice(0, 5)" class="error-item">
            <div class="error-header">
              <span class="error-operation">{{ error.operation }}</span>
              <span class="error-time">{{ formatTime(error.startTime) }}</span>
            </div>
            <div class="error-message">{{ error.error }}</div>
          </div>
        </div>
      </div>

      <!-- System Health -->
      <div class="health-section">
        <h3>🏥 System Health</h3>
        <div class="health-indicator" [class]="systemHealth.health">
          <div class="health-icon">{{ getHealthIcon() }}</div>
          <div class="health-status">
            <div class="health-label">{{ systemHealth.health.toUpperCase() }}</div>
            <div class="health-details">{{ getHealthMessage() }}</div>
          </div>
        </div>
      </div>

      <!-- Live Updates -->
      <div class="live-updates" *ngIf="autoRefresh">
        <span class="live-indicator">🔴 Live</span>
        <span class="last-update">Last update: {{ lastUpdate | date:'HH:mm:ss' }}</span>
      </div>
    </div>
  `,
  styles: [`
    .performance-dashboard {
      padding: 20px;
      background: #f5f5f5;
      min-height: 100vh;
    }

    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }

    .dashboard-header h2 {
      margin: 0;
      color: #333;
    }

    .actions {
      display: flex;
      gap: 10px;
    }

    .btn-toggle, .btn-refresh, .btn-clear, .btn-export,
    .btn-optimize, .btn-clear-cache {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }

    .btn-toggle { background: #e3f2fd; color: #1976d2; }
    .btn-toggle.active { background: #4caf50; color: white; }
    .btn-refresh { background: #f3e5f5; color: #7b1fa2; }
    .btn-clear { background: #fce4ec; color: #c2185b; }
    .btn-export { background: #e8f5e8; color: #388e3c; }
    .btn-optimize { background: #fff3e0; color: #f57c00; }
    .btn-clear-cache { background: #ffebee; color: #d32f2f; }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .metric-card {
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      display: flex;
      align-items: center;
      gap: 15px;
    }

    .metric-icon {
      font-size: 2rem;
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f0f0f0;
      border-radius: 50%;
    }

    .metric-content {
      flex: 1;
    }

    .metric-value {
      font-size: 1.5rem;
      font-weight: bold;
      color: #333;
    }

    .metric-label {
      color: #666;
      font-size: 0.9rem;
    }

    .metric-trend {
      font-size: 1.2rem;
    }

    .metric-trend.good { color: #4caf50; }
    .metric-trend.bad { color: #f44336; }
    .metric-trend.neutral { color: #9e9e9e; }

    .charts-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 30px;
    }

    .chart-container {
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }

    .chart-container h3 {
      margin: 0 0 20px 0;
      color: #333;
    }

    .operation-bar {
      margin-bottom: 15px;
    }

    .operation-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
    }

    .operation-name {
      font-weight: bold;
      color: #333;
    }

    .operation-stats {
      color: #666;
      font-size: 0.9rem;
    }

    .operation-progress {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .progress-bar {
      flex: 1;
      height: 8px;
      background: #f0f0f0;
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #4caf50, #8bc34a);
      transition: width 0.3s ease;
    }

    .cache-indicator {
      font-size: 0.8rem;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .cache-indicator.high { background: #e8f5e8; color: #2e7d32; }
    .cache-indicator.medium { background: #fff3e0; color: #f57c00; }
    .cache-indicator.low { background: #ffebee; color: #d32f2f; }

    .slow-operations {
      max-height: 300px;
      overflow-y: auto;
    }

    .slow-operation {
      padding: 10px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      margin-bottom: 10px;
    }

    .slow-op-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
    }

    .slow-op-name {
      font-weight: bold;
      color: #333;
    }

    .slow-op-time {
      font-weight: bold;
    }

    .slow-op-time.severe { color: #d32f2f; }
    .slow-op-time.moderate { color: #f57c00; }
    .slow-op-time.mild { color: #ffa726; }

    .slow-op-details {
      display: flex;
      gap: 15px;
      font-size: 0.9rem;
    }

    .slow-op-status.success { color: #4caf50; }
    .slow-op-status.error { color: #f44336; }

    .recommendations-section, .cache-section, .errors-section, .health-section {
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }

    .recommendations-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .recommendation {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      background: #f9f9f9;
      border-radius: 6px;
    }

    .rec-icon {
      font-size: 1.2rem;
    }

    .cache-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }

    .cache-stat {
      display: flex;
      justify-content: space-between;
      padding: 10px;
      background: #f9f9f9;
      border-radius: 6px;
    }

    .cache-actions {
      display: flex;
      gap: 10px;
    }

    .errors-list {
      max-height: 250px;
      overflow-y: auto;
    }

    .error-item {
      padding: 10px;
      border: 1px solid #ffcdd2;
      background: #ffebee;
      border-radius: 6px;
      margin-bottom: 10px;
    }

    .error-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
    }

    .error-operation {
      font-weight: bold;
      color: #d32f2f;
    }

    .error-time {
      color: #666;
      font-size: 0.9rem;
    }

    .error-message {
      color: #666;
      font-size: 0.9rem;
    }

    .health-indicator {
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 15px;
      border-radius: 6px;
    }

    .health-indicator.healthy { background: #e8f5e8; }
    .health-indicator.degraded { background: #fff3e0; }
    .health-indicator.unhealthy { background: #ffebee; }

    .health-icon {
      font-size: 2rem;
    }

    .health-label {
      font-weight: bold;
      font-size: 1.1rem;
    }

    .health-details {
      color: #666;
      font-size: 0.9rem;
    }

    .live-updates {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: white;
      padding: 10px 15px;
      border-radius: 6px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .live-indicator {
      color: #f44336;
      font-weight: bold;
    }

    .last-update {
      color: #666;
      font-size: 0.9rem;
    }

    .no-slow-ops {
      text-align: center;
      color: #4caf50;
      font-style: italic;
      padding: 20px;
    }

    @media (max-width: 768px) {
      .charts-section {
        grid-template-columns: 1fr;
      }
      
      .metrics-grid {
        grid-template-columns: 1fr;
      }

      .dashboard-header {
        flex-direction: column;
        gap: 15px;
      }

      .actions {
        flex-wrap: wrap;
      }
    }
  `]
})
export class PerformanceDashboardComponent implements OnInit, OnDestroy {
  stats: PerformanceStats = {
    totalOperations: 0,
    averageResponseTime: 0,
    successRate: 0,
    cacheHitRate: 0,
    slowestOperations: [],
    recentErrors: []
  };

  cacheStats = {
    size: 0,
    hitRate: 0,
    memoryUsage: '0KB'
  };

  systemHealth = {
    health: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
    uptime: 0,
    lastError: undefined as string | undefined
  };

  recommendations: string[] = [];
  topOperations: any[] = [];
  maxOperationCount = 1;
  autoRefresh = true;
  lastUpdate = new Date();

  private refreshSubscription?: Subscription;

  constructor(
    private performanceMonitor: PerformanceMonitorService,
    private cachingService: AICachingService,
    private orchestrationService: AIOrchestrationService
  ) {}

  ngOnInit(): void {
    // Add some test data for debugging
    this.performanceMonitor.startOperation('test_operation');
    setTimeout(() => {
      this.performanceMonitor.endOperation('test_operation', true, false);
      this.refreshData();
    }, 100);
    
    this.refreshData();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  refreshData(): void {
    this.stats = this.performanceMonitor.getStats();
    this.cacheStats = this.cachingService.getStats();
    
    // Fix the type issue here:
    const serviceStatus = this.orchestrationService.getServiceStatus();
    this.systemHealth = {
      health: serviceStatus.health,
      uptime: serviceStatus.uptime,
      lastError: serviceStatus.lastError || undefined
    };
    
    this.recommendations = this.performanceMonitor.getRecommendations();
    this.updateTopOperations();
    this.lastUpdate = new Date();
  }

  toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
    if (this.autoRefresh) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
  }

  clearMetrics(): void {
    if (confirm('Are you sure you want to clear all performance metrics?')) {
      this.performanceMonitor.clearMetrics();
      this.refreshData();
    }
  }

  exportReport(): void {
    const report = this.performanceMonitor.generateReport();
    const blob = new Blob([report], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-performance-report-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  async optimizeCache(): Promise<void> {
    try {
      const result = await this.orchestrationService.optimizePerformance();
      alert(`Cache optimized! Cleared ${result.cacheCleared} entries, freed ${result.memoryFreed}`);
      this.refreshData();
    } catch (error) {
      alert('Cache optimization failed: ' + error);
    }
  }

  clearCache(): void {
    if (confirm('Are you sure you want to clear the entire cache?')) {
      this.cachingService.clear();
      this.refreshData();
    }
  }

  // Helper methods for UI
  getResponseTimeTrend(): string {
    return this.stats.averageResponseTime < 500 ? 'good' : 
           this.stats.averageResponseTime < 2000 ? 'neutral' : 'bad';
  }

  getResponseTimeTrendIcon(): string {
    return this.stats.averageResponseTime < 500 ? '⚡' : 
           this.stats.averageResponseTime < 2000 ? '⚠️' : '🐌';
  }

  getCacheHitTrend(): string {
    return this.stats.cacheHitRate > 0.7 ? 'good' : 
           this.stats.cacheHitRate > 0.3 ? 'neutral' : 'bad';
  }

  getCacheHitTrendIcon(): string {
    return this.stats.cacheHitRate > 0.7 ? '🚀' : 
           this.stats.cacheHitRate > 0.3 ? '📈' : '📉';
  }

  getSuccessRateTrend(): string {
    return this.stats.successRate > 0.95 ? 'good' : 
           this.stats.successRate > 0.8 ? 'neutral' : 'bad';
  }

  getSuccessRateTrendIcon(): string {
    return this.stats.successRate > 0.95 ? '✅' : 
           this.stats.successRate > 0.8 ? '⚠️' : '❌';
  }

  getSlownessSeverity(duration: number): string {
    return duration > 5000 ? 'severe' : 
           duration > 2000 ? 'moderate' : 'mild';
  }

  getRecommendationIcon(rec: string): string {
    if (rec.includes('Cache')) return '💾';
    if (rec.includes('langsam')) return '🐌';
    if (rec.includes('Fehler')) return '❌';
    if (rec.includes('gut')) return '✅';
    return '💡';
  }

  getHealthIcon(): string {
    return this.systemHealth.health === 'healthy' ? '💚' :
           this.systemHealth.health === 'degraded' ? '💛' : '❤️';
  }

  getHealthMessage(): string {
    return this.systemHealth.health === 'healthy' ? 'All systems operational' :
           this.systemHealth.health === 'degraded' ? 'Some performance issues detected' :
           'Critical issues require attention';
  }

  formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  private startAutoRefresh(): void {
    this.refreshSubscription = interval(5000).subscribe(() => {
      this.refreshData();
    });
  }

  private stopAutoRefresh(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
      this.refreshSubscription = undefined;
    }
  }

  private updateTopOperations(): void {
    // Get top operations from performance monitor
    const operations = ['getDisambiguationOptions', 'getSmartSuggestions', 'processMultiItem', 'handleChoice', 'createArticle'];
    
    this.topOperations = operations.map(op => {
      const stats = this.performanceMonitor.getOperationStats(op);
      return {
        operation: op,
        count: stats.count,
        averageTime: stats.averageTime,
        cacheHitRate: stats.cacheHitRate
      };
    }).filter(op => op.count > 0)
      .sort((a, b) => b.count - a.count);

    this.maxOperationCount = Math.max(...this.topOperations.map(op => op.count), 1);
  }
}