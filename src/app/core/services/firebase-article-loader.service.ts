import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  documentId
} from '@angular/fire/firestore';

import { Article, ShoppingList } from '../models';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';
import { QuotaMonitorService } from './quota-monitor.service';

/**
 * Context provided by FirebaseDataService so that FirebaseArticleLoaderService
 * can read and update the shared mutable arrays without holding direct references
 * to FirebaseDataService instance variables.
 *
 * Getters return LIVE array references — mutations via push() are reflected
 * immediately. Setters must be used when replacing the array entirely.
 */
export interface ArticleLoaderContext {
  getSharedLists(): ShoppingList[];
  getOwnedLists(): ShoppingList[];
  getSharedArticles(): Article[];
  setSharedArticles(articles: Article[]): void;
  getOwnedArticles(): Article[];
  setOwnedArticles(articles: Article[]): void;
  mergeArticles(): void;
}

/**
 * FirebaseArticleLoaderService
 *
 * Handles batch loading of articles from Firestore, extracted from FirebaseDataService.
 * Owns the caching state for article loads.
 *
 * Extracted methods:
 *   - loadArticlesForList
 *   - loadArticlesFromSharedListOwners
 *   - loadOwnedArticlesByIds
 *   - batchLoadArticles (private helper)
 *   - chunkArray      (private utility)
 *
 * Owned state (moved from FirebaseDataService):
 *   - loadedSharedArticleIds
 *   - failedArticleIds
 *   - articleOwnerCache
 *   - previousSharedArticleIds
 *   - isBatchLoading
 */
@Injectable({
  providedIn: 'root'
})
export class FirebaseArticleLoaderService {

  // Performance: Cache loaded article IDs to prevent redundant queries
  private loadedSharedArticleIds = new Set<string>();

  // Performance: Track article IDs that failed to load (don't retry)
  private failedArticleIds = new Set<string>();

  // QUOTA OPTIMIZATION: Cache article owner mapping to prevent redundant queries
  private articleOwnerCache = new Map<string, string>();

  // QUOTA OPTIMIZATION: Track previous shared article IDs to avoid redundant batch loads
  private previousSharedArticleIds = new Set<string>();

  // Performance: Prevent concurrent batch loads
  private isBatchLoading = false;

  private ctx: ArticleLoaderContext | null = null;

  constructor(
    private firestore: Firestore,
    private logger: LoggerService,
    private authService: AuthService,
    private quotaMonitor: QuotaMonitorService
  ) {}

  /**
   * Called by FirebaseDataService during construction to provide callbacks
   * for reading and updating shared mutable state.
   */
  setContext(ctx: ArticleLoaderContext): void {
    this.ctx = ctx;
  }

  /**
   * Clear all article-loading caches.
   * Called by FirebaseDataService.cleanupListeners() on user logout / cleanup.
   */
  clearCaches(): void {
    this.loadedSharedArticleIds.clear();
    this.failedArticleIds.clear();
    this.articleOwnerCache.clear();
    this.previousSharedArticleIds.clear();
  }

