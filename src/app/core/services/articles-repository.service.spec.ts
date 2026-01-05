/**
 * Unit Tests for ArticlesRepositoryService - Phase 1 Offline Fixes
 *
 * These tests validate:
 * - OFFLINE FIX #1: Synchronous article creation (line 101-104)
 * - OFFLINE FIX #2: Temp ID replacement after sync (line 109-141)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, firstValueFrom } from 'rxjs';
import { ArticlesRepositoryService } from './articles-repository.service';
import { FirebaseDataService } from './firebase-data.service';
import { OfflineSyncService } from './offline-sync.service';
import { ConnectionService } from './connection.service';
import { LoggerService } from './logger.service';
import { DataMigrationService } from './data-migration.service';
import { AuthService } from './auth.service';
import { Article } from '../models';

describe('ArticlesRepositoryService - Phase 1 Offline Fixes', () => {
  let service: ArticlesRepositoryService;
  let firebaseDataSpy: any;
  let offlineSyncSpy: any;
  let connectionServiceSpy: any;
  let loggerSpy: any;
  let dataMigrationSpy: any;
  let authServiceSpy: any;

  const mockUserId = 'test-user-123';
  const mockArticles: Article[] = [];
  const mockLists: any[] = [];

  beforeEach(() => {
    // Reset mock data
    mockArticles.length = 0;
    mockLists.length = 0;

    firebaseDataSpy = {
      getCurrentArticles: vi.fn(() => [...mockArticles]),
      updateLocalArticles: vi.fn((articles: Article[]) => {
        mockArticles.length = 0;
        mockArticles.push(...articles);
      }),
      getCurrentLists: vi.fn(() => [...mockLists]),
      updateLocalLists: vi.fn((lists: any[]) => {
        mockLists.length = 0;
        mockLists.push(...lists);
      }),
      createArticleInFirebase: vi.fn().mockResolvedValue('firebase-id-123'),
      updateArticleInFirebase: vi.fn().mockResolvedValue(undefined),
    };

    offlineSyncSpy = {
      queueOperation: vi.fn((callback: () => Promise<void>, description: string) => {
        // Store callback for manual execution in tests
        offlineSyncSpy._lastQueuedCallback = callback;
        offlineSyncSpy._lastDescription = description;
      }),
      _lastQueuedCallback: null as (() => Promise<void>) | null,
      _lastDescription: null as string | null,
    };

    connectionServiceSpy = {
      isOnline: vi.fn().mockReturnValue(true),
    };

    loggerSpy = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    dataMigrationSpy = {};

    authServiceSpy = {
      getCurrentUserId: vi.fn().mockReturnValue(mockUserId),
    };

    service = new ArticlesRepositoryService(
      firebaseDataSpy as any,
      offlineSyncSpy as any,
      connectionServiceSpy as any,
      loggerSpy as any,
      dataMigrationSpy as any,
      authServiceSpy as any
    );
  });

  /**
   * TEST GROUP 1: OFFLINE FIX #1 - Synchronous Article Creation
   * Validates: articles-repository.service.ts:101-104
   */
  describe('OFFLINE FIX #1: Synchronous Article Creation', () => {
    it('should update local state immediately when creating article offline', async () => {
      // Arrange: Set offline mode
      connectionServiceSpy.isOnline.mockReturnValue(false);

      const articleData = {
        name: 'Offline Article',
        amount: '2',
        notes: 'Test notes',
        icon: '<N',
      };

      // Act: Create article
      const result = await firstValueFrom(service.createArticle(articleData));

      // Assert: Article created with temp ID
      expect(result.id).toMatch(/^temp_/);
      expect(result.name).toBe('Offline Article');
      expect(result.ownerId).toBe(mockUserId);

      // Assert: updateLocalArticles called immediately (synchronous)
      expect(firebaseDataSpy.updateLocalArticles).toHaveBeenCalledTimes(1);

      // Assert: Article is in local state
      const localArticles = firebaseDataSpy.getCurrentArticles();
      expect(localArticles).toHaveLength(1);
      expect(localArticles[0].id).toBe(result.id);
      expect(localArticles[0].name).toBe('Offline Article');
    });

    it('should NOT call subscribe/unsubscribe pattern (broken pattern)', async () => {
      // Arrange
      connectionServiceSpy.isOnline.mockReturnValue(false);

      // Act
      await firstValueFrom(service.createArticle({ name: 'Test' }));

      // Assert: getCurrentArticles called (synchronous), NOT subscribe
      expect(firebaseDataSpy.getCurrentArticles).toHaveBeenCalled();

      // This validates we're NOT using the broken pattern:
      // getArticles().subscribe().unsubscribe()
      // Instead we use: getCurrentArticles()
    });

    it('should queue sync operation for later execution', async () => {
      // Arrange
      connectionServiceSpy.isOnline.mockReturnValue(false);

      // Act
      await firstValueFrom(service.createArticle({ name: 'Queued Article' }));

      // Assert: Operation queued
      expect(offlineSyncSpy.queueOperation).toHaveBeenCalledTimes(1);
      expect(offlineSyncSpy._lastDescription).toContain('Create article');
    });
  });

  /**
   * TEST GROUP 2: OFFLINE FIX #2 - Temp ID Replacement
   * Validates: articles-repository.service.ts:109-141
   */
  describe('OFFLINE FIX #2: Temp ID Replacement After Sync', () => {
    it('should replace temp ID with real ID in articles after sync', async () => {
      // Arrange: Create offline article
      connectionServiceSpy.isOnline.mockReturnValue(false);
      const article = await firstValueFrom(service.createArticle({ name: 'Sync Test' }));
      const tempId = article.id;

      expect(tempId).toMatch(/^temp_/);

      // Mock Firebase to return real ID
      firebaseDataSpy.createArticleInFirebase.mockResolvedValue('real-id-456');

      // Act: Execute queued sync operation
      const syncCallback = offlineSyncSpy._lastQueuedCallback;
      expect(syncCallback).toBeTruthy();
      await syncCallback!();

      // Assert: Temp ID replaced with real ID in articles
      const updatedArticles = firebaseDataSpy.getCurrentArticles();
      expect(updatedArticles).toHaveLength(1);
      expect(updatedArticles[0].id).toBe('real-id-456');
      expect(updatedArticles[0].name).toBe('Sync Test');

      // Assert: No temp ID remains
      const hasTempId = updatedArticles.some(a => a.id === tempId);
      expect(hasTempId).toBe(false);
    });

    it('should replace temp ID in list articleIds after sync', async () => {
      // Arrange: Create offline article
      connectionServiceSpy.isOnline.mockReturnValue(false);
      const article = await firstValueFrom(service.createArticle({ name: 'List Test' }));
      const tempId = article.id;

      // Add article to a list (simulating addArticleToList)
      const mockList = {
        id: 'list-1',
        name: 'Test List',
        articleIds: [tempId],
        itemStates: {
          [tempId]: {
            articleId: tempId,
            isChecked: false,
            amount: '1',
          },
        },
        ownerId: mockUserId,
        sharedWith: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockLists.push(mockList);

      // Mock Firebase to return real ID
      firebaseDataSpy.createArticleInFirebase.mockResolvedValue('real-id-789');

      // Act: Execute sync
      const syncCallback = offlineSyncSpy._lastQueuedCallback;
      await syncCallback!();

      // Assert: Temp ID replaced in list.articleIds
      const updatedLists = firebaseDataSpy.getCurrentLists();
      expect(updatedLists).toHaveLength(1);
      expect(updatedLists[0].articleIds).toContain('real-id-789');
      expect(updatedLists[0].articleIds).not.toContain(tempId);
    });

    it('should replace temp ID in list itemStates keys after sync', async () => {
      // Arrange
      connectionServiceSpy.isOnline.mockReturnValue(false);
      const article = await firstValueFrom(service.createArticle({ name: 'ItemState Test' }));
      const tempId = article.id;

      // Add to list with itemState
      const mockList = {
        id: 'list-2',
        name: 'Test List 2',
        articleIds: [tempId],
        itemStates: {
          [tempId]: {
            articleId: tempId,
            articleName: 'ItemState Test',
            isChecked: false,
            amount: '3',
            notes: 'Test notes',
          },
        },
        ownerId: mockUserId,
        sharedWith: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockLists.push(mockList);

      firebaseDataSpy.createArticleInFirebase.mockResolvedValue('real-id-999');

      // Act: Sync
      await offlineSyncSpy._lastQueuedCallback!();

      // Assert: Temp ID replaced in itemStates
      const updatedLists = firebaseDataSpy.getCurrentLists();
      const updatedList = updatedLists[0];

      expect(updatedList.itemStates['real-id-999']).toBeDefined();
      expect(updatedList.itemStates['real-id-999'].articleId).toBe('real-id-999');
      expect(updatedList.itemStates['real-id-999'].amount).toBe('3');

      // Assert: Old temp ID key removed
      expect(updatedList.itemStates[tempId]).toBeUndefined();
    });

    it('should handle multiple lists with same temp ID', async () => {
      // Arrange: Create offline article
      connectionServiceSpy.isOnline.mockReturnValue(false);
      const article = await firstValueFrom(service.createArticle({ name: 'Multi-List Test' }));
      const tempId = article.id;

      // Add article to multiple lists
      mockLists.push(
        {
          id: 'list-a',
          name: 'List A',
          articleIds: [tempId, 'other-article-1'],
          itemStates: { [tempId]: { articleId: tempId, isChecked: false, amount: '1' } },
          ownerId: mockUserId,
          sharedWith: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'list-b',
          name: 'List B',
          articleIds: ['other-article-2', tempId],
          itemStates: { [tempId]: { articleId: tempId, isChecked: true, amount: '2' } },
          ownerId: mockUserId,
          sharedWith: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      firebaseDataSpy.createArticleInFirebase.mockResolvedValue('real-id-abc');

      // Act: Sync
      await offlineSyncSpy._lastQueuedCallback!();

      // Assert: Both lists updated
      const updatedLists = firebaseDataSpy.getCurrentLists();
      expect(updatedLists).toHaveLength(2);

      // List A
      expect(updatedLists[0].articleIds).toContain('real-id-abc');
      expect(updatedLists[0].articleIds).not.toContain(tempId);
      expect(updatedLists[0].itemStates['real-id-abc']).toBeDefined();
      expect(updatedLists[0].itemStates[tempId]).toBeUndefined();

      // List B
      expect(updatedLists[1].articleIds).toContain('real-id-abc');
      expect(updatedLists[1].articleIds).not.toContain(tempId);
      expect(updatedLists[1].itemStates['real-id-abc']).toBeDefined();
      expect(updatedLists[1].itemStates[tempId]).toBeUndefined();
    });

    it('should preserve other itemState properties during replacement', async () => {
      // Arrange
      connectionServiceSpy.isOnline.mockReturnValue(false);
      const article = await firstValueFrom(service.createArticle({ name: 'Preserve Test' }));
      const tempId = article.id;

      const mockList = {
        id: 'list-preserve',
        name: 'Preserve List',
        articleIds: [tempId],
        itemStates: {
          [tempId]: {
            articleId: tempId,
            articleName: 'Preserve Test',
            isChecked: true,
            amount: '5',
            notes: 'Important notes',
            checkedAt: new Date(),
            checkedBy: 'user-123',
          },
        },
        ownerId: mockUserId,
        sharedWith: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockLists.push(mockList);

      firebaseDataSpy.createArticleInFirebase.mockResolvedValue('real-id-preserve');

      // Act: Sync
      await offlineSyncSpy._lastQueuedCallback!();

      // Assert: All properties preserved except articleId
      const updatedList = firebaseDataSpy.getCurrentLists()[0];
      const newItemState = updatedList.itemStates['real-id-preserve'];

      expect(newItemState.articleId).toBe('real-id-preserve');
      expect(newItemState.articleName).toBe('Preserve Test');
      expect(newItemState.isChecked).toBe(true);
      expect(newItemState.amount).toBe('5');
      expect(newItemState.notes).toBe('Important notes');
      expect(newItemState.checkedAt).toBeDefined();
      expect(newItemState.checkedBy).toBe('user-123');
    });
  });

  /**
   * TEST GROUP 3: Online Mode (No Temp ID)
   * Validates online mode doesn't use temp IDs
   */
  describe('Online Mode - No Temp IDs', () => {
    it('should NOT create temp ID when online', async () => {
      // Arrange: Online mode
      connectionServiceSpy.isOnline.mockReturnValue(true);

      // Act
      const result = await firstValueFrom(service.createArticle({ name: 'Online Article' }));

      // Assert: Real Firebase ID, not temp ID
      expect(result.id).not.toMatch(/^temp_/);
      expect(result.id).toBe('firebase-id-123'); // From mock

      // Assert: No queued operation
      expect(offlineSyncSpy.queueOperation).not.toHaveBeenCalled();
    });

    it('should call createArticleInFirebase directly when online', async () => {
      // Arrange
      connectionServiceSpy.isOnline.mockReturnValue(true);

      // Act
      await firstValueFrom(service.createArticle({ name: 'Direct Create' }));

      // Assert
      expect(firebaseDataSpy.createArticleInFirebase).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * TEST GROUP 4: Edge Cases
   */
  describe('Edge Cases', () => {
    it('should handle list without the temp article', async () => {
      // Arrange: Create offline article
      connectionServiceSpy.isOnline.mockReturnValue(false);
      const article = await firstValueFrom(service.createArticle({ name: 'Edge Case' }));
      const tempId = article.id;

      // Add list that DOESN'T contain the temp article
      mockLists.push({
        id: 'list-other',
        name: 'Other List',
        articleIds: ['different-article-1', 'different-article-2'],
        itemStates: {},
        ownerId: mockUserId,
        sharedWith: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      firebaseDataSpy.createArticleInFirebase.mockResolvedValue('real-id-edge');

      // Act: Sync
      await offlineSyncSpy._lastQueuedCallback!();

      // Assert: List unchanged (no temp ID to replace)
      const updatedLists = firebaseDataSpy.getCurrentLists();
      expect(updatedLists[0].articleIds).toEqual(['different-article-1', 'different-article-2']);
    });

    it('should handle empty lists array', async () => {
      // Arrange
      connectionServiceSpy.isOnline.mockReturnValue(false);
      await firstValueFrom(service.createArticle({ name: 'No Lists' }));

      // No lists added (mockLists is empty)
      expect(mockLists).toHaveLength(0);

      firebaseDataSpy.createArticleInFirebase.mockResolvedValue('real-id-empty');

      // Act: Sync (should not throw)
      await expect(offlineSyncSpy._lastQueuedCallback!()).resolves.not.toThrow();

      // Assert: No errors
      expect(firebaseDataSpy.updateLocalLists).toHaveBeenCalled();
    });
  });
});
