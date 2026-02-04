// src/app/core/services/firebase-listener-state.service.ts
import { Injectable } from '@angular/core';
import { LoggerService } from './logger.service';

/**
 * FirebaseListenerStateService - Manages Firestore listener lifecycle and state
 *
 * Extracted from FirebaseDataService (Phase 1 refactoring) to:
 * - Reduce firebase-data.service.ts complexity
 * - Centralize listener state management
 * - Provide clean listener cleanup utilities
 *
 * Key responsibilities:
 * - Track active listeners (owned lists, shared lists, collections)
 * - Manage listener state flags (isSettingUpListeners, collectionListenersActive)
 * - Provide centralized cleanup utilities
 * - Track cooldowns and throttling for listeners
 */
@Injectable({
  providedIn: 'root'
})
export class FirebaseListenerStateService {

  // Collection listener unsubscribe functions
  private articlesUnsubscribe?: () => void;
  private listsUnsubscribe?: () => void;
  private sharedListsUnsubscribe?: () => void;

  // Individual document listeners
  private ownedListListeners = new Map<string, () => void>();
  private sharedListListeners = new Map<string, () => void>();

  // State flags
  private _ownedListListenersActive = false;
  private _collectionListenersCleanedUp = false;
  private _collectionListenersActive = false;
  private _isSettingUpListeners = false;
  private _initialDataLoadDone = false;

  // Cooldowns and throttling
  private lastSharedListUpdate = new Map<string, number>(); // listId -> timestamp
  private lastMergeWrite = new Map<string, number>(); // listId -> timestamp
  private _lastShareInvitesReload = 0;

  // Active list subscription
  private activeListSubscription?: any;

  // Constants
  readonly MERGE_WRITE_COOLDOWN = 2000; // 2 seconds
  readonly SHARE_INVITES_RELOAD_THROTTLE = 5000; // 5 seconds

  constructor(private logger: LoggerService) {}

  // === Collection Listener Management ===

  setArticlesUnsubscribe(unsub: (() => void) | undefined): void {
    this.articlesUnsubscribe = unsub;
  }

  setListsUnsubscribe(unsub: (() => void) | undefined): void {
    this.listsUnsubscribe = unsub;
  }

  setSharedListsUnsubscribe(unsub: (() => void) | undefined): void {
    this.sharedListsUnsubscribe = unsub;
  }

  hasArticlesListener(): boolean {
    return !!this.articlesUnsubscribe;
  }

  hasListsListener(): boolean {
    return !!this.listsUnsubscribe;
  }

  hasSharedListsListener(): boolean {
    return !!this.sharedListsUnsubscribe;
  }

  cleanupCollectionListeners(): void {
    if (this.articlesUnsubscribe) {
      this.articlesUnsubscribe();
      this.articlesUnsubscribe = undefined;
      this.logger.info('data', '✅ Articles collection listener unsubscribed');
    }

    if (this.listsUnsubscribe) {
      this.listsUnsubscribe();
      this.listsUnsubscribe = undefined;
      this.logger.info('data', '✅ Lists collection listener unsubscribed');
    }

    if (this.sharedListsUnsubscribe) {
      this.sharedListsUnsubscribe();
      this.sharedListsUnsubscribe = undefined;
      this.logger.info('data', '✅ Share-invites listener unsubscribed');
    }
  }

  // === Owned List Listener Management ===

  addOwnedListListener(listId: string, unsub: () => void): void {
    this.ownedListListeners.set(listId, unsub);
    this._ownedListListenersActive = true;
  }

  removeOwnedListListener(listId: string): void {
    const unsub = this.ownedListListeners.get(listId);
    if (unsub) {
      unsub();
      this.ownedListListeners.delete(listId);
    }
  }

  cleanupOwnedListListeners(): void {
    this.logger.debug('data', `Cleaning up ${this.ownedListListeners.size} owned list listeners`);
    this.ownedListListeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.ownedListListeners.clear();
    this._ownedListListenersActive = false;
  }

  get ownedListListenersActive(): boolean {
    return this._ownedListListenersActive;
  }

  get ownedListListenerCount(): number {
    return this.ownedListListeners.size;
  }

  // === Shared List Listener Management ===

  addSharedListListener(listId: string, unsub: () => void): void {
    this.sharedListListeners.set(listId, unsub);
  }

