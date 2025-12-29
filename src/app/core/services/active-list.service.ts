import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { LoggerService } from './logger.service';

/**
 * LAZY LISTENERS: Track which list is currently active/open
 *
 * This service enables massive quota reduction by only setting up
 * real-time listeners for the list that's currently being viewed.
 *
 * Benefits:
 * - 98% quota reduction (26 reads vs 2,393 reads per session)
 * - Faster page load (fewer listeners to set up)
 * - Still real-time for the list you're actually using!
 *
 * Usage:
 * - List detail component calls setActiveList() on open
 * - Firebase data service subscribes to activeListId$
 * - Only sets up listener for the active list
 */
@Injectable({
  providedIn: 'root'
})
export class ActiveListService {
  private activeListId$ = new BehaviorSubject<string | null>(null);

  constructor(private logger: LoggerService) {}

  /**
   * Set the currently active/open list
   * This triggers the firebase-data service to set up a listener for this list
   */
  setActiveList(listId: string): void {
    if (this.activeListId$.value !== listId) {
      this.logger.info('data', `📍 Active list changed: ${this.activeListId$.value} → ${listId}`);
      this.activeListId$.next(listId);
    }
  }

  /**
   * Clear the active list (when navigating away from list detail)
   * This triggers cleanup of the listener
   */
  clearActiveList(): void {
    if (this.activeListId$.value !== null) {
      this.logger.info('data', `📍 Active list cleared: ${this.activeListId$.value} → null`);
      this.activeListId$.next(null);
    }
  }

  /**
   * Get observable of active list ID changes
   * Firebase data service subscribes to this
   */
  getActiveListId$(): Observable<string | null> {
    return this.activeListId$.asObservable();
  }

  /**
   * Get current active list ID (snapshot)
   */
  getCurrentActiveListId(): string | null {
    return this.activeListId$.value;
  }
}
