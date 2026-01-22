import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { FormsModule } from '@angular/forms';
import {
  Firestore,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from '@angular/fire/firestore';
import { inject } from '@angular/core';

interface RawEvent {
  id: string;
  eventType: string;
  userId: string;
  timestamp: Date;
  sessionId: string;
  metadata: any;
}

/**
 * Raw Events Viewer Component
 *
 * Allows admin to view raw analytics events from Firestore
 * with configurable limit and sorted by timestamp (newest first)
 */
@Component({
  selector: 'app-raw-events-viewer',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTableModule,
    FormsModule,
  ],
  template: `
    <mat-card class="raw-events-card">
      <mat-card-header>
        <mat-card-title>📋 Raw Analytics Events</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <!-- Controls -->
        <div class="controls">
          <mat-form-field appearance="outline" class="limit-input">
            <mat-label>Number of Events</mat-label>
            <input
              matInput
              type="number"
              [(ngModel)]="limitCount"
              min="1"
              max="500"
              placeholder="e.g., 20"
            />
          </mat-form-field>
          <button
            mat-raised-button
            color="primary"
            (click)="loadEvents()"
            [disabled]="loading()"
          >
            <mat-icon>refresh</mat-icon>
            Load Events
          </button>
        </div>

        <!-- Loading State -->
        <div *ngIf="loading()" class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Loading events...</p>
        </div>

        <!-- Error State -->
        <div *ngIf="error()" class="error-container">
          <mat-icon color="warn">error</mat-icon>
          <p>{{ error() }}</p>
        </div>

        <!-- Events Table -->
        <div *ngIf="!loading() && !error() && events().length > 0" class="table-container">
          <p class="event-count">Showing {{ events().length }} most recent events</p>
          <table mat-table [dataSource]="events()" class="events-table">
            <!-- Timestamp Column -->
            <ng-container matColumnDef="timestamp">
              <th mat-header-cell *matHeaderCellDef>Timestamp</th>
              <td mat-cell *matCellDef="let event">
                {{ formatTimestamp(event.timestamp) }}
              </td>
            </ng-container>

            <!-- Event Type Column -->
            <ng-container matColumnDef="eventType">
              <th mat-header-cell *matHeaderCellDef>Event Type</th>
              <td mat-cell *matCellDef="let event">
                <code>{{ event.eventType }}</code>
              </td>
            </ng-container>

            <!-- User ID Column -->
            <ng-container matColumnDef="userId">
              <th mat-header-cell *matHeaderCellDef>User ID</th>
              <td mat-cell *matCellDef="let event" class="user-id">
                {{ truncateId(event.userId) }}
              </td>
            </ng-container>

            <!-- Metadata Column -->
            <ng-container matColumnDef="metadata">
              <th mat-header-cell *matHeaderCellDef>Metadata</th>
              <td mat-cell *matCellDef="let event" class="metadata">
                <pre>{{ formatMetadata(event.metadata) }}</pre>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
          </table>
        </div>

        <!-- No Events -->
        <div
          *ngIf="!loading() && !error() && events().length === 0"
          class="no-events"
        >
          <mat-icon>inbox</mat-icon>
          <p>No events found. Click "Load Events" to fetch data.</p>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .raw-events-card {
      margin: 24px 0;
    }

    .controls {
      display: flex;
      gap: 16px;
      align-items: center;
      margin-bottom: 24px;
    }

    .limit-input {
      width: 200px;
    }

    .loading-container,
    .error-container,
    .no-events {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      text-align: center;

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        margin-bottom: 16px;
      }

      p {
        margin: 8px 0;
        color: rgba(0, 0, 0, 0.6);
      }
    }

    .event-count {
      margin-bottom: 16px;
      font-size: 14px;
      color: rgba(0, 0, 0, 0.6);
    }

    .table-container {
      overflow-x: auto;
    }

    .events-table {
      width: 100%;

      th {
        font-weight: 600;
        background-color: #f5f5f5;
      }

      td {
        padding: 12px 16px;
        vertical-align: top;

        &.user-id {
          font-family: monospace;
          font-size: 12px;
          color: rgba(0, 0, 0, 0.6);
        }

        &.metadata {
          max-width: 400px;

          pre {
            margin: 0;
            font-family: monospace;
            font-size: 12px;
            white-space: pre-wrap;
            word-break: break-all;
            background-color: #f5f5f5;
            padding: 8px;
            border-radius: 4px;
          }
        }

        code {
          background-color: #e3f2fd;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 12px;
          color: #1976d2;
        }
      }
    }
  `],
})
export class RawEventsViewerComponent {
  private firestore = inject(Firestore);

  limitCount = 20;
  events = signal<RawEvent[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  displayedColumns = ['timestamp', 'eventType', 'userId', 'metadata'];

  async loadEvents(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const eventsRef = collection(this.firestore, 'analytics/events/items');
      const q = query(
        eventsRef,
        orderBy('timestamp', 'desc'),
        limit(this.limitCount)
      );

      const snapshot = await getDocs(q);
      const rawEvents = snapshot.docs.map((doc) => {
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

      this.events.set(rawEvents);
      console.log(`📋 Loaded ${rawEvents.length} raw events`);
    } catch (err) {
      console.error('Failed to load raw events:', err);
      this.error.set('Failed to load events. Check console for details.');
    } finally {
      this.loading.set(false);
    }
  }

  formatTimestamp(date: Date): string {
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }

  truncateId(id: string): string {
    return id.length > 12 ? `${id.substring(0, 12)}...` : id;
  }

  formatMetadata(metadata: any): string {
    if (!metadata || Object.keys(metadata).length === 0) {
      return '{}';
    }
    return JSON.stringify(metadata, null, 2);
  }
}
