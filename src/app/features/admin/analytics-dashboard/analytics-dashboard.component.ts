import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AnalyticsAggregationService,
  OverviewMetrics,
} from '../../../core/services/analytics-aggregation.service';
import { RawEventsViewerComponent } from '../raw-events-viewer/raw-events-viewer.component';
import { AuthDebugComponent } from '../auth-debug/auth-debug.component';

/**
 * Analytics Dashboard Component
 *
 * Displays admin analytics including:
 * - Top 5 priority metrics
 * - AI command breakdown
 * - Failed command examples
 */
@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatTableModule,
    MatChipsModule,
    MatTooltipModule,
    RawEventsViewerComponent,
    AuthDebugComponent,
  ],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.scss'],
})
export class AnalyticsDashboardComponent implements OnInit {
  metrics = signal<OverviewMetrics | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  // Table columns for failed commands
  failedCommandsColumns = ['inputText', 'commandType', 'errorMessage', 'timestamp'];

  constructor(
    private analyticsAggregation: AnalyticsAggregationService
  ) {}

  ngOnInit(): void {
    this.loadMetrics();
  }

  /**
   * Load analytics metrics
   */
  loadMetrics(forceRefresh = false): void {
    this.loading.set(true);
    this.error.set(null);

    this.analyticsAggregation.getOverviewMetrics(forceRefresh).subscribe({
      next: (metrics) => {
        this.metrics.set(metrics);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load analytics:', err);
        this.error.set('Failed to load analytics. Please try again.');
        this.loading.set(false);
      },
    });
  }

  /**
   * Manual refresh (for testing)
   * Forces fresh data from Firestore, bypassing cache
   */
  refresh(): void {
    console.log('🔄 Manual refresh triggered - forcing fresh data');
    this.loadMetrics(true); // Force refresh
  }

  /**
   * Format date for display
   */
  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  /**
   * Get color for success rate
   */
  getSuccessRateColor(rate: number): string {
    if (rate >= 80) return 'primary';
    if (rate >= 60) return 'accent';
    return 'warn';
  }

  /**
   * Check if we should show login warning
   * (if lists and articles are 0 but users is not, likely permission issue)
   */
  showLoginWarning(): boolean {
    const m = this.metrics();
    if (!m) return false;

    // If we have users but no lists/articles, it's likely a permission issue
    return m.totalUsers > 0 && m.totalLists === 0 && m.totalArticles === 0;
  }

  /**
   * Export failed commands to CSV
   */
  exportFailedCommands(): void {
    const metrics = this.metrics();
    if (!metrics || metrics.failedCommands.length === 0) {
      return;
    }

    // Create CSV header
    const header = ['Timestamp', 'Input Text', 'Command Type', 'Error Message'];

    // Create CSV rows
    const rows = metrics.failedCommands.map(cmd => [
      this.formatDate(cmd.timestamp),
      `"${cmd.inputText.replace(/"/g, '""')}"`, // Escape quotes
      cmd.commandType,
      `"${cmd.errorMessage.replace(/"/g, '""')}"` // Escape quotes
    ]);

    // Combine header and rows
    const csvContent = [
      header.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `failed-ai-commands-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log('📥 Exported failed commands to CSV');
  }
}
