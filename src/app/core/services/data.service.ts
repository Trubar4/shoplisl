import { Injectable } from '@angular/core';
import { Observable, from, of, forkJoin } from 'rxjs';  // Add 'of' and 'forkJoin' here
import { map, catchError, mergeMap } from 'rxjs/operators';  // Add 'map' here
import { BehaviorSubject } from 'rxjs';

import { Article, ShoppingList } from '../models';
import { FirebaseDataService } from './firebase-data.service';
import { OfflineSyncService } from './offline-sync.service';
import { ArticlesRepositoryService } from './articles-repository.service';
import { ListsRepositoryService } from './lists-repository.service';
import { DataMigrationService } from './data-migration.service';
import { ConnectionService } from './connection.service';
import { OfflineCacheService } from './offline-cache.service';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private articlesLoadingSubject = new BehaviorSubject<boolean>(false);
  private listsLoadingSubject = new BehaviorSubject<boolean>(false);

  constructor(
    private firebaseData: FirebaseDataService,
    private offlineSync: OfflineSyncService,
    private articlesRepo: ArticlesRepositoryService,
    private listsRepo: ListsRepositoryService,
    private migration: DataMigrationService,
    private connectionService: ConnectionService,
    private cacheService: OfflineCacheService,
    private logger: LoggerService
  ) {
    this.logger.info('data', 'DataService facade initialized');
    
    // Add to window for debugging
    if (typeof window !== 'undefined') {
      (window as any).dataService = this;
    }

    // Initialize migrations when service starts
    this.initializeMigrations();
  }

  private async initializeMigrations(): Promise<void> {
    try {
      // Run migrations after a short delay to allow Firebase to initialize
      setTimeout(async () => {
        await this.migration.handleDataMigration();
      }, 2000);
    } catch (error) {
      this.logger.error('data', 'Error during initialization migrations', error);
    }
  }

  // === ARTICLES API ===

  getArticles(): Observable<Article[]> {
    return this.firebaseData.getArticles();
  }

  getArticlesLoading(): Observable<boolean> {
    return this.articlesLoadingSubject.asObservable();
  }

  getArticle(id: string): Observable<Article | undefined> {
    return this.firebaseData.getArticle(id);
  }

  createArticle(article: Omit<Article, 'id' | 'createdAt' | 'updatedAt'>): Observable<Article> {
    return this.articlesRepo.createArticle(article);
  }

  updateArticle(id: string, updates: Partial<Article>): Observable<Article | undefined> {
    return this.articlesRepo.updateArticle(id, updates);
  }

  deleteArticle(id: string): Observable<boolean> {
    return this.articlesRepo.deleteArticle(id);
  }

  checkArticleNameExists(name: string, excludeId?: string): Observable<boolean> {
    return this.articlesRepo.checkArticleNameExists(name, excludeId);
  }

  createArticleWithDuplicateCheck(article: Omit<Article, 'id' | 'createdAt' | 'updatedAt'>): Observable<{
    success: boolean;
    article?: Article;
    isDuplicate?: boolean;
    error?: string;
  }> {
    return this.articlesRepo.createArticleWithDuplicateCheck(article);
  }

  updateArticleWithDuplicateCheck(
    id: string, 
    updates: Partial<Article>
  ): Observable<{
    success: boolean;
    article?: Article;
    isDuplicate?: boolean;
    error?: string;
  }> {
    return this.articlesRepo.updateArticleWithDuplicateCheck(id, updates);
  }

  deleteArticleAndCleanupLists(articleId: string): Observable<{
    success: boolean;
    activeInLists?: string[];
    error?: string;
  }> {
    return this.articlesRepo.deleteArticleAndCleanupLists(articleId);
  }

  getListsContainingArticle(articleId: string): Observable<ShoppingList[]> {
    return this.articlesRepo.getListsContainingArticle(articleId);
  }

  getListsWithActiveArticle(articleId: string): Observable<ShoppingList[]> {
    return this.articlesRepo.getListsWithActiveArticle(articleId);
  }

  // === LISTS API ===

  getLists(): Observable<ShoppingList[]> {
    return this.firebaseData.getLists();
  }

  getListsLoading(): Observable<boolean> {
    return this.listsLoadingSubject.asObservable();
  }

  getList(id: string): Observable<ShoppingList | undefined> {
    return this.firebaseData.getList(id);
  }

  createList(list: Omit<ShoppingList, 'id' | 'createdAt' | 'updatedAt'>): Observable<ShoppingList> {
    return this.listsRepo.createList(list);
  }

  updateList(id: string, updates: Partial<ShoppingList>): Observable<ShoppingList | undefined> {
    return this.listsRepo.updateList(id, updates);
  }

  deleteList(id: string): Observable<boolean> {
    return this.listsRepo.deleteList(id);
  }

  // === LIST ITEM OPERATIONS ===

  toggleItemChecked(listId: string, articleId: string): Observable<boolean> {
    return this.listsRepo.toggleItemChecked(listId, articleId);
  }

  addArticleToList(listId: string, articleId: string): Observable<boolean> {
    return this.listsRepo.addArticleToList(listId, articleId);
  }

  addMultipleArticlesToList(listId: string, articleIds: string[]): Observable<boolean> {
    return this.listsRepo.addMultipleArticlesToList(listId, articleIds);
  }

  removeArticleFromList(listId: string, articleId: string): Observable<boolean> {
    return this.listsRepo.removeArticleFromList(listId, articleId);
  }

  updateListItemAmount(listId: string, articleId: string, amount: string): Observable<boolean> {
    return this.listsRepo.updateListItemAmount(listId, articleId, amount);
  }

  clearAllItemsFromList(listId: string): Observable<boolean> {
    return this.listsRepo.clearAllItemsFromList(listId);
  }

  // === BATCH LIST ITEM OPERATIONS ===

  /**
   * Moves articles between lists (copies to target list and marks as checked in source list)
   * @param articleIds - Array of article IDs to move
   * @param sourceListId - Source list ID
   * @param targetListId - Target list ID
   * @returns Observable that completes when all operations are done
   */
  moveArticlesBetweenLists(
    articleIds: string[],
    sourceListId: string,
    targetListId: string
  ): Observable<{ success: boolean; errors: string[] }> {
    if (articleIds.length === 0) {
      return of({ success: true, errors: [] });
    }

    const errors: string[] = [];

    // Phase 1: Add all articles to target list in a single batch operation
    // This avoids race conditions from parallel individual adds
    return this.addMultipleArticlesToList(targetListId, articleIds).pipe(
      catchError(err => {
        errors.push(`Failed to add articles to target list: ${err}`);
        return of(false);
      }),
      mergeMap(() => {
        // Phase 2: Mark all articles as checked in source list
        // Get current list state once for all articles
        return this.getList(sourceListId).pipe(
          mergeMap(list => {
            if (!list) {
              errors.push(`Source list ${sourceListId} not found`);
              return of({ success: false, errors });
            }

            // Create operations to check articles that aren't already checked
            const checkOperations = articleIds
              .filter(articleId => !list.itemStates[articleId]?.isChecked)
              .map(articleId =>
                this.toggleItemChecked(sourceListId, articleId).pipe(
                  catchError(err => {
                    errors.push(`Failed to check article ${articleId} in source list: ${err}`);
                    return of(false);
                  })
                )
              );

            if (checkOperations.length === 0) {
              return of({ success: errors.length === 0, errors });
            }

            return forkJoin(checkOperations).pipe(
              map(() => ({ success: errors.length === 0, errors }))
            );
          })
        );
      })
    );
  }

  /**
   * Removes multiple articles from a list
   * @param listId - List ID
   * @param articleIds - Array of article IDs to remove
   * @returns Observable with success status and any errors
   */
  removeMultipleArticlesFromList(
    listId: string,
    articleIds: string[]
  ): Observable<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    const operations = articleIds.map(articleId =>
      this.removeArticleFromList(listId, articleId).pipe(
        catchError(err => {
          errors.push(`Failed to remove article ${articleId}: ${err}`);
          return of(false);
        })
      )
    );

    if (operations.length === 0) {
      return of({ success: true, errors: [] });
    }

    return forkJoin(operations).pipe(
      map(() => ({ success: errors.length === 0, errors }))
    );
  }

  /**
   * Marks multiple articles as done (checked)
   * @param listId - List ID
   * @param articleIds - Array of article IDs to check
   * @returns Observable with success status and any errors
   */
  markMultipleArticlesAsDone(
    listId: string,
    articleIds: string[]
  ): Observable<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Get current list state to check which articles are already checked
    return this.getList(listId).pipe(
      mergeMap(list => {
        if (!list) {
          return of({ success: false, errors: ['List not found'] });
        }

        // Only toggle articles that aren't already checked
        const operations = articleIds
          .filter(articleId => !list.itemStates[articleId]?.isChecked)
          .map(articleId =>
            this.toggleItemChecked(listId, articleId).pipe(
              catchError(err => {
                errors.push(`Failed to check article ${articleId}: ${err}`);
                return of(false);
              })
            )
          );

        if (operations.length === 0) {
          return of({ success: true, errors: [] });
        }

        return forkJoin(operations).pipe(
          map(() => ({ success: errors.length === 0, errors }))
        );
      })
    );
  }

  // === DEPARTMENT ORDER ===

  updateListDepartmentOrder(listId: string, departmentOrder: string[]): Observable<boolean> {
    return this.listsRepo.updateListDepartmentOrder(listId, departmentOrder);
  }

  getListDepartmentOrder(listId: string): Observable<string[]> {
    return this.listsRepo.getListDepartmentOrder(listId);
  }

  // === MIGRATION METHODS ===

  async migrateDepartmentOrderToExistingLists(): Promise<void> {
    return this.migration.migrateDepartmentOrderToExistingLists();
  }

  async checkIfDepartmentOrderMigrationNeeded(): Promise<boolean> {
    return this.migration.checkIfDepartmentOrderMigrationNeeded();
  }

  forceRefreshLists(): Observable<ShoppingList[]> {
    return this.listsRepo.forceRefreshLists();
  }

  // === UTILITY METHODS ===

  getSharedUserId(): string {
    return this.firebaseData.getSharedUserId();
  }

  async refreshData(): Promise<void> {
    await this.firebaseData.refreshData();
  }

  async loadDataEmergency(): Promise<void> {
    await this.firebaseData.loadDataEmergency();
  }

  getStatus(): {
    isOnline: boolean;
    queuedOperations: number;
    cacheStatus: any;
    isFirestoreReady: boolean;
  } {
    return {
      isOnline: this.connectionService.isOnline(),
      queuedOperations: this.offlineSync.getQueuedOperationsCount(),
      cacheStatus: this.cacheService.getCacheStatus(),
      isFirestoreReady: this.firebaseData.isFirestoreReady()
    };
  }

  // === SYNC OPERATIONS ===

  async processQueuedOperations(): Promise<void> {
    await this.offlineSync.processQueuedOperations();
  }

  getQueueStatus(): {
    queueLength: number;
    isProcessing: boolean;
    operations: Array<{
      id: string;
      description: string;
      timestamp: number;
      retryCount: number;
    }>;
  } {
    return this.offlineSync.getQueueStatus();
  }

  async forceProcessQueue(): Promise<void> {
    await this.offlineSync.forceProcessQueue();
  }

  clearQueue(): void {
    this.offlineSync.clearQueue();
  }

  // === MIGRATION & MAINTENANCE ===

  async performFullDataIntegrityCheck(): Promise<{
    articlesCount: number;
    listsCount: number;
    orphanedReferencesFound: boolean;
    departmentOrderMigrationNeeded: boolean;
    issues: string[];
  }> {
    return this.migration.performFullDataIntegrityCheck();
  }

  async performFullMigrationAndCleanup(): Promise<void> {
    await this.migration.performFullMigrationAndCleanup();
  }

  // === DEBUGGING METHODS ===

  async runDiagnostics(): Promise<{
    status: any;
    queueStatus: any;
    integrityCheck: any;
  }> {
    try {
      const status = this.getStatus();
      const queueStatus = this.getQueueStatus();
      const integrityCheck = await this.performFullDataIntegrityCheck();

      this.logger.info('data', 'Diagnostics completed', {
        status,
        queueStatus,
        integrityCheck
      });

      return {
        status,
        queueStatus,
        integrityCheck
      };
    } catch (error) {
      this.logger.error('data', 'Error running diagnostics', error);
      throw error;
    }
  }

  enableDebugLogging(): void {
    this.logger.enableAllTopics();
    this.logger.setLevel('debug');
    this.logger.info('data', 'Debug logging enabled');
  }

  disableDebugLogging(): void {
    this.logger.setLevel('warn');
    this.logger.disableAllTopics();
    this.logger.enableTopic('data');
    this.logger.info('data', 'Debug logging disabled');
  }

  /**
   * Filter article IDs to only include existing articles
   */
  getValidArticleIds(articleIds: string[]): Observable<string[]> {
    if (!articleIds || articleIds.length === 0) {
      return of([]);
    }

    return this.getArticles().pipe(
      map(articles => {
        const validIds = new Set(articles.map(a => a.id));
        return articleIds.filter(id => validIds.has(id));
      })
    );
  }

  /**
   * Get active (non-checked) article count for a list, excluding orphaned references
   */
  getActiveArticleCount(list: ShoppingList): Observable<number> {
    if (!list || !list.articleIds || list.articleIds.length === 0) {
      return of(0);
    }

    return this.getValidArticleIds(list.articleIds).pipe(
      map(validIds => {
        return validIds.filter(articleId => {
          const itemState = list.itemStates?.[articleId];
          return !itemState?.isChecked;
        }).length;
      })
    );
  }

}