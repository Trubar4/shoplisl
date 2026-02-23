import { TestBed } from '@angular/core/testing';
import { DataService } from './data.service';
import { FirebaseDataService } from './firebase-data.service';
import { OfflineSyncService } from './offline-sync.service';
import { ArticlesRepositoryService } from './articles-repository.service';
import { ListsRepositoryService } from './lists-repository.service';
import { DataMigrationService } from './data-migration.service';
import { ConnectionService } from './connection.service';
import { OfflineCacheService } from './offline-cache.service';
import { LoggerService } from './logger.service';

describe('DataService', () => {
  let service: DataService;
  let firebaseDataSpy: any;
  let offlineSyncSpy: any;
  let articlesRepoSpy: any;
  let listsRepoSpy: any;
  let migrationSpy: any;
  let connectionServiceSpy: any;
  let cacheServiceSpy: any;
  let loggerSpy: any;
  let authServiceSpy: any;
  let analyticsServiceSpy: any;

  beforeEach(() => {
    // Create mock objects for all dependencies
    firebaseDataSpy = {
      getArticles: vi.fn(),
      getLists: vi.fn(),
      createArticle: vi.fn(),
      updateArticle: vi.fn(),
      deleteArticle: vi.fn(),
      createList: vi.fn(),
      updateList: vi.fn(),
      deleteList: vi.fn()
    };

    offlineSyncSpy = {
      syncPendingChanges: vi.fn(),
      queueChange: vi.fn()
    };

    articlesRepoSpy = {
      getArticles: vi.fn(),
      createArticle: vi.fn(),
      updateArticle: vi.fn(),
      deleteArticle: vi.fn()
    };

    listsRepoSpy = {
      getLists: vi.fn(),
      createList: vi.fn(),
      updateList: vi.fn(),
      deleteList: vi.fn()
    };

    migrationSpy = {
      handleDataMigration: vi.fn().mockResolvedValue(undefined)
    };

    connectionServiceSpy = {
      isOnline$: { subscribe: vi.fn() },
      isOnline: vi.fn().mockReturnValue(true)
    };

    cacheServiceSpy = {
      getCachedArticles: vi.fn(),
      getCachedLists: vi.fn(),
      cacheArticles: vi.fn(),
      cacheLists: vi.fn()
    };

    loggerSpy = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    authServiceSpy = {
      getCurrentUserId: vi.fn().mockReturnValue('test-user-id')
    };

    analyticsServiceSpy = {
      trackEvent: vi.fn()
    };

    // Manually create the service with mocks to bypass Angular DI issues in Vitest
    service = new DataService(
      firebaseDataSpy as any,
      offlineSyncSpy as any,
      articlesRepoSpy as any,
      listsRepoSpy as any,
      migrationSpy as any,
      connectionServiceSpy as any,
      cacheServiceSpy as any,
      loggerSpy as any,
      authServiceSpy as any,
      analyticsServiceSpy as any
    );
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Batch Operations', () => {
    beforeEach(() => {
      // Add batch operation methods to the listsRepoSpy
      listsRepoSpy.addMultipleArticlesToList = vi.fn();
      listsRepoSpy.markMultipleArticlesAsChecked = vi.fn();
      listsRepoSpy.removeMultipleArticlesFromList = vi.fn();
      listsRepoSpy.getList = vi.fn();

      // Recreate service with updated spy
      service = new DataService(
        firebaseDataSpy as any,
        offlineSyncSpy as any,
        articlesRepoSpy as any,
        listsRepoSpy as any,
        migrationSpy as any,
        connectionServiceSpy as any,
        cacheServiceSpy as any,
        loggerSpy as any,
        authServiceSpy as any,
        analyticsServiceSpy as any
      );
    });

    describe('moveArticlesBetweenLists', () => {
      it('should use batch operations to add and check articles', async () => {
        const articleIds = ['article1', 'article2', 'article3'];
        const sourceListId = 'source-list';
        const targetListId = 'target-list';

        // Mock successful batch operations
        listsRepoSpy.addMultipleArticlesToList.mockReturnValue(of(true));
        listsRepoSpy.markMultipleArticlesAsChecked.mockReturnValue(of(true));

        const result = await firstValueFrom(service.moveArticlesBetweenLists(articleIds, sourceListId, targetListId));

        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);

        // Verify batch add was called ONCE with all articles
        expect(listsRepoSpy.addMultipleArticlesToList).toHaveBeenCalledTimes(1);
        expect(listsRepoSpy.addMultipleArticlesToList).toHaveBeenCalledWith(targetListId, articleIds, 'manual');

        // Verify batch check was called ONCE with all articles
        expect(listsRepoSpy.markMultipleArticlesAsChecked).toHaveBeenCalledTimes(1);
        expect(listsRepoSpy.markMultipleArticlesAsChecked).toHaveBeenCalledWith(sourceListId, articleIds);
      });

      it('should handle empty article array', async () => {
        const result = await firstValueFrom(service.moveArticlesBetweenLists([], 'source', 'target'));

        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);

        // Should not call repository methods
        expect(listsRepoSpy.addMultipleArticlesToList).not.toHaveBeenCalled();
        expect(listsRepoSpy.markMultipleArticlesAsChecked).not.toHaveBeenCalled();
      });

      it('should handle errors during add operation', async () => {
        const articleIds = ['article1', 'article2'];
        listsRepoSpy.addMultipleArticlesToList.mockReturnValue(throwError(() => new Error('Add failed')));
        listsRepoSpy.markMultipleArticlesAsChecked.mockReturnValue(of(true));

        const result = await firstValueFrom(service.moveArticlesBetweenLists(articleIds, 'source', 'target'));

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('Failed to add articles');
      });

      it('should handle errors during check operation', async () => {
        const articleIds = ['article1', 'article2'];
        listsRepoSpy.addMultipleArticlesToList.mockReturnValue(of(true));
        listsRepoSpy.markMultipleArticlesAsChecked.mockReturnValue(throwError(() => new Error('Check failed')));

        const result = await firstValueFrom(service.moveArticlesBetweenLists(articleIds, 'source', 'target'));

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('Failed to mark articles');
      });

      it('should process operations sequentially (add then check)', async () => {
        const articleIds = ['article1', 'article2'];
        const callOrder: string[] = [];

        listsRepoSpy.addMultipleArticlesToList.mockImplementation(() => {
          callOrder.push('add');
          return of(true);
        });

        listsRepoSpy.markMultipleArticlesAsChecked.mockImplementation(() => {
          callOrder.push('check');
          return of(true);
        });

        await firstValueFrom(service.moveArticlesBetweenLists(articleIds, 'source', 'target'));

        // Verify operations happened in correct order
        expect(callOrder).toEqual(['add', 'check']);
      });
    });

    describe('markMultipleArticlesAsDone', () => {
      it('should use batch operation to mark articles as checked', async () => {
        const articleIds = ['article1', 'article2', 'article3'];
        const listId = 'test-list';

        listsRepoSpy.markMultipleArticlesAsChecked.mockReturnValue(of(true));

        const result = await firstValueFrom(service.markMultipleArticlesAsDone(listId, articleIds));

        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);

        // Verify batch operation was called ONCE
        expect(listsRepoSpy.markMultipleArticlesAsChecked).toHaveBeenCalledTimes(1);
        expect(listsRepoSpy.markMultipleArticlesAsChecked).toHaveBeenCalledWith(listId, articleIds);
      });

      it('should handle empty article array', async () => {
        const result = await firstValueFrom(service.markMultipleArticlesAsDone('list1', []));

        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);
        expect(listsRepoSpy.markMultipleArticlesAsChecked).not.toHaveBeenCalled();
      });

      it('should handle errors gracefully', async () => {
        listsRepoSpy.markMultipleArticlesAsChecked.mockReturnValue(
          throwError(() => new Error('Mark failed'))
        );

        const result = await firstValueFrom(service.markMultipleArticlesAsDone('list1', ['article1']));

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('Failed to mark articles');
      });
    });

    describe('removeMultipleArticlesFromList', () => {
      it('should use batch operation to remove articles', async () => {
        const articleIds = ['article1', 'article2', 'article3'];
        const listId = 'test-list';

        listsRepoSpy.removeMultipleArticlesFromList.mockReturnValue(of(true));

        const result = await firstValueFrom(service.removeMultipleArticlesFromList(listId, articleIds));

        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);

        // Verify batch operation was called ONCE
        expect(listsRepoSpy.removeMultipleArticlesFromList).toHaveBeenCalledTimes(1);
        expect(listsRepoSpy.removeMultipleArticlesFromList).toHaveBeenCalledWith(listId, articleIds);
      });

      it('should handle empty article array', async () => {
        const result = await firstValueFrom(service.removeMultipleArticlesFromList('list1', []));

        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);
        expect(listsRepoSpy.removeMultipleArticlesFromList).not.toHaveBeenCalled();
      });

      it('should handle errors gracefully', async () => {
        listsRepoSpy.removeMultipleArticlesFromList.mockReturnValue(
          throwError(() => new Error('Remove failed'))
        );

        const result = await firstValueFrom(service.removeMultipleArticlesFromList('list1', ['article1']));

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('Failed to remove articles');
      });
    });
  });
});

// Import additional dependencies needed for batch operation tests
import { of, throwError, firstValueFrom } from 'rxjs';