  removeSharedListListener(listId: string): void {
    const unsub = this.sharedListListeners.get(listId);
    if (unsub) {
      unsub();
      this.sharedListListeners.delete(listId);
    }
    this.lastSharedListUpdate.delete(listId);
  }

  cleanupSharedListListeners(): void {
    this.logger.debug('data', `Cleaning up ${this.sharedListListeners.size} shared list listeners`);
    this.sharedListListeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.sharedListListeners.clear();
  }

  get sharedListListenerCount(): number {
    return this.sharedListListeners.size;
  }

  // === Lazy Listeners ===

  cleanupLazyListeners(): void {
    this.logger.debug('data', `Cleaning up lazy listeners (${this.ownedListListeners.size} owned + ${this.sharedListListeners.size} shared)`);
    this.cleanupOwnedListListeners();
    this.cleanupSharedListListeners();
  }

  // === Active List Subscription ===

  setActiveListSubscription(sub: any): void {
    this.activeListSubscription = sub;
  }

  cleanupActiveListSubscription(): void {
    if (this.activeListSubscription) {
      this.activeListSubscription.unsubscribe();
      this.activeListSubscription = undefined;
    }
  }

  // === State Flags ===

  get collectionListenersCleanedUp(): boolean {
    return this._collectionListenersCleanedUp;
  }

  set collectionListenersCleanedUp(value: boolean) {
    this._collectionListenersCleanedUp = value;
  }

  get collectionListenersActive(): boolean {
    return this._collectionListenersActive;
  }

  set collectionListenersActive(value: boolean) {
    this._collectionListenersActive = value;
  }

  get isSettingUpListeners(): boolean {
    return this._isSettingUpListeners;
  }

  set isSettingUpListeners(value: boolean) {
    this._isSettingUpListeners = value;
  }

  get initialDataLoadDone(): boolean {
    return this._initialDataLoadDone;
  }

  set initialDataLoadDone(value: boolean) {
    this._initialDataLoadDone = value;
  }

  // === Cooldowns and Throttling ===

  getLastMergeWriteTime(listId: string): number {
    return this.lastMergeWrite.get(listId) || 0;
  }

  setLastMergeWriteTime(listId: string): void {
    this.lastMergeWrite.set(listId, Date.now());
  }

  isWithinMergeWriteCooldown(listId: string): boolean {
    const lastWriteTime = this.getLastMergeWriteTime(listId);
    return Date.now() - lastWriteTime < this.MERGE_WRITE_COOLDOWN;
  }

  get lastShareInvitesReload(): number {
    return this._lastShareInvitesReload;
  }

  set lastShareInvitesReload(value: number) {
    this._lastShareInvitesReload = value;
  }

  isShareInvitesReloadThrottled(): boolean {
    return Date.now() - this._lastShareInvitesReload < this.SHARE_INVITES_RELOAD_THROTTLE;
  }

  // === Full Cleanup ===

  cleanupAll(): void {
    this.cleanupCollectionListeners();
    this.cleanupActiveListSubscription();
    this.cleanupOwnedListListeners();
    this.cleanupSharedListListeners();

    // Reset flags
    this._collectionListenersCleanedUp = false;
    this._collectionListenersActive = false;
    this._isSettingUpListeners = false;
    this._initialDataLoadDone = false;

    // Clear cooldown maps
    this.lastSharedListUpdate.clear();
    this.lastMergeWrite.clear();

    this.logger.info('data', '🔄 All listeners cleaned up and flags reset');
  }

  // === Debug Info ===

  getDebugInfo(): object {
    return {
      articlesListenerActive: !!this.articlesUnsubscribe,
      listsListenerActive: !!this.listsUnsubscribe,
      sharedListsListenerActive: !!this.sharedListsUnsubscribe,
      ownedListListenerCount: this.ownedListListeners.size,
      sharedListListenerCount: this.sharedListListeners.size,
      ownedListListenersActive: this._ownedListListenersActive,
      collectionListenersCleanedUp: this._collectionListenersCleanedUp,
      collectionListenersActive: this._collectionListenersActive,
      isSettingUpListeners: this._isSettingUpListeners,
      initialDataLoadDone: this._initialDataLoadDone
    };
  }
}
