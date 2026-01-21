import { Injectable } from '@angular/core';
import { LoggerService } from './logger.service';
import { ShoppingList } from '../models/shopping-list.model';

export interface DataLossEvent {
  timestamp: Date;
  listId: string;
  listName: string;
  ownerId: string;
  isShared: boolean;
  before: {
    articleIdsCount: number;
    itemStatesCount: number;
  };
  after: {
    articleIdsCount: number;
    itemStatesCount: number;
  };
  lostArticleIds: string[];
  lostItemStateIds: string[];
  stackTrace?: string;
}

/**
 * DATA LOSS DETECTOR SERVICE
 *
 * Monitors list updates and detects when articleIds or itemStates are unexpectedly emptied.
 * Logs all detected data loss events for investigation.
 *
 * This service helps identify the root cause of data loss issues by:
 * 1. Tracking before/after state of list updates
 * 2. Detecting unexpected emptying of articleIds or itemStates
 * 3. Logging stack traces to identify which code is causing the loss
 * 4. Providing statistics on data loss patterns
 */
@Injectable({
  providedIn: 'root'
})
export class DataLossDetectorService {
  private dataLossEvents: DataLossEvent[] = [];
  private listSnapshots = new Map<string, { articleIds: string[]; itemStates: string[] }>();
  private readonly MAX_EVENTS_STORED = 100;

  constructor(private logger: LoggerService) {
    this.logger.info('data-loss-detector', '🛡️ Data Loss Detector initialized');
  }

  /**
   * Take a snapshot of a list's current state
   * Call this BEFORE updating a list in Firebase
   */
  snapshotList(list: ShoppingList): void {
    if (!list || !list.id) return;

    this.listSnapshots.set(list.id, {
      articleIds: [...(list.articleIds || [])],
      itemStates: Object.keys(list.itemStates || {})
    });
  }

  /**
   * Check if data loss occurred during an update
   * Call this AFTER updating a list in Firebase
   */
  checkForDataLoss(listBefore: ShoppingList, listAfter: ShoppingList, operation: string): void {
    if (!listBefore || !listAfter || listBefore.id !== listAfter.id) return;

    const beforeArticleIds = listBefore.articleIds || [];
    const beforeItemStateIds = Object.keys(listBefore.itemStates || {});
    const afterArticleIds = listAfter.articleIds || [];
    const afterItemStateIds = Object.keys(listAfter.itemStates || {});

    // Detect significant data loss (>90% of data lost)
    const articleLossPercent = beforeArticleIds.length > 0
      ? (beforeArticleIds.length - afterArticleIds.length) / beforeArticleIds.length
      : 0;
    const itemStateLossPercent = beforeItemStateIds.length > 0
      ? (beforeItemStateIds.length - afterItemStateIds.length) / beforeItemStateIds.length
      : 0;

    const significantLoss = articleLossPercent > 0.9 || itemStateLossPercent > 0.9;
    const totalLoss = (afterArticleIds.length === 0 && beforeArticleIds.length > 0) ||
                     (afterItemStateIds.length === 0 && beforeItemStateIds.length > 0);

    if (significantLoss || totalLoss) {
      const lostArticleIds = beforeArticleIds.filter(id => !afterArticleIds.includes(id));
      const lostItemStateIds = beforeItemStateIds.filter(id => !afterItemStateIds.includes(id));

      const event: DataLossEvent = {
        timestamp: new Date(),
        listId: listBefore.id,
        listName: listBefore.name,
        ownerId: listBefore.ownerId || 'unknown',
        isShared: (listBefore.sharedWith && listBefore.sharedWith.length > 0) || false,
        before: {
          articleIdsCount: beforeArticleIds.length,
          itemStatesCount: beforeItemStateIds.length
        },
        after: {
          articleIdsCount: afterArticleIds.length,
          itemStatesCount: afterItemStateIds.length
        },
        lostArticleIds,
        lostItemStateIds,
        stackTrace: new Error().stack
      };

      this.recordDataLoss(event, operation);
    }
  }

