import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import {
  AnalyticsAggregationService,
  OverviewMetrics,
} from '../../../core/services/analytics-aggregation.service';

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
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatTableModule,
    MatChipsModule,
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
  loadMetrics(): void {
    this.loading.set(true);
    this.error.set(null);

    this.analyticsAggregation.getOverviewMetrics().subscribe({
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
   */
  refresh(): void {
    this.loadMetrics();
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
}