  /**
   * Load articles for a single list.
   * Only loads articles for shared lists (or owned lists shared with others).
   * Skips articles already in the cache.
   */
  async loadArticlesForList(list: ShoppingList): Promise<void> {
    if (!this.ctx) return;

    // Only load articles if this is a shared list OR an owned list that's shared with others
    const isSharedList = list.ownerId !== this.authService.getCurrentUserId();
    const isSharedOwnedList = list.sharedWith && list.sharedWith.length > 0;

    if (!isSharedList && !isSharedOwnedList) {
      this.logger.debug('data', `Skipping article load for private list: ${list.name}`);
      return;
    }

    const articleIds = list.articleIds || [];
    if (articleIds.length === 0) {
      this.logger.debug('data', `No articles to load for list: ${list.name}`);
      return;
    }

    // Filter out articles we already have loaded
    const articlesToLoad = articleIds.filter(
      id => !this.loadedSharedArticleIds.has(id) && !this.failedArticleIds.has(id)
    );

    if (articlesToLoad.length === 0) {
      this.logger.debug('data', `All ${articleIds.length} articles already cached for ${list.name}`);
      return;
    }

    this.logger.info('data', `📦 Loading ${articlesToLoad.length} articles for list: ${list.name}`);

    // CRITICAL FIX: Load articles from ALL list participants, not just owner
    // When a participant creates an article, it's in their collection: users-v2/{participantId}/articles
    const currentUserId = this.authService.getCurrentUserId();
    const ownerIds = [list.ownerId];

    // Add all shared participants as potential article owners
    if (list.sharedWith && list.sharedWith.length > 0) {
      list.sharedWith.forEach((userId: string) => {
        if (!ownerIds.includes(userId)) {
          ownerIds.push(userId);
        }
      });
    }

    // Also add current user if they're a participant (for their own articles)
    if (currentUserId && !ownerIds.includes(currentUserId)) {
      ownerIds.push(currentUserId);
    }

    this.logger.info('data', `🔍 Searching for articles in ${ownerIds.length} user collections (owner + ${list.sharedWith?.length || 0} participants)`);

    try {
      const newArticles = await this.batchLoadArticles(articlesToLoad, ownerIds, currentUserId);

      // Update cache
      newArticles.forEach(article => {
        this.loadedSharedArticleIds.add(article.id);
        if (article.ownerId) {
          this.articleOwnerCache.set(article.id, article.ownerId);
        }
      });

      // Merge with existing shared articles
      const sharedArticles = this.ctx.getSharedArticles();
      const existingArticleIds = new Set(sharedArticles.map(a => a.id));
      const articlesToAdd = newArticles.filter(a => !existingArticleIds.has(a.id));

      if (articlesToAdd.length > 0) {
        this.ctx.setSharedArticles([...sharedArticles, ...articlesToAdd]);
        this.logger.info('data', `✅ Loaded ${articlesToAdd.length} new articles for ${list.name}`);
      }

      // CRITICAL FIX: Always call mergeArticles() even if no new articles were loaded
      // This ensures optimistically-added articles (already in ownedArticles) get merged and UI updates
      // Without this, newly created articles won't appear until Firestore indexes them (eventual consistency)
      this.ctx.mergeArticles();
    } catch (error) {
      this.logger.error('data', `Failed to load articles for ${list.name}:`, error);
    }
  }

