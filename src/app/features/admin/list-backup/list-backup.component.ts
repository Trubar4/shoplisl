import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { firstValueFrom } from 'rxjs';

import { ListBackupService, ImportResult } from '../../../core/services/list-backup.service';
import { DataService } from '../../../core/services/data.service';
import { ShoppingList } from '../../../core/models';

interface ListSummary {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  itemCount: number;
  checkedCount: number;
  historyEvents: number;
  articlesWithHistory: number;
}

/**
 * ListBackupComponent
 *
 * Admin tool for exporting a shopping list to a JSON backup file and
 * re-importing it so that itemStates (including history[] arrays) are
 * fully restored in Firestore.
 *
 * Route: /admin/list-backup
 */
@Component({
  selector: 'app-list-backup',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatChipsModule,
  ],
  templateUrl: './list-backup.component.html',
  styleUrl: './list-backup.component.scss',
})
export class ListBackupComponent implements OnInit {
  private backupService = inject(ListBackupService);
  private dataService = inject(DataService);
  private snackBar = inject(MatSnackBar);

  // ── Shared state ─────────────────────────────────────────────────────────
  lists = signal<ListSummary[]>([]);
  isLoading = signal(false);

  // ── Export state ─────────────────────────────────────────────────────────
  selectedExportListId = signal('');
  isExporting = signal(false);
  exportMessage = signal('');

  // ── Import state ─────────────────────────────────────────────────────────
  selectedImportFile = signal<File | null>(null);
  selectedTargetListId = signal('');
  isImporting = signal(false);
  importResult = signal<ImportResult | null>(null);
  importError = signal('');

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    await this.loadLists();
  }

  private async loadLists(): Promise<void> {
    this.isLoading.set(true);
    try {
      const rawLists = await firstValueFrom(this.dataService.getLists());
      this.lists.set(rawLists.map(l => this.toSummary(l)).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err: any) {
      this.snackBar.open('Failed to load lists: ' + err.message, 'Close', { duration: 5000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  private toSummary(list: ShoppingList): ListSummary {
    const states = Object.values(list.itemStates || {});
    return {
      id: list.id,
      name: list.name,
      icon: list.icon,
      color: list.color,
      itemCount: states.length,
      checkedCount: states.filter(s => s.isChecked).length,
      historyEvents: states.reduce((sum, s) => sum + (s.history?.length ?? 0), 0),
      articlesWithHistory: states.filter(s => (s.history?.length ?? 0) > 0).length,
    };
  }

  // ── Export ────────────────────────────────────────────────────────────────

  get selectedExportList(): ListSummary | undefined {
    return this.lists().find(l => l.id === this.selectedExportListId());
  }

  async exportList(): Promise<void> {
    const listId = this.selectedExportListId();
    if (!listId) return;

    this.isExporting.set(true);
    this.exportMessage.set('');

    try {
      const result = await this.backupService.exportList(listId);
      this.exportMessage.set(
        `Exported "${result.listName}" — ` +
        `${result.itemCount} items, ${result.historyEvents} history events.`
      );
      this.snackBar.open('Export successful', 'Close', { duration: 3000 });
    } catch (err: any) {
      this.exportMessage.set('Export failed: ' + err.message);
      this.snackBar.open('Export failed: ' + err.message, 'Close', { duration: 5000 });
    } finally {
      this.isExporting.set(false);
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedImportFile.set(file);
    this.importResult.set(null);
    this.importError.set('');
    // Reset the target list selection so user consciously picks one
    this.selectedTargetListId.set('');
  }

  get canImport(): boolean {
    return !!this.selectedImportFile() && !!this.selectedTargetListId();
  }

  async importList(): Promise<void> {
    const file = this.selectedImportFile();
    const targetListId = this.selectedTargetListId() || undefined;
    if (!file) return;

    this.isImporting.set(true);
    this.importResult.set(null);
    this.importError.set('');

    try {
      const result = await this.backupService.importList(file, targetListId);
      this.importResult.set(result);
      this.snackBar.open(
        `Restored "${result.listName}": ${result.restoredItemCount} items, ${result.totalHistoryEvents} history events.`,
        'Close',
        { duration: 6000 }
      );
      // Refresh summaries to reflect the new state
      await this.loadLists();
    } catch (err: any) {
      this.importError.set(err.message ?? 'Unknown error');
      this.snackBar.open('Import failed: ' + err.message, 'Close', { duration: 7000 });
    } finally {
      this.isImporting.set(false);
    }
  }

  clearImport(): void {
    this.selectedImportFile.set(null);
    this.selectedTargetListId.set('');
    this.importResult.set(null);
    this.importError.set('');
  }

  // ── Formatting ────────────────────────────────────────────────────────────

  historyHealthLabel(summary: ListSummary): string {
    if (summary.itemCount === 0) return '';
    const pct = Math.round((summary.articlesWithHistory / summary.itemCount) * 100);
    return `${summary.articlesWithHistory}/${summary.itemCount} items have history (${pct}%)`;
  }

  historyHealthColor(summary: ListSummary): string {
    if (summary.itemCount === 0) return 'default';
    const pct = summary.articlesWithHistory / summary.itemCount;
    if (pct >= 0.5) return 'primary';
    if (pct > 0) return 'accent';
    return 'warn';
  }
}
