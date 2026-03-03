import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ShoppingList, ListItemState, CheckEvent } from '../models';
import { DataService } from './data.service';
import { LoggerService } from './logger.service';

/**
 * Serialized form of a list used in the backup JSON file.
 * All Date/Timestamp fields are stored as ISO-8601 strings.
 */
export interface ListBackupFile {
  exportVersion: 1;
  exportedAt: string;   // ISO-8601
  list: {
    id: string;
    name: string;
    color?: string;
    icon?: string;
    shopId?: string;
    articleIds: string[];
    itemStates: {
      [articleId: string]: {
        articleId: string;
        articleName?: string;
        isChecked: boolean;
        amount?: string;
        addedAt?: string;    // ISO-8601
        checkedAt?: string;  // ISO-8601
        checkedBy?: string;
        history?: Array<{
          timestamp: string; // ISO-8601
          userId: string;
          userName: string;
          action: 'checked' | 'unchecked' | 'added';
          amount?: string;
        }>;
      };
    };
    departmentOrder?: string[];
    createdAt: string;  // ISO-8601
    updatedAt: string;  // ISO-8601
    ownerId: string;
  };
}

export interface ImportResult {
  listId: string;
  listName: string;
  restoredItemCount: number;
  totalHistoryEvents: number;
}

/**
 * ListBackupService
 *
 * Provides JSON export and import of full list state, including
 * itemStates with history[] arrays, so that the recommendations
 * engine can work correctly after a restore.
 *
 * Export serialises all Timestamps to ISO-8601 strings.
 * Import accepts ISO-8601 strings as well as Firestore Timestamp
 * serialised forms ({ _seconds, _nanoseconds } or { seconds, nanoseconds }).
 */
@Injectable({ providedIn: 'root' })
export class ListBackupService {
  private dataService = inject(DataService);
  private logger = inject(LoggerService);

  // ── Export ────────────────────────────────────────────────────────────────

  /**
   * Serialise the list to a JSON file and trigger a browser download.
   */
  async exportList(listId: string): Promise<{ listName: string; itemCount: number; historyEvents: number }> {
    const lists = await firstValueFrom(this.dataService.getLists());
    const list = lists.find(l => l.id === listId);
    if (!list) throw new Error(`List "${listId}" not found in current state.`);

    const serialised = this.serializeList(list);
    const backup: ListBackupFile = {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      list: serialised as ListBackupFile['list']
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const safeName = list.name.replace(/[^a-z0-9äöüÄÖÜ]/gi, '-').toLowerCase();
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `shoplisl-backup-${safeName}-${dateStr}.json`;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);

    const historyEvents = Object.values(list.itemStates || {})
      .reduce((sum, s) => sum + (s.history?.length ?? 0), 0);

    this.logger.info('data', `📦 Exported list "${list.name}": ${Object.keys(list.itemStates).length} items, ${historyEvents} history events`);

    return {
      listName: list.name,
      itemCount: Object.keys(list.itemStates).length,
      historyEvents
    };
  }

  // ── Import ────────────────────────────────────────────────────────────────

  /**
   * Parse a backup JSON file and restore itemStates (including history[])
   * into the target list in Firestore.
   *
   * @param file       The .json file chosen by the user.
   * @param targetListId  Override which list to restore into.
   *                      If omitted, uses the list ID embedded in the backup.
   */
  async importList(file: File, targetListId?: string): Promise<ImportResult> {
    const text = await file.text();

    let backup: ListBackupFile;
    try {
      backup = JSON.parse(text);
    } catch {
      throw new Error('Cannot parse file: not valid JSON.');
    }

    this.validateBackup(backup);

    const listId = targetListId || backup.list.id;

    // Verify the target list exists in the current state (needed to know the owner path)
    const lists = await firstValueFrom(this.dataService.getLists());
    const targetList = lists.find(l => l.id === listId);
    if (!targetList) {
      throw new Error(
        `Target list "${listId}" was not found. ` +
        `Create the list first, or select an existing list as the restore target.`
      );
    }

    // Deserialise: convert all date strings / serialised Timestamps to proper Date objects
    const restoredItemStates = this.deserialiseItemStates(backup.list.itemStates);

    const totalHistoryEvents = Object.values(restoredItemStates)
      .reduce((sum, s) => sum + (s.history?.length ?? 0), 0);

    // Write back via DataService so the full conversion + optimistic update pipeline runs
    await firstValueFrom(
      this.dataService.updateList(listId, {
        articleIds: backup.list.articleIds,
        itemStates: restoredItemStates
      })
    );

    this.logger.info(
      'data',
      `✅ Imported backup into list "${targetList.name}": ` +
      `${Object.keys(restoredItemStates).length} items, ${totalHistoryEvents} history events`
    );

    return {
      listId,
      listName: targetList.name,
      restoredItemCount: Object.keys(restoredItemStates).length,
      totalHistoryEvents
    };
  }

