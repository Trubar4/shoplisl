/**
 * Admin Component to Run Orphaned Article ID Cleanup
 *
 * This component provides a UI to run the orphaned article ID cleanup script.
 * Add this component to your app (e.g., in the settings or admin section).
 *
 * Usage:
 * 1. Navigate to this component
 * 2. Click "Preview Cleanup (Dry Run)" to see what will be removed
 * 3. Review the console output carefully
 * 4. Click "Execute Cleanup" to apply changes
 */

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { OrphanedArticleIdCleanupService, CleanupResult } from '../../../../cleanup-orphaned-article-ids';

@Component({
  selector: 'app-cleanup-orphaned-ids',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  template: `
    <mat-card class="cleanup-card">
      <mat-card-header>
        <mat-card-title>🧹 Orphaned Article ID Cleanup</mat-card-title>
        <mat-card-subtitle>Remove ghost article IDs from lists</mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
        <div class="description">
          <p><strong>What this does:</strong></p>
          <ul>
            <li>Scans all lists for article IDs that point to deleted articles</li>
            <li>Checks articles across all collaborators (owner + shared users)</li>
            <li>Removes IDs for articles that don't exist anywhere</li>
          </ul>

          <p><strong>Why it's needed:</strong></p>
          <p>When articles are deleted, their IDs can remain in shared lists due to permission issues or race conditions. This causes inflated article counts (e.g., showing "10/38" when only 26 articles exist).</p>

          <div class="warning" *ngIf="!lastResult">
            <p>⚠️ <strong>Always run "Preview" first!</strong></p>
          </div>
        </div>

        <div class="results" *ngIf="lastResult">
          <h3>{{ lastResult.wasLiveRun ? '✅ Cleanup Complete' : '🔍 Preview Results' }}</h3>

          <div class="stats">
            <div class="stat-item">
              <span class="label">Lists Analyzed:</span>
              <span class="value">{{ lastResult.totalLists }}</span>
            </div>
            <div class="stat-item">
              <span class="label">Lists with Orphans:</span>
              <span class="value">{{ lastResult.listsWithOrphans }}</span>
            </div>
            <div class="stat-item">
              <span class="label">Orphaned IDs Found:</span>
              <span class="value">{{ lastResult.orphanedIdsRemoved }}</span>
            </div>
            <div class="stat-item" *ngIf="lastResult.wasLiveRun">
              <span class="label">Lists Updated:</span>
              <span class="value success">{{ lastResult.listsUpdated }}</span>
            </div>
          </div>

          <div class="affected-lists" *ngIf="lastResult.details.length > 0">
            <h4>Affected Lists:</h4>
            <ul>
              <li *ngFor="let detail of lastResult.details">
                <strong>{{ detail.listName }}</strong>
                <span class="list-type">{{ detail.isShared ? '(shared)' : '(owned)' }}</span>
                <br>
                <span class="count-change">
                  {{ detail.articleIdsBefore }} → {{ detail.articleIdsAfter }} articles
                </span>
                <br>
                <span class="orphaned-ids">Orphaned IDs: {{ detail.orphanedIds.join(', ') }}</span>
              </li>
            </ul>
          </div>

          <div class="next-steps" *ngIf="!lastResult.wasLiveRun && lastResult.listsWithOrphans > 0">
            <p><strong>Next Step:</strong> Review the console output, then click "Execute Cleanup" to apply changes.</p>
          </div>

          <div class="errors" *ngIf="lastResult.errors.length > 0">
            <h4>⚠️ Errors:</h4>
            <ul>
              <li *ngFor="let error of lastResult.errors" class="error-item">{{ error }}</li>
            </ul>
          </div>
        </div>

        <div class="console-note">
          <p>💡 <strong>Tip:</strong> Open browser console (F12) to see detailed logs</p>
        </div>
      </mat-card-content>

      <mat-card-actions>
        <button
          mat-raised-button
          color="primary"
          (click)="runPreview()"
          [disabled]="isRunning">
          <mat-spinner *ngIf="isRunning && !isLiveRun" diameter="20"></mat-spinner>
          {{ isRunning && !isLiveRun ? 'Running Preview...' : '🔍 Preview Cleanup (Dry Run)' }}
        </button>

        <button
          mat-raised-button
          color="warn"
          (click)="runCleanup()"
          [disabled]="isRunning || !lastResult || lastResult.listsWithOrphans === 0">
          <mat-spinner *ngIf="isRunning && isLiveRun" diameter="20"></mat-spinner>
          {{ isRunning && isLiveRun ? 'Executing...' : '⚠️ Execute Cleanup' }}
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .cleanup-card {
      max-width: 800px;
      margin: 20px auto;
    }

    .description {
      margin-bottom: 20px;
    }

    .description ul {
      padding-left: 20px;
    }

    .warning {
      background: #fff3cd;
      border: 1px solid #ffc107;
      padding: 10px;
      border-radius: 4px;
      margin: 15px 0;
    }

    .results {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 4px;
      margin: 20px 0;
    }

    .results h3 {
      margin-top: 0;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
      margin: 15px 0;
    }

    .stat-item {
      display: flex;
      justify-content: space-between;
      padding: 10px;
      background: white;
      border-radius: 4px;
    }

    .stat-item .label {
      font-weight: 500;
    }

    .stat-item .value {
      font-weight: bold;
      color: #f44336;
    }

    .stat-item .value.success {
      color: #4caf50;
    }

    .affected-lists {
      margin: 20px 0;
    }

    .affected-lists ul {
      list-style: none;
      padding: 0;
    }

    .affected-lists li {
      background: white;
      padding: 10px;
      margin: 10px 0;
      border-radius: 4px;
      border-left: 4px solid #ff9800;
    }

    .list-type {
      color: #666;
      font-size: 0.9em;
      font-style: italic;
    }

    .count-change {
      color: #2196f3;
      font-weight: 500;
    }

    .orphaned-ids {
      color: #666;
      font-size: 0.85em;
      font-family: monospace;
    }

    .next-steps {
      background: #e3f2fd;
      border: 1px solid #2196f3;
      padding: 10px;
      border-radius: 4px;
      margin: 15px 0;
    }

    .errors {
      background: #ffebee;
      border: 1px solid #f44336;
      padding: 10px;
      border-radius: 4px;
      margin: 15px 0;
    }

    .error-item {
      color: #d32f2f;
    }

    .console-note {
      background: #e8f5e9;
      border: 1px solid #4caf50;
      padding: 10px;
      border-radius: 4px;
      margin: 15px 0;
    }

    mat-card-actions {
      display: flex;
      gap: 10px;
      padding: 16px;
    }

    mat-card-actions button {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
  `]
})
export class CleanupOrphanedIdsComponent {
  isRunning = false;
  isLiveRun = false;
  lastResult: (CleanupResult & { wasLiveRun: boolean }) | null = null;

