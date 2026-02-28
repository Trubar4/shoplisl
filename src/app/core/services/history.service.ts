import { Injectable, inject } from '@angular/core';
import { Observable, of, map, catchError, switchMap, forkJoin } from 'rxjs';
import { Store } from '@ngrx/store';
import { CheckEvent, ListItemState, Article, ShoppingList } from '../models';
import { selectListById } from '../../state/lists/lists.selectors';
import { selectArticleById } from '../../state/articles/articles.selectors';
import { AppState } from '../../state/app.state';
import { LoggerService } from './logger.service';

/**
 * HistoryService
 *
 * Manages article check-off history and usage statistics.
 * Phase 6: History Feature
 *
 * Responsibilities:
 * - Record check/uncheck events
 * - Manage history retention (365 days)
 * - Track article usage statistics
 * - Provide history queries
 */
@Injectable({
  providedIn: 'root'
})
export class HistoryService {
  private readonly store = inject(Store<AppState>);
  private readonly logger = inject(LoggerService);

  // Default user ID until Phase 7 (multi-user)
  private readonly DEFAULT_USER_ID = 'shared-shoplisl-user';
  private readonly DEFAULT_USER_NAME = 'Du';

  // History retention period (365 days)
  private readonly HISTORY_RETENTION_DAYS = 365;

  /**
   * Create a new check event
   *
   * @param action - 'checked' or 'unchecked'
   * @param amount - Article amount at time of action
   * @param userId - User ID (optional, defaults to shared user)
   * @param userName - User display name (optional, defaults to 'Du')
   * @returns CheckEvent object
   */
  createCheckEvent(
    action: 'checked' | 'unchecked' | 'added',
    amount?: string,
    userId?: string,
    userName?: string
  ): CheckEvent {
    return {
      timestamp: new Date(),
      userId: userId || this.DEFAULT_USER_ID,
      userName: userName || this.DEFAULT_USER_NAME,
      action,
      amount
    };
  }

  /**
   * Add a check event to the history
   *
   * @param currentHistory - Existing history array
   * @param event - New event to add
   * @returns Updated history array with old events cleaned up
   */
  addEventToHistory(currentHistory: CheckEvent[] | undefined, event: CheckEvent): CheckEvent[] {
    const history = currentHistory || [];

    // Add new event at the beginning (most recent first)
    const updatedHistory = [event, ...history];

    // Cleanup old events
    return this.cleanupOldHistory(updatedHistory);
  }

  /**
   * Remove events older than retention period (365 days)
   *
   * @param history - History array to cleanup
   * @returns Cleaned history array
   */
  cleanupOldHistory(history: CheckEvent[]): CheckEvent[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.HISTORY_RETENTION_DAYS);

