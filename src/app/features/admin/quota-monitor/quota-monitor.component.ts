import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QuotaMonitorService, QuotaStatus, OptimizationReport, QuotaAlert } from '../../../core/services/quota-monitor.service';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-quota-monitor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="quota-monitor">
      <h2>📊 Firestore Quota Monitor</h2>

      <!-- Quota Alert -->
      <div *ngIf="currentAlert" class="alert" [ngClass]="'alert-' + currentAlert.level">
        <strong>{{ currentAlert.level === 'critical' ? '🚨' : '⚠️' }} {{ currentAlert.message }}</strong>
      </div>

      <!-- Quota Status -->
      <div class="status-card" [ngClass]="'status-' + quotaStatus.status">
        <h3>Current Quota Status</h3>
        <div class="status-grid">
          <div class="stat">
            <div class="stat-label">Session Reads</div>
            <div class="stat-value">{{ quotaStatus.sessionReads | number }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Estimated Daily</div>
            <div class="stat-value">{{ quotaStatus.estimatedDailyReads | number }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Daily Limit</div>
            <div class="stat-value">{{ quotaStatus.dailyLimit | number }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Usage</div>
            <div class="stat-value">{{ quotaStatus.usagePercent | number: '1.1-1' }}%</div>
          </div>
          <div class="stat">
            <div class="stat-label">Remaining</div>
            <div class="stat-value">{{ quotaStatus.remaining | number }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Status</div>
            <div class="stat-value status-badge" [ngClass]="'badge-' + quotaStatus.status">
              {{ quotaStatus.status | uppercase }}
            </div>
          </div>
        </div>
      </div>

      <!-- Optimization Report -->
      <div class="report-card">
        <h3>Optimization Report</h3>
        <div class="optimization-summary">
          <div class="savings-badge" [ngClass]="getSavingsBadgeClass()">
            <div class="savings-percent">{{ report.savingsPercent | number: '1.0-0' }}%</div>
            <div class="savings-label">Savings</div>
          </div>
          <div class="savings-details">
            <p><strong>Expected (before optimization):</strong> {{ report.expectedBeforeOptimization | number }} reads</p>
            <p><strong>Actual (after optimization):</strong> {{ report.actualReads | number }} reads</p>
            <p><strong>Savings:</strong> {{ report.savings | number }} reads</p>
          </div>
        </div>

        <h4>Read Breakdown</h4>
        <div class="breakdown-grid">
          <div class="breakdown-item">
            <div class="breakdown-label">Analytics Queries</div>
            <div class="breakdown-value">{{ report.analyticsReads | number }}</div>
            <div class="breakdown-bar">
              <div class="breakdown-fill" [style.width.%]="getPercent(report.analyticsReads, report.sessionReads)"></div>
            </div>
          </div>
          <div class="breakdown-item">
            <div class="breakdown-label">Shared List Polls</div>
            <div class="breakdown-value">{{ report.sharedListPolls | number }}</div>
            <div class="breakdown-bar">
              <div class="breakdown-fill" [style.width.%]="getPercent(report.sharedListPolls, report.sessionReads)"></div>
            </div>
          </div>
          <div class="breakdown-item">
            <div class="breakdown-label">Batch Article Loading</div>
            <div class="breakdown-value">{{ report.batchLoadReads | number }}</div>
            <div class="breakdown-bar">
              <div class="breakdown-fill" [style.width.%]="getPercent(report.batchLoadReads, report.sessionReads)"></div>
            </div>
          </div>
          <div class="breakdown-item">
            <div class="breakdown-label">Other Operations</div>
            <div class="breakdown-value">{{ report.otherReads | number }}</div>
            <div class="breakdown-bar">
              <div class="breakdown-fill" [style.width.%]="getPercent(report.otherReads, report.sessionReads)"></div>
            </div>
          </div>
        </div>

        <!-- Recommendations -->
        <div *ngIf="report.recommendations.length > 0" class="recommendations">
          <h4>💡 Recommendations</h4>
          <ul>
            <li *ngFor="let rec of report.recommendations">{{ rec }}</li>
          </ul>
        </div>
      </div>

      <!-- Actions -->
      <div class="actions">
        <button (click)="refreshData()" class="btn btn-primary">🔄 Refresh</button>
        <button (click)="resetSession()" class="btn btn-secondary">🗑️ Reset Session</button>
        <button (click)="exportData()" class="btn btn-secondary">📥 Export Data</button>
      </div>

      <!-- Recent Operations -->
      <div class="operations-card">
        <h3>Recent Operations (Last 10)</h3>
        <div class="operations-list">
          <div *ngFor="let op of recentOperations" class="operation-item">
            <div class="op-time">{{ formatTime(op.timestamp) }}</div>
            <div class="op-name">{{ op.operation }}</div>
            <div class="op-count">+{{ op.count }} reads</div>
            <div class="op-total">Total: {{ op.sessionTotal }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .quota-monitor {
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }

    h2 {
      margin-bottom: 20px;
      color: #333;
    }

    .alert {
      padding: 15px;
      margin-bottom: 20px;
      border-radius: 8px;
      font-weight: 500;
    }

    .alert-warning {
      background: #fff3cd;
      border: 1px solid #ffc107;
      color: #856404;
    }

    .alert-critical {
      background: #f8d7da;
      border: 1px solid #f44336;
      color: #721c24;
    }

    .status-card, .report-card, .operations-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-top: 15px;
    }

    .stat {
      text-align: center;
    }

    .stat-label {
      font-size: 12px;
      color: #666;
      margin-bottom: 5px;
      text-transform: uppercase;
    }

    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #333;
    }

    .status-badge {
      padding: 5px 10px;
      border-radius: 20px;
      font-size: 14px;
      display: inline-block;
    }

    .badge-healthy {
      background: #d4edda;
      color: #155724;
    }

    .badge-warning {
      background: #fff3cd;
      color: #856404;
    }

    .badge-critical {
      background: #f8d7da;
      color: #721c24;
    }

    .status-healthy {
      border-left: 4px solid #4caf50;
    }

    .status-warning {
      border-left: 4px solid #ff9800;
    }

    .status-critical {
      border-left: 4px solid #f44336;
    }

    .optimization-summary {
      display: flex;
      gap: 20px;
      align-items: center;
      margin: 15px 0;
      padding: 15px;
      background: #f5f5f5;
      border-radius: 8px;
    }

    .savings-badge {
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      min-width: 120px;
    }

    .savings-badge.high {
      background: linear-gradient(135deg, #4caf50, #8bc34a);
      color: white;
    }

    .savings-badge.medium {
      background: linear-gradient(135deg, #ff9800, #ffc107);
      color: white;
    }

    .savings-badge.low {
      background: linear-gradient(135deg, #f44336, #ff5722);
      color: white;
    }

    .savings-percent {
      font-size: 36px;
      font-weight: bold;
    }

    .savings-label {
      font-size: 12px;
      text-transform: uppercase;
      opacity: 0.9;
    }

    .savings-details {
      flex: 1;
    }

    .savings-details p {
      margin: 5px 0;
      color: #666;
    }

    .breakdown-grid {
      margin-top: 15px;
    }

    .breakdown-item {
      margin-bottom: 15px;
    }

    .breakdown-label {
      font-size: 14px;
      color: #666;
      margin-bottom: 5px;
    }

    .breakdown-value {
      font-size: 18px;
      font-weight: bold;
      color: #333;
      margin-bottom: 5px;
    }

    .breakdown-bar {
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
    }

    .breakdown-fill {
      height: 100%;
      background: linear-gradient(90deg, #2196f3, #64b5f6);
      transition: width 0.3s ease;
    }

    .recommendations {
      margin-top: 20px;
      padding: 15px;
      background: #fff3e0;
      border-radius: 8px;
      border-left: 4px solid #ff9800;
    }

    .recommendations ul {
      margin: 10px 0 0 0;
      padding-left: 20px;
    }

    .recommendations li {
      margin: 5px 0;
      color: #666;
    }

    .actions {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }

    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #2196f3;
      color: white;
    }

    .btn-primary:hover {
      background: #1976d2;
    }

    .btn-secondary {
      background: #e0e0e0;
      color: #333;
    }

    .btn-secondary:hover {
      background: #d0d0d0;
    }

    .operations-list {
      margin-top: 15px;
    }

    .operation-item {
      display: grid;
      grid-template-columns: 100px 1fr 100px 120px;
      gap: 10px;
      padding: 10px;
      border-bottom: 1px solid #e0e0e0;
      font-size: 14px;
    }

    .operation-item:last-child {
      border-bottom: none;
    }

    .op-time {
      color: #999;
    }

    .op-name {
      color: #333;
      font-weight: 500;
    }

    .op-count {
      color: #2196f3;
      font-weight: bold;
    }

    .op-total {
      color: #666;
      text-align: right;
    }
  `]
})
export class QuotaMonitorComponent implements OnInit, OnDestroy {
  quotaStatus: QuotaStatus;
  report: OptimizationReport;
  recentOperations: any[] = [];
  currentAlert: QuotaAlert | null = null;

  private subscriptions: Subscription[] = [];

  constructor(private quotaMonitor: QuotaMonitorService) {
    this.quotaStatus = this.quotaMonitor.getQuotaStatus();
    this.report = this.quotaMonitor.getOptimizationReport();
  }

  ngOnInit(): void {
    // Subscribe to alerts
    this.subscriptions.push(
      this.quotaMonitor.getQuotaAlerts().subscribe(alert => {
        this.currentAlert = alert;
      })
    );

    // Auto-refresh every 5 seconds
    this.subscriptions.push(
      interval(5000).subscribe(() => {
        this.refreshData();
      })
    );

    this.refreshData();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  refreshData(): void {
    this.quotaStatus = this.quotaMonitor.getQuotaStatus();
    this.report = this.quotaMonitor.getOptimizationReport();
    this.recentOperations = this.quotaMonitor.getOperationLog().slice(-10).reverse();
  }

  resetSession(): void {
    if (confirm('Reset session counters? This will clear all tracking data.')) {
      this.quotaMonitor.resetSession();
      this.refreshData();
    }
  }

  exportData(): void {
    const data = this.quotaMonitor.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quota-monitor-${new Date().toISOString()}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  getSavingsBadgeClass(): string {
    const percent = this.report.savingsPercent;
    if (percent >= 80) return 'high';
    if (percent >= 50) return 'medium';
    return 'low';
  }

  getPercent(value: number, total: number): number {
    return total > 0 ? (value / total) * 100 : 0;
  }

  formatTime(date: Date): string {
    return new Date(date).toLocaleTimeString();
  }
}