  /**
   * Manually record a data loss event
   */
  recordDataLoss(event: DataLossEvent, operation: string): void {
    // Store event (limit to MAX_EVENTS_STORED)
    this.dataLossEvents.unshift(event);
    if (this.dataLossEvents.length > this.MAX_EVENTS_STORED) {
      this.dataLossEvents = this.dataLossEvents.slice(0, this.MAX_EVENTS_STORED);
    }

    // Log the event
    this.logger.error('data-loss-detector', `🚨 DATA LOSS DETECTED in ${operation}:`, {
      list: `${event.listName} (${event.listId})`,
      owner: event.ownerId,
      shared: event.isShared,
      articleIds: `${event.before.articleIdsCount} → ${event.after.articleIdsCount} (lost ${event.lostArticleIds.length})`,
      itemStates: `${event.before.itemStatesCount} → ${event.after.itemStatesCount} (lost ${event.lostItemStateIds.length})`,
      timestamp: event.timestamp.toISOString()
    });

    // Log stack trace for debugging
    if (event.stackTrace) {
      this.logger.error('data-loss-detector', 'Stack trace:', event.stackTrace);
    }

    // Store in localStorage for persistence across sessions
    this.persistEvents();
  }

  /**
   * Get all recorded data loss events
   */
  getDataLossEvents(): DataLossEvent[] {
    return [...this.dataLossEvents];
  }

  /**
   * Get data loss events for a specific list
   */
  getEventsByList(listId: string): DataLossEvent[] {
    return this.dataLossEvents.filter(e => e.listId === listId);
  }

  /**
   * Get statistics on data loss patterns
   */
  getStatistics(): {
    totalEvents: number;
    affectedLists: number;
    sharedListsAffected: number;
    ownedListsAffected: number;
    totalArticlesLost: number;
    mostRecentEvent?: Date;
  } {
    const uniqueLists = new Set(this.dataLossEvents.map(e => e.listId));
    const sharedLists = new Set(this.dataLossEvents.filter(e => e.isShared).map(e => e.listId));
    const ownedLists = new Set(this.dataLossEvents.filter(e => !e.isShared).map(e => e.listId));
    const totalArticlesLost = this.dataLossEvents.reduce((sum, e) => sum + e.lostArticleIds.length, 0);
    const mostRecent = this.dataLossEvents.length > 0 ? this.dataLossEvents[0].timestamp : undefined;

    return {
      totalEvents: this.dataLossEvents.length,
      affectedLists: uniqueLists.size,
      sharedListsAffected: sharedLists.size,
      ownedListsAffected: ownedLists.size,
      totalArticlesLost,
      mostRecentEvent: mostRecent
    };
  }

  /**
   * Clear all recorded events
   */
  clearEvents(): void {
    this.dataLossEvents = [];
    this.persistEvents();
    this.logger.info('data-loss-detector', 'Cleared all data loss events');
  }

  /**
   * Persist events to localStorage
   */
  private persistEvents(): void {
    try {
      const serialized = JSON.stringify(this.dataLossEvents.slice(0, 20)); // Store last 20 events
      localStorage.setItem('data-loss-events', serialized);
    } catch (error) {
      this.logger.warn('data-loss-detector', 'Failed to persist events to localStorage', error);
    }
  }

  /**
   * Load events from localStorage
   */
  loadPersistedEvents(): void {
    try {
      const serialized = localStorage.getItem('data-loss-events');
      if (serialized) {
        const events = JSON.parse(serialized);
        // Convert timestamp strings back to Dates
        this.dataLossEvents = events.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp)
        }));
        this.logger.info('data-loss-detector', `Loaded ${this.dataLossEvents.length} persisted data loss events`);
      }
    } catch (error) {
      this.logger.warn('data-loss-detector', 'Failed to load persisted events', error);
    }
  }

  /**
   * Export events as JSON for analysis
   */
  exportEvents(): string {
    return JSON.stringify(this.dataLossEvents, null, 2);
  }
}