    return history.filter(event => {
      const eventDate = event.timestamp instanceof Date
        ? event.timestamp
        : new Date(event.timestamp);
      return eventDate >= cutoffDate;
    });
  }

  /**
   * Get the number of events removed during cleanup
   *
   * @param beforeCount - Count before cleanup
   * @param afterCount - Count after cleanup
   * @returns Number of events removed
   */
  getCleanupCount(beforeCount: number, afterCount: number): number {
    return Math.max(0, beforeCount - afterCount);
  }

  /**
   * Get completed articles (checked) from a list
   *
   * @param list - Shopping list
   * @returns Array of article IDs that are checked
   */
  getCompletedArticleIds(list: ShoppingList): string[] {
    return Object.keys(list.itemStates || {}).filter(
      articleId => list.itemStates[articleId]?.isChecked === true
    );
  }

  /**
   * Get history for a specific article in a list
   *
   * @param list - Shopping list
   * @param articleId - Article ID
   * @returns CheckEvent array (empty if no history)
   */
  getArticleHistory(list: ShoppingList, articleId: string): CheckEvent[] {
    const itemState = list.itemStates[articleId];
    return itemState?.history || [];
  }

  /**
   * Get the most recent check event for an article
   *
   * @param list - Shopping list
   * @param articleId - Article ID
   * @returns Most recent CheckEvent or undefined
   */
  getLastCheckEvent(list: ShoppingList, articleId: string): CheckEvent | undefined {
    const history = this.getArticleHistory(list, articleId);
    return history.length > 0 ? history[0] : undefined;
  }

  /**
   * Count total checks for an article across its history
   *
   * @param history - CheckEvent array
   * @returns Number of 'checked' events
   */
  countChecks(history: CheckEvent[]): number {
    return history.filter(event => event.action === 'checked').length;
  }

  /**
   * Count total unchecks for an article across its history
   *
   * @param history - CheckEvent array
   * @returns Number of 'unchecked' events
   */
  countUnchecks(history: CheckEvent[]): number {
    return history.filter(event => event.action === 'unchecked' || event.action === 'added').length;
  }

  /**
   * Get the date of the most recent check event
   *
   * @param history - CheckEvent array
   * @returns Date of last check or undefined
   */
  getLastCheckDate(history: CheckEvent[]): Date | undefined {
    const checkEvents = history.filter(event => event.action === 'checked');
    if (checkEvents.length === 0) return undefined;

    return checkEvents[0].timestamp instanceof Date
      ? checkEvents[0].timestamp
      : new Date(checkEvents[0].timestamp);
  }

  /**
   * Check if history needs cleanup (has events older than retention period)
   *
   * @param history - CheckEvent array
   * @returns true if cleanup is needed
   */
  needsCleanup(history: CheckEvent[]): boolean {
    if (!history || history.length === 0) return false;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.HISTORY_RETENTION_DAYS);

    return history.some(event => {
      const eventDate = event.timestamp instanceof Date
        ? event.timestamp
        : new Date(event.timestamp);
      return eventDate < cutoffDate;
    });
  }

  /**
   * Create updated ListItemState with new check event
   *
   * @param currentState - Current ListItemState
   * @param articleId - Article ID
   * @param action - 'checked' or 'unchecked'
   * @param amount - Article amount
   * @param userId - User ID (optional)
   * @param userName - User display name (optional)
   * @returns Updated ListItemState
   */
  createUpdatedItemState(
    currentState: ListItemState | undefined,
    articleId: string,
    action: 'checked' | 'unchecked' | 'added',
    amount?: string,
    userId?: string,
    userName?: string,
    articleName?: string
  ): ListItemState {
    const newEvent = this.createCheckEvent(action, amount, userId, userName);
    const updatedHistory = this.addEventToHistory(currentState?.history, newEvent);

    const resolvedArticleName = articleName || currentState?.articleName;

    // Always-on diagnostic: confirms history is being recorded and shows event count
    if (action === 'checked' || action === 'unchecked') {
      const checkedCount = updatedHistory.filter(e => e.action === 'checked').length;
      console.log(
        `[HISTORY] ${action} "${resolvedArticleName || articleId}" ` +
        `(${articleId}) — total check events in history: ${checkedCount}`
      );
    }

    // Log warning when articleName is missing (helps diagnose ghost itemStates)
    if (action === 'added' && !resolvedArticleName) {
      this.logger.warn('data', `[HistoryService] Creating itemState for article ${articleId} WITHOUT articleName!`, {
        action,
        hasCurrentState: !!currentState,
        currentStateArticleName: currentState?.articleName,
        providedArticleName: articleName
      });
    }

    return {
      articleId,
      articleName: resolvedArticleName,  // Preserve or set article name
      isChecked: action === 'checked',
      amount: amount || currentState?.amount || '',
      addedAt: action === 'added' ? new Date() : (currentState?.addedAt || new Date()),
      checkedAt: action === 'checked' ? new Date() : currentState?.checkedAt,
      checkedBy: userId || this.DEFAULT_USER_ID,
      history: updatedHistory
    };
  }

  /**
   * Calculate statistics from history
   *
   * @param history - CheckEvent array
   * @returns Statistics object
   */
  calculateStatistics(history: CheckEvent[]): {
    totalChecks: number;
    totalUnchecks: number;
    lastCheckDate?: Date;
    lastUncheckDate?: Date;
  } {
    const checkEvents = history.filter(e => e.action === 'checked');
    const uncheckEvents = history.filter(e => e.action === 'unchecked' || e.action === 'added');

    return {
      totalChecks: checkEvents.length,
      totalUnchecks: uncheckEvents.length,
      lastCheckDate: checkEvents.length > 0
        ? (checkEvents[0].timestamp instanceof Date ? checkEvents[0].timestamp : new Date(checkEvents[0].timestamp))
        : undefined,
      lastUncheckDate: uncheckEvents.length > 0
        ? (uncheckEvents[0].timestamp instanceof Date ? uncheckEvents[0].timestamp : new Date(uncheckEvents[0].timestamp))
        : undefined
    };
  }

  /**
   * Format date for display (German format: DD.MM.YYYY)
   *
   * @param date - Date to format
   * @returns Formatted string
   */
  formatDate(date: Date | undefined): string {
    if (!date) return '';

    const d = date instanceof Date ? date : new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();

    return `${day}.${month}.${year}`;
  }

  /**
   * Format date with prefix for display
   *
   * @param date - Date to format
   * @param prefix - Prefix character (e.g., '-' for checked, '+' for added)
   * @returns Formatted string with prefix
   */
  formatDateWithPrefix(date: Date | undefined, prefix: string): string {
    if (!date) return '';
    return `${prefix}${this.formatDate(date)}`;
  }
}
