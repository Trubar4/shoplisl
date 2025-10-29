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
});
