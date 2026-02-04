import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from '@angular/fire/firestore';
import { AnalyticsEventType } from '../../../core/models/analytics.model';
import * as XLSX from 'xlsx';

interface AnalyticsEventRow {
  id: string;
  eventType: string;
  userId: string;
  timestamp: Date;
  sessionId: string;
  metadata: Record<string, any>;
}

interface ExportFilters {
  dateFrom: Date | null;
  dateTo: Date | null;
  userId: string;
  eventType: string;
}

/**
 * Analytics Events Export Component
 *
 * Allows admin to query and export analytics events to Excel
 * with filters for date range, userId, and eventType.
 */
@Component({
  selector: 'app-analytics-events-export',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatChipsModule,
    MatTooltipModule,
    MatPaginatorModule,
  ],
  templateUrl: './analytics-events-export.component.html',
  styleUrls: ['./analytics-events-export.component.scss'],
})
export class AnalyticsEventsExportComponent implements OnInit {
  private firestore = inject(Firestore);

  // Filter state
  filters: ExportFilters = {
    dateFrom: null,
    dateTo: null,
    userId: '',
    eventType: '',
  };

  // Data state
  events = signal<AnalyticsEventRow[]>([]);
  filteredEvents = signal<AnalyticsEventRow[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  totalCount = signal(0);

  // Pagination
  pageSize = 50;
  pageIndex = 0;

  // All event types for dropdown
  eventTypes = Object.values(AnalyticsEventType);

  // Table columns
  displayedColumns = ['timestamp', 'eventType', 'userId', 'sessionId', 'metadata'];

  ngOnInit(): void {
    // Set default date range to last 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    this.filters.dateFrom = thirtyDaysAgo;
    this.filters.dateTo = now;
  }

  /**
   * Load events from Firestore with current filters
   */
  async loadEvents(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.pageIndex = 0;

    try {
      const eventsRef = collection(this.firestore, 'analytics/events/items');

      // Build query constraints
      const constraints: any[] = [orderBy('timestamp', 'desc')];

      // Date range filter (Firestore query)
      if (this.filters.dateFrom) {
        const startOfDay = new Date(this.filters.dateFrom);
        startOfDay.setHours(0, 0, 0, 0);
        constraints.push(where('timestamp', '>=', Timestamp.fromDate(startOfDay)));
      }

      if (this.filters.dateTo) {
        const endOfDay = new Date(this.filters.dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        constraints.push(where('timestamp', '<=', Timestamp.fromDate(endOfDay)));
      }

      // EventType filter can be done in Firestore if specified
      if (this.filters.eventType) {
        constraints.push(where('eventType', '==', this.filters.eventType));
      }

      const q = query(eventsRef, ...constraints);
      const snapshot = await getDocs(q);

      let rawEvents: AnalyticsEventRow[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          eventType: data['eventType'] || 'unknown',
          userId: data['userId'] || 'unknown',
          timestamp: data['timestamp']?.toDate ? data['timestamp'].toDate() : new Date(),
          sessionId: data['sessionId'] || 'unknown',
          metadata: data['metadata'] || {},
        };
      });

      // Apply userId filter client-side (Firestore doesn't support partial string matching)
      if (this.filters.userId.trim()) {
        const userIdFilter = this.filters.userId.trim().toLowerCase();
        rawEvents = rawEvents.filter((e) =>
          e.userId.toLowerCase().includes(userIdFilter)
        );
      }

      this.events.set(rawEvents);
      this.totalCount.set(rawEvents.length);
      this.applyPagination();

      console.log(`Loaded ${rawEvents.length} events matching filters`);
    } catch (err) {
      console.error('Failed to load events:', err);
      this.error.set('Failed to load events. Make sure you are logged in as admin.');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Apply pagination to filtered events
   */
  private applyPagination(): void {
    const allEvents = this.events();
    const start = this.pageIndex * this.pageSize;
    const end = start + this.pageSize;
    this.filteredEvents.set(allEvents.slice(start, end));
  }

  /**
   * Handle page change
   */
  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.applyPagination();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    this.filters = {
      dateFrom: thirtyDaysAgo,
      dateTo: now,
      userId: '',
      eventType: '',
    };
  }

  /**
   * Export events to Excel
   */
  exportToExcel(): void {
    const eventsToExport = this.events();

    if (eventsToExport.length === 0) {
      alert('No events to export. Please load events first.');
      return;
    }

    // Prepare data for Excel
    const excelData = eventsToExport.map((event) => ({
      'Event ID': event.id,
      'Event Type': event.eventType,
      'User ID': event.userId,
      'Timestamp': this.formatDateForExcel(event.timestamp),
      'Session ID': event.sessionId,
      'Metadata': JSON.stringify(event.metadata),
    }));

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Analytics Events');

    // Auto-size columns
    const columnWidths = [
      { wch: 25 }, // Event ID
      { wch: 25 }, // Event Type
      { wch: 30 }, // User ID
      { wch: 20 }, // Timestamp
      { wch: 25 }, // Session ID
      { wch: 80 }, // Metadata
    ];
    worksheet['!cols'] = columnWidths;

    // Generate filename with date range
    const dateFrom = this.filters.dateFrom
      ? this.formatDateForFilename(this.filters.dateFrom)
      : 'start';
    const dateTo = this.filters.dateTo
      ? this.formatDateForFilename(this.filters.dateTo)
      : 'end';
    const filename = `analytics-events_${dateFrom}_to_${dateTo}.xlsx`;

    // Download file
    XLSX.writeFile(workbook, filename);

    console.log(`Exported ${eventsToExport.length} events to ${filename}`);
  }

  /**
   * Format date for Excel cell
   */
  formatDateForExcel(date: Date): string {
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }

  /**
   * Format date for filename
   */
  formatDateForFilename(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Format timestamp for display in table
   */
  formatTimestamp(date: Date): string {
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  /**
   * Truncate long strings for display
   */
  truncate(str: string, maxLength: number = 20): string {
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  }

  /**
   * Format metadata for display
   */
  formatMetadata(metadata: Record<string, any>): string {
    if (!metadata || Object.keys(metadata).length === 0) {
      return '-';
    }
    const str = JSON.stringify(metadata);
    return str.length > 50 ? str.substring(0, 50) + '...' : str;
  }

  /**
   * Get full metadata as tooltip
   */
  getMetadataTooltip(metadata: Record<string, any>): string {
    if (!metadata || Object.keys(metadata).length === 0) {
      return 'No metadata';
    }
    return JSON.stringify(metadata, null, 2);
  }

  /**
   * Get active filter count for badge
   */
  getActiveFilterCount(): number {
    let count = 0;
    if (this.filters.userId.trim()) count++;
    if (this.filters.eventType) count++;
    return count;
  }
}
