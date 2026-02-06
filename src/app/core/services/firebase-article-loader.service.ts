// src/app/core/services/firebase-article-loader.service.ts
import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  query,
  where,
  documentId
} from '@angular/fire/firestore';

import { Article, ShoppingList } from '../models';
import { LoggerService } from './logger.service';
import { QuotaMonitorService } from './quota-monitor.service';

/**
 * FirebaseArticleLoaderService - Handles article loading from Firestore
 *
 * Extracted from FirebaseDataService (Phase 1 refactoring) to:
 * - Reduce firebase-data.service.ts from 2885 to ~2000 lines
 * - Isolate complex batch loading logic
 * - Provide reusable article loading utilities
 *
 * Key responsibilities:
 * - Batch load articles using IN queries (Firestore limit: 30 per query)
 * - Load articles for specific lists (lazy loading)
 * - Track loaded/failed article IDs to avoid redundant queries
 * - Cache article owner mapping for quota optimization
 */
@Injectable({
  providedIn: 'root'
})
export class FirebaseArticleLoaderService {

  // Cache loaded article IDs to prevent redundant queries
  private loadedSharedArticleIds = new Set<string>();

  // Track article IDs that failed to load (don't retry)
  private failedArticleIds = new Set<string>();

  // Cache article owner mapping to prevent redundant queries
  private articleOwnerCache = new Map<string, string>();

  constructor(
    private firestore: Firestore,
    private logger: LoggerService,
    private quotaMonitor: QuotaMonitorService
  ) {}

  /**
   * Batch load articles using Firestore IN queries
   * This is 10-20x faster than sequential loading
   *
   * Strategy:
   * 1. For each owner, batch articles into groups of 30 (Firestore IN query limit)
   * 2. Run all batches in parallel
   * 3. Track which articles were found for caching
   *
   * @param articleIds - IDs of articles to load
   * @param ownerIds - User IDs whose collections to search
   * @param currentUserId - Current user ID (for ownership checks)
   * @param ownedArticles - Reference to owned articles array (for optimistic updates)
   * @returns Promise<Article[]> - Loaded articles
   */
  async batchLoadArticles(
    articleIds: string[],
    ownerIds: string[],
    currentUserId: string | null,
    ownedArticles: Article[] = []
  ): Promise<Article[]> {
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

                // Check if already loaded
                const alreadyInOwned = ownedArticles.find(a => a.id === doc.id);
                const alreadyInResults = allArticles.find(a => a.id === doc.id);

                if (!alreadyInOwned && !alreadyInResults) {
                  allArticles.push(article);
                  foundArticleIds.add(doc.id);
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
   * Load articles by IDs from a specific user's collection
   *
   * @param articleIds - IDs of articles to load
   * @param userId - User ID whose collection to query
   * @returns Promise<Article[]> - Loaded articles
   */
  async loadArticlesByIds(articleIds: string[], userId: string): Promise<Article[]> {
    if (articleIds.length === 0) {
      this.logger.debug('data', 'No article IDs to load');
      return [];
    }

    const BATCH_SIZE = 30;
    const chunks = this.chunkArray(articleIds, BATCH_SIZE);
    const articles: Article[] = [];

    this.logger.info('data', `📦 Loading ${articleIds.length} articles in ${chunks.length} batch(es)`);

    // Load all chunks in parallel
    const chunkPromises = chunks.map(async (chunk) => {
      const articlesRef = collection(this.firestore, `users-v2/${userId}/articles`);
      const batchQuery = query(
        articlesRef,
        where(documentId(), 'in', chunk)
      );

      const snapshot = await getDocs(batchQuery);
      this.quotaMonitor.trackRead('Load Articles By IDs', snapshot.size, { userId, chunkSize: chunk.length });

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

    this.logger.info('data', `✅ Loaded ${articles.length} articles from Firestore`);
    return articles;
  }

  /**
   * Filter article IDs to only include those not yet loaded
   *
   * @param articleIds - All article IDs
   * @returns string[] - IDs of articles that need loading
   */
  filterUnloadedArticleIds(articleIds: string[]): string[] {
    return articleIds.filter(
      id => !this.loadedSharedArticleIds.has(id) && !this.failedArticleIds.has(id)
    );
  }

  /**
   * Mark articles as loaded (for caching)
   */
  markArticlesAsLoaded(articles: Article[]): void {
    articles.forEach(article => {
      this.loadedSharedArticleIds.add(article.id);
      if (article.ownerId) {
        this.articleOwnerCache.set(article.id, article.ownerId);
      }
    });
  }

  /**
   * Mark article IDs as failed (won't retry)
   */
  markArticlesAsFailed(articleIds: string[]): void {
    articleIds.forEach(id => this.failedArticleIds.add(id));
  }

  /**
   * Get cached owner for an article
   */
  getCachedOwner(articleId: string): string | undefined {
    return this.articleOwnerCache.get(articleId);
  }

  /**
   * Check if an article is already loaded
   */
  isArticleLoaded(articleId: string): boolean {
    return this.loadedSharedArticleIds.has(articleId);
  }

  /**
   * Clear loaded status for a specific article ID
   * Used when we need to reload an article (e.g., stale cache detected)
   */
  clearLoadedStatus(articleId: string): void {
    this.loadedSharedArticleIds.delete(articleId);
    this.failedArticleIds.delete(articleId);
  }

  /**
   * Clear caches (call on logout/user switch)
   */
  clearCaches(): void {
    this.loadedSharedArticleIds.clear();
    this.failedArticleIds.clear();
    this.articleOwnerCache.clear();
  }

  /**
   * Remove articles from cache if they're no longer needed
   */
  removeFromCache(articleIds: string[]): void {
    articleIds.forEach(id => {
      this.loadedSharedArticleIds.delete(id);
      this.failedArticleIds.delete(id);
      this.articleOwnerCache.delete(id);
    });
  }

  /**
   * Build owner list for batch loading from shared lists
   * Prioritizes list owners (most likely to have articles) over collaborators
   *
   * @param lists - Lists to process
   * @param articleIds - Article IDs to load (for cache lookup)
   * @returns { priorityOwners: Set<string>, fallbackOwners: Set<string> }
   */
  buildOwnerListFromSharedLists(
    lists: ShoppingList[],
    articleIds: string[]
  ): { priorityOwners: Set<string>; fallbackOwners: Set<string> } {
    const priorityOwners = new Set<string>();
    const fallbackOwners = new Set<string>();

    // First priority: List owners (articles are usually in the list owner's collection)
    lists.forEach(list => {
      if (list.ownerId) {
        priorityOwners.add(list.ownerId);
      }
    });

    // Second priority: Owners from cache (we know they have articles)
    articleIds.forEach(articleId => {
      const cachedOwner = this.articleOwnerCache.get(articleId);
      if (cachedOwner) {
        priorityOwners.add(cachedOwner);
      }
    });

    // Fallback: Collaborators (only if needed)
    lists.forEach(list => {
      if (list.sharedWith) {
        list.sharedWith.forEach(userId => fallbackOwners.add(userId));
      }
    });

    return { priorityOwners, fallbackOwners };
  }

  /**
   * Utility: Split array into chunks of specified size
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