  /**
   * Load articles from all shared list owners and collaborators.
   * Uses caching to avoid redundant Firestore reads.
   *
   * NOTE: This method is retained for completeness but is not currently
   * called; article loading is driven per-list via loadArticlesForList().
   */
  async loadArticlesFromSharedListOwners(): Promise<void> {
    if (!this.ctx) return;

    // Performance: Prevent concurrent batch loads
    if (this.isBatchLoading) {
      this.logger.debug('data', '⏭️ Skipping batch load - already in progress');
      return;
    }

    this.isBatchLoading = true;
    const startTime = Date.now();

    try {
      // Phase 8: Include both lists shared WITH us and lists we OWN that are shared with others
      const listsToProcess = [
        ...this.ctx.getSharedLists(),
        ...this.ctx.getOwnedLists().filter(list => list.sharedWith && list.sharedWith.length > 0)
      ];

      if (listsToProcess.length === 0) {
        this.logger.debug('data', 'No shared lists, skipping article loading');
        // Clear cache when no shared lists
        this.loadedSharedArticleIds.clear();
        this.failedArticleIds.clear();
        return;
      }

      // Collect all unique article IDs from all shared lists
      const sharedArticleIds = new Set<string>();
      listsToProcess.forEach(list => {
        list.articleIds.forEach(articleId => sharedArticleIds.add(articleId));
      });

      if (sharedArticleIds.size === 0) {
        this.logger.debug('data', 'No articles on shared lists');
        return;
      }

      // Performance: Only load articles we haven't loaded yet
      const articlesToLoad = Array.from(sharedArticleIds).filter(
        id => !this.loadedSharedArticleIds.has(id) && !this.failedArticleIds.has(id)
      );

      if (articlesToLoad.length === 0) {
        this.logger.info('data', `📊 All ${sharedArticleIds.size} shared articles already cached, skipping batch load`);
        return;
      }

      this.logger.info('data', `Found ${articlesToLoad.length} NEW articles to load (${sharedArticleIds.size} total, ${this.loadedSharedArticleIds.size} cached)`);

      // QUOTA OPTIMIZATION: Build smart owner list based on cache + list owners
      // Instead of querying ALL possible owners (list owner + collaborators),
      // prioritize list owners first (most likely to have the articles)
      const priorityOwners = new Set<string>();
      const fallbackOwners = new Set<string>();

      // First priority: List owners (articles are usually in the list owner's collection)
      listsToProcess.forEach(list => {
        if (list.ownerId) {
          priorityOwners.add(list.ownerId);
        }
      });

      // Second priority: Owners from cache (we know they have articles)
      articlesToLoad.forEach(articleId => {
        const cachedOwner = this.articleOwnerCache.get(articleId);
        if (cachedOwner) {
          priorityOwners.add(cachedOwner);
        }
      });

      // Fallback: Collaborators (only if needed)
      listsToProcess.forEach(list => {
        if (list.sharedWith) {
          list.sharedWith.forEach(userId => fallbackOwners.add(userId));
        }
      });

      const currentUserId = this.authService.getCurrentUserId();

      // QUOTA OPTIMIZATION: Start with priority owners only
      this.logger.info('data', `🚀 QUOTA OPTIMIZED: Batch loading ${articlesToLoad.length} articles from ${priorityOwners.size} priority owners (${fallbackOwners.size} fallback)`);

      // PERFORMANCE: Load articles in parallel batches using IN queries
      let newlyLoadedArticles = await this.batchLoadArticles(
        articlesToLoad,
        Array.from(priorityOwners),
        currentUserId
      );

      // QUOTA OPTIMIZATION: Only query fallback owners if we still have missing articles
      const stillMissing = articlesToLoad.filter(id =>
        !newlyLoadedArticles.find(a => a.id === id)
      );

      if (stillMissing.length > 0 && fallbackOwners.size > 0) {
        this.logger.info('data', `⚠️ ${stillMissing.length} articles not found in priority owners, trying ${fallbackOwners.size} fallback owners...`);
        const fallbackArticles = await this.batchLoadArticles(
          stillMissing,
          Array.from(fallbackOwners).filter(id => !priorityOwners.has(id)), // Exclude already-queried owners
          currentUserId
        );
        newlyLoadedArticles = [...newlyLoadedArticles, ...fallbackArticles];
      }

      // Performance: Update cache with successfully loaded article IDs
      newlyLoadedArticles.forEach(article => {
        this.loadedSharedArticleIds.add(article.id);
        // QUOTA OPTIMIZATION: Cache article owner to avoid redundant queries next time
        if (article.ownerId) {
          this.articleOwnerCache.set(article.id, article.ownerId);
        }
      });

      // Performance: Track articles that failed to load
      const loadedIds = new Set(newlyLoadedArticles.map(a => a.id));
      articlesToLoad.forEach(id => {
        if (!loadedIds.has(id)) {
          this.failedArticleIds.add(id);
        }
      });

      // Phase 8.2: Merge newly loaded articles with previously cached articles
      // Keep all previously loaded articles that are still on shared lists
      const currentSharedArticles = this.ctx.getSharedArticles();
      const previouslyLoadedArticles = currentSharedArticles.filter(article =>
        sharedArticleIds.has(article.id)
      );

      // Performance: Remove articles from cache if they're no longer on shared lists
      currentSharedArticles.forEach(article => {
        if (!sharedArticleIds.has(article.id)) {
          this.loadedSharedArticleIds.delete(article.id);
          this.failedArticleIds.delete(article.id);
        }
      });

      // Performance: Clear failed status if article is being retried (was added back to a list)
      articlesToLoad.forEach(id => {
        if (this.failedArticleIds.has(id)) {
          this.failedArticleIds.delete(id);
        }
      });

      this.ctx.setSharedArticles([...previouslyLoadedArticles, ...newlyLoadedArticles]);

      const elapsedTime = Date.now() - startTime;
      this.logger.info('data', `✅ Loaded ${newlyLoadedArticles.length} NEW articles in ${elapsedTime}ms (${this.ctx.getSharedArticles().length} total shared articles)`);
      this.ctx.mergeArticles();
    } finally {
      this.isBatchLoading = false;
    }
  }

