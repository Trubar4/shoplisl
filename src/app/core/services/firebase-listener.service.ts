import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  where
} from '@angular/fire/firestore';

import { ShoppingList } from '../models';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';
import { QuotaMonitorService } from './quota-monitor.service';
import { ActiveListService } from './active-list.service';
import { FirebaseMergeService } from './firebase-merge.service';
import { FirebaseWriteService } from './firebase-write.service';
import { FirebaseArticleLoaderService } from './firebase-article-loader.service';

// DEBUG FLAG - Set to true to enable detailed console logging
const DEBUG_FIREBASE_DATA = false;

const SHARED_USER_ID = 'shared-shoplisl-user';

/**
 * Context provided by FirebaseDataService so that FirebaseListenerService can
 * access shared mutable state and trigger UI updates without holding direct
 * references to FirebaseDataService instance variables.
 *
 * getOwnedLists() / getSharedLists() return LIVE array references —
 * in-place mutations (index assignment, splice) propagate to the facade.
 * Use the setters only when replacing the entire array.
 */
export interface ListenerServiceContext {
  /** Live reference to the owned-lists backing array. */
  getOwnedLists(): ShoppingList[];
  setOwnedLists(lists: ShoppingList[]): void;
  /** Live reference to the shared-lists backing array. */
  getSharedLists(): ShoppingList[];
  setSharedLists(lists: ShoppingList[]): void;
  /** Current value of listsSubject (includes optimistic updates). */
  getListsSnapshot(): ShoppingList[];
  /** Trigger debounced merge of owned + shared lists → listsSubject. */
  mergeLists(): void;
  /** Load from offline cache → subjects. */
  loadCachedData(): void;
  /**
   * Called at the end of cleanupListeners() so the facade can reset flags
   * it owns: initialDataLoadDone, articlesLoadedFromFirestore, mergeListsTimer.
   */
  onListenersCleanedUp(): void;
}

/**
 * FirebaseListenerService
 *
 * Owns all Firestore onSnapshot real-time listeners extracted from
 * FirebaseDataService.
 *
 * Extracted methods:
 *   - setupRealtimeListeners
 *   - setupActiveListListener
 *   - setupLazyListenerForList
 *   - setupSingleOwnedListListener
 *   - setupSingleSharedListListener
 *   - setupOwnedListRealtimeListeners  (deprecated — kept for completeness)
 *   - setupSharedListRealtimeListeners (deprecated — kept for completeness)
 *   - cleanupOwnedListListeners
 *   - cleanupSharedListListeners
 *   - cleanupLazyListeners
 *   - cleanupListeners  (public)
 *   - removeOwnedList   (private)
 *   - removeSharedList  (private)
 *
 * Owned state (moved from FirebaseDataService):
 *   - articlesUnsubscribe / listsUnsubscribe / sharedListsUnsubscribe
 *   - ownedListListeners / ownedListListenersActive
 *   - sharedListListeners / lastSharedListUpdate
 *   - lastMergeWrite / MERGE_WRITE_COOLDOWN
 *   - lastShareInvitesReload / SHARE_INVITES_RELOAD_THROTTLE
 *   - collectionListenersCleanedUp / collectionListenersActive / isSettingUpListeners
 *   - activeListSubscription
 */
@Injectable({
  providedIn: 'root'
})
export class FirebaseListenerService {

  private articlesUnsubscribe?: () => void;
  private listsUnsubscribe?: () => void;
  private sharedListsUnsubscribe?: () => void;

  // LAZY LISTENERS: Track active list subscription for cleanup
  private activeListSubscription?: any;

  // REAL-TIME SYNC: Individual document listeners for owned and shared lists
  private ownedListListeners = new Map<string, () => void>();
  private ownedListListenersActive = false;
  private sharedListListeners = new Map<string, () => void>();
  private lastSharedListUpdate = new Map<string, number>(); // listId -> timestamp

  // CRITICAL: Prevent infinite loop from write-back triggering listener
  private lastMergeWrite = new Map<string, number>(); // listId -> timestamp of last write
  private readonly MERGE_WRITE_COOLDOWN = 2000; // 2 seconds cooldown

  // QUOTA OPTIMIZATION: Rate limit share-invites reloads
  private lastShareInvitesReload = 0;
  private readonly SHARE_INVITES_RELOAD_THROTTLE = 5000; // 5 seconds

  // QUOTA OPTIMIZATION: Track if collection listeners have been cleaned up
  private collectionListenersCleanedUp = false;

  // QUOTA OPTIMIZATION: Track if collection listeners are currently active
  private collectionListenersActive = false;

  // QUOTA OPTIMIZATION: Prevent concurrent setupRealtimeListeners() calls
  private isSettingUpListeners = false;

  private ctx: ListenerServiceContext | null = null;

  constructor(
    private firestore: Firestore,
    private authService: AuthService,
    private logger: LoggerService,
    private quotaMonitor: QuotaMonitorService,
    private activeListService: ActiveListService,
    private mergeService: FirebaseMergeService,
    private writeService: FirebaseWriteService,
    private articleLoader: FirebaseArticleLoaderService
  ) {}

  setContext(ctx: ListenerServiceContext): void {
    this.ctx = ctx;
  }

