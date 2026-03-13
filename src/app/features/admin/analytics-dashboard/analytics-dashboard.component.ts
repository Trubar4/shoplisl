import { Component, OnInit, signal, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
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
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import {
  AnalyticsAggregationService,
  OverviewMetrics,
  FeatureAdoptionMetrics,
  RetentionMetrics,
  SessionDepthMetrics,
  AICommandBreakdown,
} from '../../../core/services/analytics-aggregation.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { RawEventsViewerComponent } from '../raw-events-viewer/raw-events-viewer.component';
import { AuthDebugComponent } from '../auth-debug/auth-debug.component';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

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
    MatSelectModule,
    MatFormFieldModule,
    FormsModule,
    RawEventsViewerComponent,
    AuthDebugComponent,
  ],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.scss'],
})
export class AnalyticsDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  metrics = signal<OverviewMetrics | null>(null);
  featureAdoption = signal<FeatureAdoptionMetrics | null>(null);
  retention = signal<RetentionMetrics | null>(null);
  sessionDepth = signal<SessionDepthMetrics | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  selectedDateRange = 30; // Default to 30 days
  aiCommandBreakdown = signal<AICommandBreakdown | null>(null);

  // Flush state
  flushing = signal(false);
  flushResult = signal<string | null>(null);

  // Table columns for failed commands
  failedCommandsColumns = ['inputText', 'commandType', 'errorMessage', 'timestamp'];

  // Chart references
  @ViewChild('userGrowthChart') userGrowthChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('aiCommandChart') aiCommandChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('dailyActivityChart') dailyActivityChartRef!: ElementRef<HTMLCanvasElement>;

  private userGrowthChart?: Chart;
  private aiCommandChart?: Chart;
  private dailyActivityChart?: Chart;

  constructor(
    private analyticsAggregation: AnalyticsAggregationService,
    private analyticsService: AnalyticsService,
  ) {}

  ngOnInit(): void {
    this.loadMetrics();
  }

  ngAfterViewInit(): void {
    // Charts will be created after data is loaded
  }

  ngOnDestroy(): void {
    // Clean up charts
    this.userGrowthChart?.destroy();
    this.aiCommandChart?.destroy();
    this.dailyActivityChart?.destroy();
  }

  /**
   * Load analytics metrics, feature adoption, and retention data
   */
  loadMetrics(forceRefresh = false): void {
    this.loading.set(true);
    this.error.set(null);

    this.analyticsAggregation.getOverviewMetrics(forceRefresh, this.selectedDateRange).subscribe({
      next: (metrics) => {
        this.metrics.set(metrics);
        this.loading.set(false);
        // Load charts after metrics are ready
        setTimeout(() => this.loadCharts(), 100);
      },
      error: (err) => {
        console.error('Failed to load analytics:', err);
        this.error.set('Failed to load analytics. Please try again.');
        this.loading.set(false);
      },
    });

    this.analyticsAggregation.getFeatureAdoptionRates(this.selectedDateRange).subscribe({
      next: (adoption) => this.featureAdoption.set(adoption),
      error: (err) => console.error('Failed to load feature adoption:', err),
    });

    this.analyticsAggregation.getRetentionMetrics(this.selectedDateRange).subscribe({
      next: (retention) => this.retention.set(retention),
      error: (err) => console.error('Failed to load retention metrics:', err),
    });

    this.analyticsAggregation.getSessionDepthMetrics(this.selectedDateRange).subscribe({
      next: (depth) => this.sessionDepth.set(depth),
      error: (err) => console.error('Failed to load session depth metrics:', err),
    });
  }

  /**
   * Force-flush pending analytics events to Firestore
   */
  async flushEvents(): Promise<void> {
    const pending = this.analyticsService.getBufferSize();
    if (pending === 0) {
      this.flushResult.set('Buffer is already empty.');
      setTimeout(() => this.flushResult.set(null), 3000);
      return;
    }
    this.flushing.set(true);
    this.flushResult.set(null);
    try {
      await this.analyticsService.flush();
      this.flushResult.set(`Flushed ${pending} event${pending !== 1 ? 's' : ''} successfully.`);
    } catch (err) {
      this.flushResult.set('Flush failed – see console for details.');
      console.error('Manual flush error:', err);
    } finally {
      this.flushing.set(false);
      setTimeout(() => this.flushResult.set(null), 4000);
    }
  }

  /** Current number of events waiting in the buffer */
  getBufferSize(): number {
    return this.analyticsService.getBufferSize();
  }

  /**
   * Handle date range change
   */
  onDateRangeChange(): void {
    console.log(`📅 Date range changed to ${this.selectedDateRange} days`);
    this.loadMetrics(true); // Force refresh with new date range
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

  /**
   * Load all charts
   */
  private loadCharts(): void {
    if (!this.userGrowthChartRef || !this.aiCommandChartRef || !this.dailyActivityChartRef) {
      console.warn('Chart canvas elements not ready yet');
      return;
    }

    this.createUserGrowthChart();
    this.createAICommandChart();
    this.createDailyActivityChart();
  }

  /**
   * Create user growth chart (line chart)
   */
  private createUserGrowthChart(): void {
    this.analyticsAggregation.getUserGrowthTimeSeries(this.selectedDateRange).subscribe({
      next: (data) => {
        // Destroy existing chart if it exists
        this.userGrowthChart?.destroy();

        const ctx = this.userGrowthChartRef.nativeElement.getContext('2d');
        if (!ctx) return;

        const config: ChartConfiguration = {
          type: 'line',
          data: {
            labels: data.map(d => d.date),
            datasets: [{
              label: 'Active Users',
              data: data.map(d => d.value),
              borderColor: '#3f51b5',
              backgroundColor: 'rgba(63, 81, 181, 0.1)',
              tension: 0.3,
              fill: true,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: {
                display: true,
                position: 'top',
              },
              title: {
                display: false,
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  precision: 0
                }
              }
            }
          }
        };

        this.userGrowthChart = new Chart(ctx, config);
      },
      error: (err) => {
        console.error('Failed to load user growth data:', err);
      }
    });
  }

  /** Human-readable labels and descriptions for AI command types */
  readonly commandTypeLabels: Record<string, string> = {
    standard: 'Standard',
    recipe: 'Recipe parsing',
    plus_prefix: '+ Quick add',
    multi_item: 'Multi-item',
    continuation: 'Continuation',
    api_key: 'API key mgmt',
    help: 'Help',
    test: 'Test',
    show_lists: 'Show lists',
    negative_response: 'Negative resp.',
    contextual: 'Contextual',
    create_list: 'Create list',
    unknown: 'Unknown',
  };

  readonly commandTypeDescriptions: Record<string, string> = {
    standard: 'Default text commands that add single items to a list',
    recipe: 'Paste a recipe to extract and add all ingredients automatically',
    plus_prefix: 'Quick-add shortcut — type "+milk" to skip AI and add directly',
    multi_item: 'Comma-separated items added in one go, e.g. "milk, bread, eggs"',
    continuation: 'Follow-up to a previous command using conversation context',
    api_key: 'Setting or managing the Groq API key',
    help: 'Asking for help or usage instructions',
    test: 'Test/debug commands used during development',
    show_lists: 'Requesting to display available shopping lists',
    negative_response: 'User said "no" / declined a suggestion',
    contextual: 'Context-aware command that references the current list state',
    create_list: 'Creating a new shopping list, e.g. "Erstelle Liste Wocheneinkauf"',
    unknown: 'Events with no recorded command type (legacy data)',
  };

  getCommandTypePct(key: string): string {
    const bd = this.aiCommandBreakdown();
    if (!bd || bd.totalCommands === 0) return '';
    const count = bd.commandTypeCounts[key] ?? 0;
    if (count === 0) return '';
    return ((count / bd.totalCommands) * 100).toFixed(1) + '%';
  }

  /**
   * Create AI command chart (pie chart)
   */
  private createAICommandChart(): void {
    this.analyticsAggregation.getAICommandBreakdown().subscribe({
      next: (data) => {
        this.aiCommandBreakdown.set(data);
        // Destroy existing chart if it exists
        this.aiCommandChart?.destroy();

        const ctx = this.aiCommandChartRef.nativeElement.getContext('2d');
        if (!ctx) return;

        const commandTypes = Object.keys(data.commandTypeCounts);
        const commandCounts = Object.values(data.commandTypeCounts);
        const total = commandCounts.reduce((sum, c) => sum + c, 0);

        const labels = commandTypes.map((type) => {
          const label = this.commandTypeLabels[type] || type;
          const count = data.commandTypeCounts[type];
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
          return `${label} — ${pct}%`;
        });

        const config: ChartConfiguration = {
          type: 'pie',
          data: {
            labels,
            datasets: [{
              data: commandCounts,
              backgroundColor: [
                '#3f51b5',
                '#ff4081',
                '#4caf50',
                '#ff9800',
                '#9c27b0',
                '#00bcd4',
                '#ffeb3b',
                '#795548',
                '#607d8b',
                '#e91e63',
                '#8bc34a',
                '#03a9f4',
                '#cddc39',
              ],
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: {
                display: true,
                position: 'right',
              },
              title: {
                display: false,
              },
              tooltip: {
                callbacks: {
                  label: (context) => {
                    const rawType = commandTypes[context.dataIndex];
                    const count = context.parsed;
                    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
                    return `${count} commands (${pct}%)`;
                  },
                  afterLabel: (context) => {
                    const rawType = commandTypes[context.dataIndex];
                    return this.commandTypeDescriptions[rawType] || '';
                  },
                },
              },
            }
          }
        };

        this.aiCommandChart = new Chart(ctx, config);
      },
      error: (err) => {
        console.error('Failed to load AI command breakdown:', err);
      }
    });
  }

  /**
   * Create daily activity chart (bar chart)
   */
  private createDailyActivityChart(): void {
    this.analyticsAggregation.getDailyActivityTimeSeries(this.selectedDateRange).subscribe({
      next: (data) => {
        // Destroy existing chart if it exists
        this.dailyActivityChart?.destroy();

        const ctx = this.dailyActivityChartRef.nativeElement.getContext('2d');
        if (!ctx) return;

        const config: ChartConfiguration = {
          type: 'bar',
          data: {
            labels: data.map(d => d.date),
            datasets: [
              {
                label: 'Lists Created',
                data: data.map(d => d.listsCreated),
                backgroundColor: '#4caf50',
              },
              {
                label: 'Articles Added',
                data: data.map(d => d.articlesCreated),
                backgroundColor: '#3f51b5',
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: {
                display: true,
                position: 'top',
              },
              title: {
                display: false,
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  precision: 0
                }
              }
            }
          }
        };

        this.dailyActivityChart = new Chart(ctx, config);
      },
      error: (err) => {
        console.error('Failed to load daily activity data:', err);
      }
    });
  }
}