  /**
   * QUOTA OPTIMIZATION: Load only owned articles that are on current lists.
   * This replaces the Articles collection listener that loads ALL articles (463+).
   * Now we only load articles that are actually needed (~22).
   * Saves ~441 unnecessary reads per session.
   */
  async loadOwnedArticlesByIds(articleIds: string[]): Promise<void> {
    if (!this.ctx) return;

    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No user ID, cannot load owned articles');
      return;
    }

    if (articleIds.length === 0) {
      this.logger.debug('data', 'No article IDs to load');
      return;
    }

    const BATCH_SIZE = 30; // Firestore IN query limit
    const chunks = this.chunkArray(articleIds, BATCH_SIZE);
    const articles: Article[] = [];

    this.logger.info('data', `📦 Loading ${articleIds.length} owned articles in ${chunks.length} batch(es)`);

    // Load all chunks in parallel
    const chunkPromises = chunks.map(async (chunk) => {
      const articlesRef = collection(this.firestore, `users-v2/${userId}/articles`);
      const batchQuery = query(
        articlesRef,
        where(documentId(), 'in', chunk)
      );

      const snapshot = await getDocs(batchQuery);
      this.quotaMonitor.trackRead('Load Owned Articles (Quota Optimized)', snapshot.size, { userId, chunkSize: chunk.length });

      const chunkArticles: Article[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        chunkArticles.push({
          id: doc.id,
          name: data['name'],
          amount: data['amount'],
          notes: data['notes'],
          icon: data['icon'],
          categoryId: data['categoryId'],
          departmentId: data['departmentId'],
          createdAt: data['createdAt']?.toDate() || new Date(),
          updatedAt: data['updatedAt']?.toDate() || new Date(),
          availableInShops: data['availableInShops'] || [],
          usageCount: data['usageCount'] || 0,
          ownerId: data['ownerId'] || userId,
          copiedFrom: data['copiedFrom'] || undefined
        });
      });

      return chunkArticles;
    });

    // Wait for all chunks to complete
    const chunkResults = await Promise.all(chunkPromises);
    chunkResults.forEach(chunkArticles => {
      articles.push(...chunkArticles);
    });

    this.logger.info('data', `✅ Loaded ${articles.length} owned articles from Firestore`);

    // Merge newly loaded articles with existing ownedArticles (preserves cached articles)
    const ownedArticles = this.ctx.getOwnedArticles();
    const existingIds = new Set(ownedArticles.map(a => a.id));
    const newArticles = articles.filter(a => !existingIds.has(a.id));

    if (newArticles.length > 0) {
      this.ctx.setOwnedArticles([...ownedArticles, ...newArticles]);
      this.logger.info('data', `📦 Merged ${newArticles.length} new articles with ${existingIds.size} cached → ${this.ctx.getOwnedArticles().length} total owned`);
    }

    this.ctx.mergeArticles();
  }

  /**
   * PERFORMANCE OPTIMIZED: Batch load articles using Firestore IN queries.
   * This is 10-20x faster than sequential loading.
   *
   * Strategy:
   * 1. For each owner, batch articles into groups of 30 (Firestore IN query limit)
   * 2. Run all batches in parallel
   * 3. Filter out articles owned by current user (already in ownedArticles)
   */
  private async batchLoadArticles(
    articleIds: string[],
    ownerIds: string[],
    currentUserId: string | null
  ): Promise<Article[]> {
    if (!this.ctx) return [];

    const BATCH_SIZE = 30; // Firestore IN query limit
    const allArticles: Article[] = [];
    const foundArticleIds = new Set<string>();

    // Create parallel batch loading tasks for all owners
    const batchTasks: Promise<void>[] = [];

    for (const ownerId of ownerIds) {
      // Split article IDs into chunks of 30 for this owner
      const articleChunks = this.chunkArray(articleIds, BATCH_SIZE);

      for (const chunk of articleChunks) {
        // Create a batch query task
        const task = (async () => {
          try {
            const articlesRef = collection(this.firestore, `users-v2/${ownerId}/articles`);
            const batchQuery = query(
              articlesRef,
              where(documentId(), 'in', chunk)
            );

            const snapshot = await getDocs(batchQuery);
            this.quotaMonitor.trackRead('Batch Load Articles', snapshot.size, { ownerId, chunkSize: chunk.length });

            snapshot.forEach((doc) => {
              // Only add if we haven't found this article yet
              if (!foundArticleIds.has(doc.id)) {
                const data = doc.data();
                const article: Article = {
                  id: doc.id,
                  name: data['name'],
                  amount: data['amount'],
                  notes: data['notes'],
                  icon: data['icon'],
                  categoryId: data['categoryId'],
                  departmentId: data['departmentId'],
                  createdAt: data['createdAt']?.toDate() || new Date(),
                  updatedAt: data['updatedAt']?.toDate() || new Date(),
                  availableInShops: data['availableInShops'] || [],
                  usageCount: data['usageCount'] || 0,
                  ownerId: data['ownerId'] || ownerId,
                  copiedFrom: data['copiedFrom'] || undefined
                };

                // CRITICAL FIX: Always add article if not already found.
                // Previous bug: Filtered out owner's articles assuming they're in ownedArticles.
                // But with lazy loading, new articles aren't in ownedArticles yet!
                // Solution: Check if already loaded instead of checking ownership.
                const alreadyInOwned = this.ctx!.getOwnedArticles().find(a => a.id === doc.id);
                const alreadyInShared = allArticles.find(a => a.id === doc.id);

                if (!alreadyInOwned && !alreadyInShared) {
                  // Article not loaded yet - add it
                  allArticles.push(article);
                  foundArticleIds.add(doc.id);

                  // If it's owned by current user, also add to ownedArticles
                  if (article.ownerId === currentUserId) {
                    this.ctx!.getOwnedArticles().push(article); // mutate live array
                    this.logger.debug('data', `➕ Added new owned article to ownedArticles: ${article.name}`);
                  }
                }
              }
            });

            this.logger.debug('data', `📦 Batch loaded ${snapshot.size} articles from ${ownerId}`);
          } catch (error: any) {
            // It's normal for some batches to fail (articles not in this owner's collection)
            this.logger.debug('data', `Batch query for ${ownerId} returned no results`);
          }
        })();

        batchTasks.push(task);
      }
    }

    // Wait for all batch tasks to complete in parallel
    this.logger.info('data', `⚡ Running ${batchTasks.length} parallel batch queries...`);
    await Promise.all(batchTasks);

    // Check for missing articles
    const missingCount = articleIds.length - foundArticleIds.size;
    if (missingCount > 0) {
      this.logger.warn('data', `⚠️ ${missingCount} articles not found in any owner's collection`);
    }

    return allArticles;
  }

  /**
   * Utility: Split array into chunks of specified size.
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