  /**
   * Record a merge-write timestamp so that when the onSnapshot callback fires
   * for our own write, we can suppress the infinite-loop write-back.
   * Also called by FirebaseCrudService via the CrudServiceContext.
   */
  markMergeWrite(listId: string): void {
    this.lastMergeWrite.set(listId, Date.now());
  }

  // ---------------------------------------------------------------------------
  // USER-BASE PATH HELPER (duplicated from facade — avoids circular dependency)
  // ---------------------------------------------------------------------------

  private getUserBasePath(): string {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No authenticated user, using shared user ID');
      return `users/${SHARED_USER_ID}`;
    }
    return `users-v2/${userId}`;
  }

  // ---------------------------------------------------------------------------
  // ACTIVE-LIST SUBSCRIPTION (lazy listener entry point)
  // ---------------------------------------------------------------------------

  /**
   * LAZY LISTENERS: Subscribe to active list changes.
   * Only sets up a real-time listener for the currently open list.
   * This reduces quota from 2,393 reads to ~26 reads per session (98% reduction).
   */
  setupActiveListListener(): void {
    this.activeListSubscription = this.activeListService.getActiveListId$().subscribe({
      next: (activeListId) => {
        if (activeListId) {
          this.logger.info('data', `🎯 Active list changed to ${activeListId}, setting up lazy listener`);
          this.setupLazyListenerForList(activeListId);
        } else {
          this.logger.debug('data', `Active list cleared, cleaning up lazy listeners`);
          this.cleanupLazyListeners();
        }
      },
      error: (err) => {
        this.logger.error('data', `Active list subscription ERROR:`, err);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // COLLECTION LISTENERS (initial load)
  // ---------------------------------------------------------------------------

  /**
   * Set up Firestore collection listeners for the initial data load.
   *
   * QUOTA OPTIMIZATION: Prevents concurrent and duplicate calls.
   */
  setupRealtimeListeners(): void {
    this.logger.info('data', '🔧 setupRealtimeListeners() called - setting up collection listeners');

    // Prevent concurrent setup calls (race condition fix)
    if (this.isSettingUpListeners) {
      this.logger.info('data', '⏭️  setupRealtimeListeners() already in progress - skipping duplicate call');
      return;
    }

    // Skip if collection listeners are already active
    if (this.collectionListenersActive) {
      this.logger.info('data', '⏭️  Collection listeners already active - skipping recreation to save quota');
      return;
    }

    // Set flag IMMEDIATELY to prevent concurrent calls
    this.isSettingUpListeners = true;

    if (!this.firestore) {
      this.logger.error('data', 'Firestore not initialized');
      this.isSettingUpListeners = false;
      return;
    }

    this.cleanupListeners();

    try {
      const basePath = this.getUserBasePath();

      // QUOTA OPTIMIZATION: Articles loading deferred (lazy)
      // Will load when article overview is opened, saving ~500-1000 reads per session.
      this.logger.info('data', '📡 Articles loading deferred (lazy) - will load when article overview is opened');
      this.articlesUnsubscribe = undefined;

      // Lists collection listener
      this.logger.info('data', '📡 Creating Lists collection listener...');
      const listsRef = collection(this.firestore, `${basePath}/lists`);
      const listsQuery = query(listsRef, orderBy('name'));

      this.listsUnsubscribe = onSnapshot(listsQuery,
        (snapshot) => {
          this.quotaMonitor.trackRead('Lists Collection Listener', snapshot.size);
          this.logger.debug('data', `Fresh lists received: ${snapshot.size}`);

          // Once individual listeners are active, they handle all updates
          if (this.ownedListListenersActive) {
            this.logger.debug('data', '⏭️ Skipping collection update - individual listeners active');
            return;
          }

          const lists: ShoppingList[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();

            // BUG 1 FIX: Populate articleIds from itemStates if empty
            let articleIds = data['articleIds'] || [];
            const itemStates = this.mergeService.convertItemStatesFromFirestore(data['itemStates'] || {});

            if (articleIds.length === 0 && Object.keys(itemStates).length > 0) {
              articleIds = Object.keys(itemStates);
              this.logger.debug('data', `Bug 1 Fix: Populated articleIds from itemStates for list ${docSnap.id} (${articleIds.length} articles)`);
            }

            const sharedWith = data['sharedWith'] || [];
            const list: ShoppingList = {
              id: docSnap.id,
              name: data['name'],
              color: data['color'],
              icon: data['icon'],
              shopId: data['shopId'],
              articleIds: articleIds,
              itemStates: itemStates,
              departmentOrder: data['departmentOrder'],
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date(),
              ownerId: data['ownerId'] || '',
              sharedWith: sharedWith
            };

            if (DEBUG_FIREBASE_DATA && sharedWith.length > 0) {
              this.logger.debug('data', `\n📥 RAW Firebase data for OWNED shared list ${docSnap.id}`);
              this.logger.debug('data', `   - List name: "${data['name']}"`);
              this.logger.debug('data', `   - Raw articleIds from Firebase: [${(data['articleIds'] || []).join(', ')}]`);
              this.logger.debug('data', `   - Shared with: ${sharedWith.length} users`);
            }

            lists.push(list);
          });

          // Store owned lists in facade's backing array and trigger merge
          this.ctx!.setOwnedLists(lists);
          this.ctx!.mergeLists();
        },
        (error) => {
          this.logger.error('data', 'Lists listener error', error);
          this.ctx!.loadCachedData();
        }
      );

      // Shared lists listener via share-invites
      const userId = this.authService.getCurrentUserId();
      if (userId) {
        if (this.sharedListsUnsubscribe) {
          this.logger.warn('data', '⚠️ Share-invites listener already active, skipping setup (prevents duplicates)');
        } else {
          this.logger.info('data', `Setting up shared lists listener for user ${userId}`);

          const invitesRef = collection(this.firestore, 'share-invites');
          const acceptedInvitesQuery = query(
            invitesRef,
            where('acceptedByUserId', '==', userId),
            where('status', '==', 'accepted')
          );

          this.sharedListsUnsubscribe = onSnapshot(acceptedInvitesQuery,
            async (inviteSnapshot) => {
              this.quotaMonitor.trackRead('Share-Invites Listener', inviteSnapshot.size);
              this.logger.info('data', `🔔 Share-invites listener FIRED: ${inviteSnapshot.size} accepted invites`);
              this.logger.info('data', `📊 This listener should be cleaned up when first list detail is opened`);

              // QUOTA OPTIMIZATION: Throttle rapid-fire reloads
              const now = Date.now();
              if (now - this.lastShareInvitesReload < this.SHARE_INVITES_RELOAD_THROTTLE) {
                this.logger.info('data', `⏭️ Share-invites reload throttled (too soon - ${now - this.lastShareInvitesReload}ms since last reload)`);
                return;
              }
              this.lastShareInvitesReload = now;

              if (DEBUG_FIREBASE_DATA) {
                this.logger.debug('data', '\n🔥 [FIREBASE DEBUG] ========================================');
                this.logger.debug('data', '📡 SHARE INVITES Query Response from Firebase');
                this.logger.debug('data', `   - Query: share-invites where acceptedByUserId == ${userId} AND status == 'accepted'`);
                this.logger.debug('data', `   - Number of accepted invites: ${inviteSnapshot.size}`);
              }

              const listIds = new Map<string, string>(); // listId -> ownerId

              inviteSnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const listId = data['listId'];
                const fromUserId = data['fromUserId'];
                if (listId && fromUserId) {
                  listIds.set(listId, fromUserId);
                  if (DEBUG_FIREBASE_DATA) {
                    this.logger.debug('data', `   - Found invite for list ID: ${listId} (owner: ${fromUserId})`);
                  }
                }
              });

              this.logger.info('data', `Loading ${listIds.size} shared lists`);

              const sharedLists: ShoppingList[] = [];
              let remainingLists = listIds.size;

              if (remainingLists === 0) {
                this.ctx!.setSharedLists([]);
                this.logger.info('data', 'No shared lists to load');
                this.ctx!.mergeLists();
                return;
              }

              for (const [listId, ownerId] of listIds.entries()) {
                const listRef = doc(this.firestore, `users-v2/${ownerId}/lists/${listId}`);

                // Use onSnapshot for initial load (fixes permission error vs getDoc)
                const unsubscribe = onSnapshot(
                  listRef,
                  (snapshot) => {
                    // Unsubscribe immediately after first event (quota optimization)
                    unsubscribe();

                    this.quotaMonitor.trackRead('Shared List Initial Load', 1, {
                      listId: listId,
                      ownerId: ownerId
                    });

                    if (DEBUG_FIREBASE_DATA) {
                      this.logger.debug('data', `\n📥 Loading shared list ${listId} from Firebase...`);
                      this.logger.debug('data', `   - Document exists: ${snapshot.exists()}`);
                    }

                    if (snapshot.exists()) {
                      const data = snapshot.data();

                      if (DEBUG_FIREBASE_DATA) {
                        this.logger.debug('data', `\n📥 RAW Firebase data for shared list ${listId}`);
                        this.logger.debug('data', `   - List name: "${data['name']}"`);
                        this.logger.debug('data', `   - Raw articleIds: [${(data['articleIds'] || []).join(', ')}]`);
                        this.logger.debug('data', `   - Raw itemStates keys: [${Object.keys(data['itemStates'] || {}).join(', ')}]`);
                      }

                      const sharedWith = data['sharedWith'] || [];
                      if (sharedWith.includes(userId)) {
                        // BUG 1 FIX: Populate articleIds from itemStates if empty
                        let articleIds = data['articleIds'] || [];
                        const itemStates = this.mergeService.convertItemStatesFromFirestore(data['itemStates'] || {});

                        if (articleIds.length === 0 && Object.keys(itemStates).length > 0) {
                          articleIds = Object.keys(itemStates);
                          this.logger.debug('data', `Bug 1 Fix: Populated articleIds from itemStates for shared list ${snapshot.id} (${articleIds.length} articles)`);
                          if (DEBUG_FIREBASE_DATA) {
                            this.logger.debug('data', `🔧 Bug 1 Fix: Populated articleIds from itemStates (${articleIds.length} articles)`);
                          }
                        }

                        const list: ShoppingList = {
                          id: snapshot.id,
                          name: data['name'],
                          color: data['color'],
                          icon: data['icon'],
                          shopId: data['shopId'],
                          articleIds: articleIds,
                          itemStates: itemStates,
                          departmentOrder: data['departmentOrder'],
                          createdAt: data['createdAt']?.toDate() || new Date(),
                          updatedAt: data['updatedAt']?.toDate() || new Date(),
                          ownerId: data['ownerId'] || ownerId,
                          sharedWith: sharedWith
                        };

                        if (DEBUG_FIREBASE_DATA) {
                          this.logger.debug('data', `\n📋 Shared List: "${list.name}"`);
                          this.logger.debug('data', `   - List ID: ${list.id}`);
                          this.logger.debug('data', `   - Owner ID: ${list.ownerId}`);
                          this.logger.debug('data', `   - Article IDs (final): [${list.articleIds.join(', ')}]`);
                        }

                        sharedLists.push(list);
                        this.logger.debug('data', `Loaded shared list: ${data['name']}`);
                      } else {
                        this.logger.warn('data', `List ${listId} no longer shared with user`);
                      }
                    } else {
                      this.logger.warn('data', `Shared list ${listId} not found (deleted?)`);
                    }

                    remainingLists--;
                    if (remainingLists === 0) {
                      this.ctx!.setSharedLists(sharedLists);
                      this.logger.info('data', `Loaded ${sharedLists.length} shared lists successfully`);
                      if (DEBUG_FIREBASE_DATA) {
                        this.logger.debug('data', `\n✅ All shared lists loaded: ${sharedLists.length} total`);
                      }
                      this.ctx!.mergeLists();
                    }
                  },
                  (error: any) => {
                    unsubscribe();
                    this.logger.error('data', `Failed to load shared list ${listId}:`, error);

                    remainingLists--;
                    if (remainingLists === 0) {
                      this.ctx!.setSharedLists(sharedLists);
                      this.logger.info('data', `Loaded ${sharedLists.length} shared lists successfully`);
                      this.ctx!.mergeLists();
                    }
                  }
                );
              }
            },
            (error: any) => {
              this.logger.error('data', 'Share invites listener error', error);
            }
          );
        }
      } else {
        this.logger.warn('data', 'No user ID available, skipping shared lists listener');
      }

      this.collectionListenersActive = true;
      this.isSettingUpListeners = false;
      this.logger.info('data', '✅ Collection listeners created and marked as active');
    } catch (error) {
      this.logger.error('data', 'Error setting up listeners', error);
      this.isSettingUpListeners = false;
      this.ctx!.loadCachedData();
    }
  }

  // ---------------------------------------------------------------------------
  // LAZY LISTENER — single list (active-list flow)
  // ---------------------------------------------------------------------------

  /**
   * LAZY LISTENERS: Set up listener for ONE specific list.
   * Called when a list is opened in the detail view.
   *
   * QUOTA OPTIMIZATION: Also cleans up collection listeners after first call,
   * preventing 10k+ unnecessary reads.
   */
  private setupLazyListenerForList(listId: string): void {
    this.logger.info('data', `🔧 setupLazyListenerForList() called for listId: ${listId}`);
    this.logger.info('data', `📍 collectionListenersCleanedUp flag: ${this.collectionListenersCleanedUp}`);

    // Cleanup existing lazy listeners first
    this.cleanupLazyListeners();

    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No user ID, cannot set up lazy listener');
      return;
    }

    // QUOTA OPTIMIZATION: Clean up collection listeners after first lazy listener setup
    if (!this.collectionListenersCleanedUp) {
      this.logger.info('data', '🚀 QUOTA OPTIMIZATION: Cleaning up collection listeners');
      this.logger.info('data', `📍 articlesUnsubscribe: ${!!this.articlesUnsubscribe}, listsUnsubscribe: ${!!this.listsUnsubscribe}, sharedListsUnsubscribe: ${!!this.sharedListsUnsubscribe}`);

      if (this.articlesUnsubscribe) {
        this.articlesUnsubscribe();
        this.articlesUnsubscribe = undefined;
        this.logger.info('data', '✅ Articles collection listener unsubscribed (saves ~450 reads per change!)');
      } else {
        this.logger.warn('data', '⚠️ Articles collection listener was already undefined');
      }

      if (this.listsUnsubscribe) {
        this.listsUnsubscribe();
        this.listsUnsubscribe = undefined;
        this.logger.info('data', '✅ Lists collection listener unsubscribed (saves ~13 reads per change!)');
      } else {
        this.logger.warn('data', '⚠️ Lists collection listener was already undefined');
      }

      if (this.sharedListsUnsubscribe) {
        this.sharedListsUnsubscribe();
        this.sharedListsUnsubscribe = undefined;
        this.logger.info('data', '✅ Share-invites listener unsubscribed (saves 200-400 reads per session!)');
      } else {
        this.logger.warn('data', '⚠️ Share-invites listener was already undefined');
      }

      this.collectionListenersCleanedUp = true;
      this.logger.info('data', '✅ All collection listeners cleanup complete - quota usage should drop by ~80%!');
    } else {
      this.logger.info('data', '⏭️  Skipping cleanup - collection listeners already cleaned up');
    }

    // Subscribe to listsSubject to wait for lists if not yet loaded
    const setupListener = (lists: ShoppingList[]) => {
      const list = lists.find(l => l.id === listId);

      if (!list) {
        this.logger.warn('data', `List ${listId} not found, cannot set up listener`);
        return;
      }

      const isOwnedList = list.ownerId === userId;

      if (isOwnedList) {
        this.setupSingleOwnedListListener(list);
      } else {
        this.setupSingleSharedListListener(list);
      }

      this.articleLoader.loadArticlesForList(list);

      this.logger.info('data', `✅ Lazy listener active for ${isOwnedList ? 'owned' : 'shared'} list: ${list.name}`);
    };

    const currentLists = this.ctx!.getListsSnapshot();
    if (currentLists.length > 0) {
      setupListener(currentLists);
    } else {
      this.logger.debug('data', `Waiting for lists to load before setting up listener for ${listId}`);
      // We must subscribe to the lists observable — but ListenerService doesn't hold the subject.
      // Use a one-shot observer via the facade's getListsSnapshot polling pattern:
      // The facade passes a listsSubject subscription helper through the context instead.
      // For now we replicate the original "subscribe, unsubscribe on first non-empty" approach
      // by checking getListsSnapshot() on a short interval.  In practice the lists load
      // within the same microtask burst, so the listsSubject.subscribe trick below is cleaner:
      const checkInterval = setInterval(() => {
        const lists = this.ctx!.getListsSnapshot();
        if (lists.length > 0) {
          clearInterval(checkInterval);
          setupListener(lists);
        }
      }, 100);
    }
  }

  /**
   * LAZY LISTENERS: Clean up all lazy (per-list) listeners.
   * Called when user navigates away from list detail.
   */
  cleanupLazyListeners(): void {
    this.logger.debug('data', `Cleaning up lazy listeners (${this.ownedListListeners.size} owned + ${this.sharedListListeners.size} shared)`);

    this.ownedListListeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.ownedListListeners.clear();
    this.ownedListListenersActive = false;

    this.sharedListListeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.sharedListListeners.clear();
  }

  // ---------------------------------------------------------------------------
  // SINGLE OWNED-LIST LISTENER (lazy mode)
  // ---------------------------------------------------------------------------

  /**
   * LAZY LISTENERS: Set up listener for ONE owned list.
   * Called when user opens a specific list in detail view.
   */
  private setupSingleOwnedListListener(list: ShoppingList): void {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No user ID, cannot set up owned list listener');
      return;
    }

    const listRef = doc(this.firestore, `users-v2/${userId}/lists/${list.id}`);

    const unsubscribe = onSnapshot(listRef,
      (snapshot) => {
        this.quotaMonitor.trackRead('Owned List Listener', 1, { listId: list.id, listName: list.name });
        this.logger.info('data', `🔔 Owned list listener FIRED for ${list.id} (${list.name})`);

        if (snapshot.exists()) {
          const data = snapshot.data();
          const ownedLists = this.ctx!.getOwnedLists();
          const index = ownedLists.findIndex(l => l.id === list.id);

          if (index !== -1) {
            const currentLists = this.ctx!.getListsSnapshot();
            const currentList = currentLists.find(l => l.id === list.id);

            const localItemStates = currentList?.itemStates || ownedLists[index].itemStates || {};
            const serverItemStates = this.mergeService.convertItemStatesFromFirestore(data['itemStates'] || {});
            const mergedItemStates = this.mergeService.mergeItemStates(localItemStates, serverItemStates);

            const localArticleIds = currentList?.articleIds || ownedLists[index].articleIds || [];
            const serverArticleIds = data['articleIds'] || [];
            const mergedArticleIds = this.mergeService.mergeArticleIds(localArticleIds, serverArticleIds, mergedItemStates);

            const lastWriteTime = this.lastMergeWrite.get(list.id) || 0;
            const timeSinceWrite = Date.now() - lastWriteTime;
            const isOurOwnWrite = timeSinceWrite < this.MERGE_WRITE_COOLDOWN;

            const itemStatesChanged = this.mergeService.hasItemStatesChanged(mergedItemStates, serverItemStates);
            const articleIdsChanged = this.mergeService.hasArticleIdsChanged(mergedArticleIds, serverArticleIds);
            const mergeChanged = itemStatesChanged || articleIdsChanged;

            // Detect new article IDs to trigger article loading
            const previousArticleIds = ownedLists[index].articleIds || [];
            const newArticleIds = mergedArticleIds.filter((id: string) => !previousArticleIds.includes(id));

            ownedLists[index] = {
              ...ownedLists[index],
              name: data['name'],
              color: data['color'],
              icon: data['icon'],
              shopId: data['shopId'],
              itemStates: mergedItemStates,
              articleIds: mergedArticleIds,
              departmentOrder: data['departmentOrder'],
              updatedAt: data['updatedAt']?.toDate() || new Date(),
              sharedWith: data['sharedWith'] || []
            };

            if (mergeChanged && !isOurOwnWrite) {
              this.logger.info('data', `🔄 Merge produced different state, writing back for ${data['name']}`);
              this.lastMergeWrite.set(list.id, Date.now());
              this.writeService.writeMergedStateToFirestore(list.id, userId, mergedItemStates, mergedArticleIds).catch(error => {
                this.logger.error('data', `Failed to write merged state for ${list.id}:`, error);
              });
            }

            if (newArticleIds.length > 0) {
              this.logger.info('data', `🆕 Detected ${newArticleIds.length} new articles in owned list "${data['name']}", loading them now...`);
              this.logger.debug('data', `New article IDs: ${newArticleIds.join(', ')}`);
              this.articleLoader.loadArticlesForList(ownedLists[index]).catch(error => {
                this.logger.error('data', `Failed to load new articles for ${list.id}:`, error);
              });
            }

            this.ctx!.mergeLists();
          }
        } else {
          this.logger.warn('data', `Owned list ${list.id} was deleted`);
          this.removeOwnedList(list.id);
        }
      },
      (error: any) => {
        this.logger.error('data', `Error in owned list listener for ${list.id}:`, error);
      }
    );

    this.ownedListListeners.set(list.id, unsubscribe);
    this.ownedListListenersActive = true;
  }

  // ---------------------------------------------------------------------------
  // SINGLE SHARED-LIST LISTENER (lazy mode)
  // ---------------------------------------------------------------------------

  /**
   * LAZY LISTENERS: Set up listener for ONE shared list.
   * Called when user opens a specific shared list in detail view.
   */
  private setupSingleSharedListListener(list: ShoppingList): void {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No user ID, cannot set up shared list listener');
      return;
    }

    const listRef = doc(this.firestore, `users-v2/${list.ownerId}/lists/${list.id}`);

    const unsubscribe = onSnapshot(listRef,
      (snapshot) => {
        this.quotaMonitor.trackRead('Shared List Listener', 1, { listId: list.id, listName: list.name });
        this.logger.info('data', `🔔 Shared list listener FIRED for ${list.id} (${list.name})`);

        if (snapshot.exists()) {
          const data = snapshot.data();

          // Verify user still has access
          const sharedWith = data['sharedWith'] || [];
          if (!sharedWith.includes(userId)) {
            this.logger.warn('data', `Lost access to list ${list.id}, removing`);
            this.removeSharedList(list.id);
            return;
          }

          const sharedLists = this.ctx!.getSharedLists();
          const index = sharedLists.findIndex(l => l.id === list.id);

          if (index !== -1) {
            // CRITICAL FIX: Detect new articles BEFORE optimistic update check
            const previousArticleIds = sharedLists[index].articleIds || [];
            const serverArticleIds = data['articleIds'] || [];
            const newArticleIds = serverArticleIds.filter((id: string) => !previousArticleIds.includes(id));

            const lastWriteTime = this.lastMergeWrite.get(list.id) || 0;
            const timeSinceWrite = Date.now() - lastWriteTime;
            const isOurOwnWrite = timeSinceWrite < this.MERGE_WRITE_COOLDOWN;

            const serverItemStates = this.mergeService.convertItemStatesFromFirestore(data['itemStates'] || {});

            let finalItemStates: { [articleId: string]: any };
            let finalArticleIds: string[];

            if (isOurOwnWrite) {
              // This is OUR write — preserve local optimistic updates
              const currentLists = this.ctx!.getListsSnapshot();
              const currentList = currentLists.find(l => l.id === list.id);

              finalItemStates = currentList?.itemStates || serverItemStates;
              finalArticleIds = currentList?.articleIds || serverArticleIds;

              // BUG FIX: Apply Bug 1 Fix even for optimistic updates
              if (finalArticleIds.length === 0 && Object.keys(finalItemStates).length > 0) {
                finalArticleIds = Object.keys(finalItemStates);
                this.logger.debug('data', `Bug 1 Fix (optimistic): Populated articleIds from itemStates for shared list ${data['name']} (${finalArticleIds.length} articles)`);
              }

              this.logger.info('data', `⏭️ Preserving optimistic updates for shared list ${data['name']} (our write ${timeSinceWrite}ms ago)`);
            } else {
              // OWNER's write or old data — trust server completely
              finalItemStates = serverItemStates;
              finalArticleIds = serverArticleIds;

              // BUG FIX: Populate articleIds from itemStates if empty
              if (finalArticleIds.length === 0 && Object.keys(finalItemStates).length > 0) {
                finalArticleIds = Object.keys(finalItemStates);
                this.logger.debug('data', `Bug 1 Fix (server): Populated articleIds from itemStates for shared list ${data['name']} (${finalArticleIds.length} articles)`);
              }

              this.logger.debug('data', `📥 Using server state for shared list ${data['name']} (owner's version)`);
            }

            sharedLists[index] = {
              ...sharedLists[index],
              name: data['name'],
              color: data['color'],
              icon: data['icon'],
              shopId: data['shopId'],
              itemStates: finalItemStates,
              articleIds: finalArticleIds,
              departmentOrder: data['departmentOrder'],
              updatedAt: data['updatedAt']?.toDate() || new Date(),
              sharedWith: sharedWith
            };

            // REAL-TIME SYNC FIX: Load new articles when owner adds them
            if (newArticleIds.length > 0) {
              this.logger.info('data', `🆕 Detected ${newArticleIds.length} new articles in shared list "${data['name']}", loading them now...`);
              this.logger.debug('data', `New article IDs: ${newArticleIds.join(', ')}`);
              this.articleLoader.loadArticlesForList(sharedLists[index]).catch(error => {
                this.logger.error('data', `Failed to load new articles for ${list.id}:`, error);
              });
            }

            this.ctx!.mergeLists();
          }
        } else {
          this.logger.warn('data', `Shared list ${list.id} was deleted by owner`);
          this.removeSharedList(list.id);
        }
      },
      (error: any) => {
        this.logger.error('data', `Error in shared list listener for ${list.id}:`, error);
        this.removeSharedList(list.id);
      }
    );

    this.sharedListListeners.set(list.id, unsubscribe);
  }

  // ---------------------------------------------------------------------------
  // DEPRECATED BULK LISTENERS (kept for completeness; not called in lazy mode)
  // ---------------------------------------------------------------------------

  /**
   * @deprecated Use lazy listeners via setupActiveListListener() instead.
   * Set up onSnapshot listeners for ALL owned lists.
   * NOTE: This method is not called in the current lazy-listener architecture.
   */
  private setupOwnedListRealtimeListeners(ownedLists: ShoppingList[]): void {
    this.cleanupOwnedListListeners();

    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No user ID, cannot set up owned list listeners');
      return;
    }

    this.logger.info('data', `⚡ Setting up real-time listeners for ${ownedLists.length} owned lists`);

    for (const list of ownedLists) {
      const listRef = doc(this.firestore, `users-v2/${userId}/lists/${list.id}`);
      const facades = this.ctx!;

      const unsubscribe = onSnapshot(listRef,
        (snapshot) => {
          this.logger.info('data', `🔔 Owned list listener FIRED for ${list.id} (${list.name})`);

          if (snapshot.exists()) {
            const data = snapshot.data();
            const owned = facades.getOwnedLists();
            const index = owned.findIndex(l => l.id === list.id);

            if (index !== -1) {
              const currentLists = facades.getListsSnapshot();
              const currentList = currentLists.find(l => l.id === list.id);

              const localItemStates = currentList?.itemStates || owned[index].itemStates || {};
              const serverItemStates = this.mergeService.convertItemStatesFromFirestore(data['itemStates'] || {});
              const mergedItemStates = this.mergeService.mergeItemStates(localItemStates, serverItemStates);

              const localArticleIds = currentList?.articleIds || owned[index].articleIds || [];
              const serverArticleIds = data['articleIds'] || [];
              const mergedArticleIds = this.mergeService.mergeArticleIds(localArticleIds, serverArticleIds, mergedItemStates);

              const lastWriteTime = this.lastMergeWrite.get(list.id) || 0;
              const timeSinceWrite = Date.now() - lastWriteTime;
              const isOurOwnWrite = timeSinceWrite < this.MERGE_WRITE_COOLDOWN;

              const itemStatesChanged = this.mergeService.hasItemStatesChanged(mergedItemStates, serverItemStates);
              const articleIdsChanged = this.mergeService.hasArticleIdsChanged(mergedArticleIds, serverArticleIds);
              const mergeChanged = itemStatesChanged || articleIdsChanged;

              owned[index] = {
                ...owned[index],
                name: data['name'],
                color: data['color'],
                icon: data['icon'],
                shopId: data['shopId'],
                itemStates: mergedItemStates,
                articleIds: mergedArticleIds,
                departmentOrder: data['departmentOrder'],
                updatedAt: data['updatedAt']?.toDate() || new Date(),
                sharedWith: data['sharedWith'] || []
              };

              if (mergeChanged && !isOurOwnWrite) {
                this.logger.info('data', `🔄 Merge produced different state, writing back for ${data['name']}`);
                this.lastMergeWrite.set(list.id, Date.now());
                this.writeService.writeMergedStateToFirestore(list.id, userId, mergedItemStates, mergedArticleIds).catch(error => {
                  this.logger.error('data', `Failed to write merged state for ${list.id}:`, error);
                });
              }

              facades.mergeLists();
            }
          } else {
            this.logger.warn('data', `Owned list ${list.id} was deleted`);
            this.removeOwnedList(list.id);
          }
        },
        (error: any) => {
          this.logger.error('data', `Error in owned list listener for ${list.id}:`, error);
        }
      );

      this.ownedListListeners.set(list.id, unsubscribe);
    }

    this.ownedListListenersActive = true;
    this.logger.info('data', `✅ Real-time listeners active for ${this.ownedListListeners.size} owned lists`);
  }

  /**
   * @deprecated Use lazy listeners via setupActiveListListener() instead.
   * Set up onSnapshot listeners for ALL shared lists.
   * NOTE: This method is not called in the current lazy-listener architecture.
   */
  private setupSharedListRealtimeListeners(sharedLists: ShoppingList[]): void {
    this.cleanupSharedListListeners();

    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No user ID, cannot set up shared list listeners');
      return;
    }

    this.logger.info('data', `⚡ Setting up real-time listeners for ${sharedLists.length} shared lists`);

    for (const list of sharedLists) {
      const listRef = doc(this.firestore, `users-v2/${list.ownerId}/lists/${list.id}`);

      const unsubscribe = onSnapshot(listRef,
        (snapshot) => {
          this.logger.info('data', `🔔 Shared list listener FIRED for ${list.id} (${list.name})`);

          if (snapshot.exists()) {
            const data = snapshot.data();
            const sharedWith = data['sharedWith'] || [];

            if (!sharedWith.includes(userId)) {
              this.logger.warn('data', `Lost access to list ${list.id}, removing`);
              this.removeSharedList(list.id);
              return;
            }

            const shared = this.ctx!.getSharedLists();
            const index = shared.findIndex(l => l.id === list.id);

            if (index !== -1) {
              const lastWriteTime = this.lastMergeWrite.get(list.id) || 0;
              const timeSinceWrite = Date.now() - lastWriteTime;
              const isOurOwnWrite = timeSinceWrite < this.MERGE_WRITE_COOLDOWN;

              const serverItemStates = this.mergeService.convertItemStatesFromFirestore(data['itemStates'] || {});
              const serverArticleIds = data['articleIds'] || [];

              let finalItemStates: { [articleId: string]: any };
              let finalArticleIds: string[];

              if (isOurOwnWrite) {
                const currentLists = this.ctx!.getListsSnapshot();
                const currentList = currentLists.find(l => l.id === list.id);
                finalItemStates = currentList?.itemStates || serverItemStates;
                finalArticleIds = currentList?.articleIds || serverArticleIds;
                this.logger.info('data', `⏭️ Preserving optimistic updates for shared list ${data['name']}`);
              } else {
                finalItemStates = serverItemStates;
                finalArticleIds = serverArticleIds;
                this.logger.debug('data', `📥 Using server state for shared list ${data['name']}`);
              }

              shared[index] = {
                ...shared[index],
                name: data['name'],
                color: data['color'],
                icon: data['icon'],
                shopId: data['shopId'],
                itemStates: finalItemStates,
                articleIds: finalArticleIds,
                departmentOrder: data['departmentOrder'],
                updatedAt: data['updatedAt']?.toDate() || new Date(),
                sharedWith: sharedWith
              };

              this.ctx!.mergeLists();
            }
          } else {
            this.logger.warn('data', `Shared list ${list.id} was deleted by owner`);
            this.removeSharedList(list.id);
          }
        },
        (error: any) => {
          this.logger.error('data', `❌ Shared list listener ERROR for ${list.id}:`, error);
          this.removeSharedList(list.id);
        }
      );

      this.sharedListListeners.set(list.id, unsubscribe);
    }

    this.logger.info('data', `✅ Real-time listeners active for ${this.sharedListListeners.size} shared lists`);
  }

  // ---------------------------------------------------------------------------
  // CLEANUP
  // ---------------------------------------------------------------------------

  /** Clean up all owned list real-time listeners. */
  private cleanupOwnedListListeners(): void {
    this.logger.debug('data', `Cleaning up ${this.ownedListListeners.size} owned list listeners`);
    this.ownedListListeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.ownedListListeners.clear();
    this.ownedListListenersActive = false;
  }

  /** Clean up all shared list real-time listeners. */
  private cleanupSharedListListeners(): void {
    this.logger.debug('data', `Cleaning up ${this.sharedListListeners.size} shared list listeners`);
    this.sharedListListeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.sharedListListeners.clear();
  }

  /** Remove an owned list from the facade's backing array and clean up its listener. */
  private removeOwnedList(listId: string): void {
    const ownedLists = this.ctx!.getOwnedLists();
    const index = ownedLists.findIndex(l => l.id === listId);
    if (index !== -1) {
      ownedLists.splice(index, 1);
      this.ctx!.mergeLists();
    }

    const unsubscribe = this.ownedListListeners.get(listId);
    if (unsubscribe) {
      unsubscribe();
      this.ownedListListeners.delete(listId);
    }
  }

  /** Remove a shared list from the facade's backing array and clean up its listener. */
  private removeSharedList(listId: string): void {
    const sharedLists = this.ctx!.getSharedLists();
    const index = sharedLists.findIndex(l => l.id === listId);
    if (index !== -1) {
      sharedLists.splice(index, 1);
      this.ctx!.mergeLists();
    }

    const unsubscribe = this.sharedListListeners.get(listId);
    if (unsubscribe) {
      unsubscribe();
      this.sharedListListeners.delete(listId);
    }

    this.lastSharedListUpdate.delete(listId);
  }

  /**
   * Tear down all active listeners and reset all state flags.
   * Called on user logout and user switch.
   * Notifies the facade via onListenersCleanedUp() to reset facade-owned flags.
   */
  cleanupListeners(): void {
    if (this.articlesUnsubscribe) {
      this.articlesUnsubscribe();
      this.articlesUnsubscribe = undefined;
    }
    if (this.listsUnsubscribe) {
      this.listsUnsubscribe();
      this.listsUnsubscribe = undefined;
    }
    if (this.sharedListsUnsubscribe) {
      this.sharedListsUnsubscribe();
      this.sharedListsUnsubscribe = undefined;
    }

    if (this.activeListSubscription) {
      this.activeListSubscription.unsubscribe();
      this.activeListSubscription = undefined;
    }

    this.cleanupOwnedListListeners();
    this.cleanupSharedListListeners();

    // Reset collection listener flags so they can be recreated on next login
    this.logger.info('data', '🔄 cleanupListeners() resetting collection listener flags to FALSE');
    this.collectionListenersCleanedUp = false;
    this.collectionListenersActive = false;
    this.isSettingUpListeners = false;

    this.articleLoader.clearCaches();
    this.lastSharedListUpdate.clear();

    // Let the facade reset its own flags (initialDataLoadDone, articlesLoadedFromFirestore, mergeListsTimer)
    if (this.ctx) {
      this.ctx.onListenersCleanedUp();
    }
  }
}