  constructor(
    private cleanupService: OrphanedArticleIdCleanupService,
    private snackBar: MatSnackBar
  ) {}

  async runPreview() {
    this.isRunning = true;
    this.isLiveRun = false;

    try {
      console.log('🔍 Starting cleanup preview...');
      const result = await this.cleanupService.runOrphanedArticleIdCleanup(true);

      this.lastResult = { ...result, wasLiveRun: false };

      if (result.listsWithOrphans === 0) {
        this.snackBar.open('✅ No orphaned article IDs found!', 'Close', { duration: 5000 });
      } else {
        this.snackBar.open(
          `Found ${result.orphanedIdsRemoved} orphaned IDs in ${result.listsWithOrphans} lists. Check console for details.`,
          'Close',
          { duration: 10000 }
        );
      }
    } catch (error: any) {
      console.error('Preview failed:', error);
      this.snackBar.open(`❌ Preview failed: ${error.message}`, 'Close', { duration: 5000 });
    } finally {
      this.isRunning = false;
    }
  }

  async runCleanup() {
    if (!confirm('⚠️ This will permanently remove orphaned article IDs from Firebase. Continue?')) {
      return;
    }

    this.isRunning = true;
    this.isLiveRun = true;

    try {
      console.log('⚠️ Starting LIVE cleanup...');
      const result = await this.cleanupService.runOrphanedArticleIdCleanup(false, true);

      this.lastResult = { ...result, wasLiveRun: true };

      this.snackBar.open(
        `✅ Cleanup complete! Updated ${result.listsUpdated} lists, removed ${result.orphanedIdsRemoved} orphaned IDs.`,
        'Close',
        { duration: 10000 }
      );
    } catch (error: any) {
      console.error('Cleanup failed:', error);
      this.snackBar.open(`❌ Cleanup failed: ${error.message}`, 'Close', { duration: 5000 });
    } finally {
      this.isRunning = false;
      this.isLiveRun = false;
    }
  }
}
