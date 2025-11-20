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

    // Manually create the service with mocks to bypass Angular DI issues in Vitest
    service = new DataService(
      firebaseDataSpy as any,
      offlineSyncSpy as any,
      articlesRepoSpy as any,
      listsRepoSpy as any,
      migrationSpy as any,
      connectionServiceSpy as any,
      cacheServiceSpy as any,
      loggerSpy as any
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
        loggerSpy as any
      );
    });

    describe('moveArticlesBetweenLists', () => {
      it('should use batch operations to add and check articles', (done) => {
        const articleIds = ['article1', 'article2', 'article3'];
        const sourceListId = 'source-list';
        const targetListId = 'target-list';

        // Mock successful batch operations
        listsRepoSpy.addMultipleArticlesToList.mockReturnValue(of(true));
        listsRepoSpy.markMultipleArticlesAsChecked.mockReturnValue(of(true));

        service.moveArticlesBetweenLists(articleIds, sourceListId, targetListId).subscribe(result => {
          expect(result.success).toBe(true);
          expect(result.errors).toEqual([]);

          // Verify batch add was called ONCE with all articles
          expect(listsRepoSpy.addMultipleArticlesToList).toHaveBeenCalledTimes(1);
          expect(listsRepoSpy.addMultipleArticlesToList).toHaveBeenCalledWith(targetListId, articleIds);

          // Verify batch check was called ONCE with all articles
          expect(listsRepoSpy.markMultipleArticlesAsChecked).toHaveBeenCalledTimes(1);
          expect(listsRepoSpy.markMultipleArticlesAsChecked).toHaveBeenCalledWith(sourceListId, articleIds);

          done();
        });
      });

      it('should handle empty article array', (done) => {
        service.moveArticlesBetweenLists([], 'source', 'target').subscribe(result => {
          expect(result.success).toBe(true);
          expect(result.errors).toEqual([]);

          // Should not call repository methods
          expect(listsRepoSpy.addMultipleArticlesToList).not.toHaveBeenCalled();
          expect(listsRepoSpy.markMultipleArticlesAsChecked).not.toHaveBeenCalled();

          done();
        });
      });

      it('should handle errors during add operation', (done) => {
        const articleIds = ['article1', 'article2'];
        listsRepoSpy.addMultipleArticlesToList.mockReturnValue(throwError(() => new Error('Add failed')));

        service.moveArticlesBetweenLists(articleIds, 'source', 'target').subscribe(result => {
          expect(result.success).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors[0]).toContain('Failed to add articles');
          done();
        });
      });

      it('should handle errors during check operation', (done) => {
        const articleIds = ['article1', 'article2'];
        listsRepoSpy.addMultipleArticlesToList.mockReturnValue(of(true));
        listsRepoSpy.markMultipleArticlesAsChecked.mockReturnValue(throwError(() => new Error('Check failed')));

        service.moveArticlesBetweenLists(articleIds, 'source', 'target').subscribe(result => {
          expect(result.success).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors[0]).toContain('Failed to mark articles');
          done();
        });
      });

      it('should process operations sequentially (add then check)', (done) => {
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

        service.moveArticlesBetweenLists(articleIds, 'source', 'target').subscribe(() => {
          // Verify operations happened in correct order
          expect(callOrder).toEqual(['add', 'check']);
          done();
        });
      });
    });

    describe('markMultipleArticlesAsDone', () => {
      it('should use batch operation to mark articles as checked', (done) => {
        const articleIds = ['article1', 'article2', 'article3'];
        const listId = 'test-list';

        listsRepoSpy.markMultipleArticlesAsChecked.mockReturnValue(of(true));

        service.markMultipleArticlesAsDone(listId, articleIds).subscribe(result => {
          expect(result.success).toBe(true);
          expect(result.errors).toEqual([]);

          // Verify batch operation was called ONCE
          expect(listsRepoSpy.markMultipleArticlesAsChecked).toHaveBeenCalledTimes(1);
          expect(listsRepoSpy.markMultipleArticlesAsChecked).toHaveBeenCalledWith(listId, articleIds);

          done();
        });
      });

      it('should handle empty article array', (done) => {
        service.markMultipleArticlesAsDone('list1', []).subscribe(result => {
          expect(result.success).toBe(true);
          expect(result.errors).toEqual([]);
          expect(listsRepoSpy.markMultipleArticlesAsChecked).not.toHaveBeenCalled();
          done();
        });
      });

      it('should handle errors gracefully', (done) => {
        listsRepoSpy.markMultipleArticlesAsChecked.mockReturnValue(
          throwError(() => new Error('Mark failed'))
        );

        service.markMultipleArticlesAsDone('list1', ['article1']).subscribe(result => {
          expect(result.success).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors[0]).toContain('Failed to mark articles');
          done();
        });
      });
    });

    describe('removeMultipleArticlesFromList', () => {
      it('should use batch operation to remove articles', (done) => {
        const articleIds = ['article1', 'article2', 'article3'];
        const listId = 'test-list';

        listsRepoSpy.removeMultipleArticlesFromList.mockReturnValue(of(true));

        service.removeMultipleArticlesFromList(listId, articleIds).subscribe(result => {
          expect(result.success).toBe(true);
          expect(result.errors).toEqual([]);

          // Verify batch operation was called ONCE
          expect(listsRepoSpy.removeMultipleArticlesFromList).toHaveBeenCalledTimes(1);
          expect(listsRepoSpy.removeMultipleArticlesFromList).toHaveBeenCalledWith(listId, articleIds);

          done();
        });
      });

      it('should handle empty article array', (done) => {
        service.removeMultipleArticlesFromList('list1', []).subscribe(result => {
          expect(result.success).toBe(true);
          expect(result.errors).toEqual([]);
          expect(listsRepoSpy.removeMultipleArticlesFromList).not.toHaveBeenCalled();
          done();
        });
      });

      it('should handle errors gracefully', (done) => {
        listsRepoSpy.removeMultipleArticlesFromList.mockReturnValue(
          throwError(() => new Error('Remove failed'))
        );

        service.removeMultipleArticlesFromList('list1', ['article1']).subscribe(result => {
          expect(result.success).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors[0]).toContain('Failed to remove articles');
          done();
        });
      });
    });
  });
});

// Import additional dependencies needed for batch operation tests
import { of, throwError } from 'rxjs';