  // ── Serialisation helpers ─────────────────────────────────────────────────

  private serializeList(list: ShoppingList): object {
    const itemStates: any = {};
    for (const [articleId, state] of Object.entries(list.itemStates || {})) {
      itemStates[articleId] = {
        ...state,
        addedAt: this.toIso(state.addedAt),
        checkedAt: this.toIso(state.checkedAt),
        history: (state.history || []).map(ev => ({
          ...ev,
          timestamp: this.toIso(ev.timestamp)
        }))
      };
    }

    return {
      ...list,
      createdAt: this.toIso(list.createdAt),
      updatedAt: this.toIso(list.updatedAt),
      itemStates
    };
  }

  /** Convert any date-like value to an ISO-8601 string for the JSON file. */
  private toIso(val: any): string | undefined {
    if (!val) return undefined;
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string') return val;
    // Firestore Timestamp serialised by NgRx as { _seconds, _nanoseconds }
    if (typeof val === 'object' && val._seconds !== undefined) {
      return new Date(val._seconds * 1000 + (val._nanoseconds ?? 0) / 1e6).toISOString();
    }
    // Firestore Timestamp serialised as { seconds, nanoseconds }
    if (typeof val === 'object' && val.seconds !== undefined) {
      return new Date(val.seconds * 1000 + (val.nanoseconds ?? 0) / 1e6).toISOString();
    }
    // Live Firestore Timestamp object
    if (typeof val.toDate === 'function') return val.toDate().toISOString();
    return undefined;
  }

  // ── Deserialisation helpers ───────────────────────────────────────────────

  private deserialiseItemStates(
    raw: ListBackupFile['list']['itemStates']
  ): { [articleId: string]: ListItemState } {
    const out: { [articleId: string]: ListItemState } = {};

    for (const [articleId, state] of Object.entries(raw)) {
      out[articleId] = {
        articleId: state.articleId,
        articleName: state.articleName,
        isChecked: state.isChecked,
        amount: state.amount,
        checkedBy: state.checkedBy,
        addedAt: this.parseTimestamp(state.addedAt) ?? undefined,
        checkedAt: this.parseTimestamp(state.checkedAt) ?? undefined,
        history: (state.history || []).map(ev => ({
          ...ev,
          timestamp: this.parseTimestamp(ev.timestamp) ?? new Date()
        }))
      };
    }

    return out;
  }

  /** Parse any timestamp representation back to a Date object. */
  private parseTimestamp(val: any): Date | null {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'string') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof val === 'object') {
      // { _seconds, _nanoseconds } from NgRx serialisation of Firestore Timestamp
      if (val._seconds !== undefined) {
        return new Date(val._seconds * 1000 + (val._nanoseconds ?? 0) / 1e6);
      }
      // { seconds, nanoseconds } from plain Firestore Timestamp serialisation
      if (val.seconds !== undefined) {
        return new Date(val.seconds * 1000 + (val.nanoseconds ?? 0) / 1e6);
      }
      // Live Firestore Timestamp object that somehow ended up in the file
      if (typeof val.toDate === 'function') return val.toDate();
    }
    return null;
  }

  // ── Validation ────────────────────────────────────────────────────────────

  private validateBackup(backup: any): asserts backup is ListBackupFile {
    if (!backup || typeof backup !== 'object') {
      throw new Error('Backup file is not a valid object.');
    }
    if (backup.exportVersion !== 1) {
      throw new Error(`Unsupported backup version: ${backup.exportVersion}`);
    }
    if (!backup.list || typeof backup.list !== 'object') {
      throw new Error('Backup file is missing the "list" field.');
    }
    if (!backup.list.id || typeof backup.list.id !== 'string') {
      throw new Error('Backup "list.id" is missing or not a string.');
    }
    if (!Array.isArray(backup.list.articleIds)) {
      throw new Error('Backup "list.articleIds" must be an array.');
    }
    if (!backup.list.itemStates || typeof backup.list.itemStates !== 'object') {
      throw new Error('Backup "list.itemStates" is missing or not an object.');
    }
  }
}
