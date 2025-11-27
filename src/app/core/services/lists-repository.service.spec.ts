import { of, throwError, firstValueFrom } from 'rxjs';
import { ListsRepositoryService } from './lists-repository.service';
import { FirebaseDataService } from './firebase-data.service';
import { OfflineSyncService } from './offline-sync.service';
import { ConnectionService } from './connection.service';
import { LoggerService } from './logger.service';
import { HistoryService } from './history.service';
import { Timestamp } from '@angular/fire/firestore';

describe('ListsRepositoryService - Batch Operations', () => {
  let service: ListsRepositoryService;
  let firebaseDataSpy: any;
  let offlineSyncSpy: any;
  let connectionServiceSpy: any;
  let loggerSpy: any;
  let historyServiceSpy: any;

  const mockList = {
    id: 'list1',
    name: 'Test List',
    articleIds: ['article1', 'article2'],
    itemStates: {
      'article1': { articleId: 'article1', isChecked: false, amount: '2' },
      'article2': { articleId: 'article2', isChecked: false, amount: '1' }
    },
    departmentOrder: [],
    icon: '📝',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    firebaseDataSpy = {
      getList: vi.fn().mockReturnValue(of(mockList)),
      getCurrentLists: vi.fn().mockReturnValue([mockList]),
      updateLocalLists: vi.fn(),
      updateListInFirebase: vi.fn().mockResolvedValue(undefined)
    };

    offlineSyncSpy = {
      queueOperation: vi.fn()
    };

    connectionServiceSpy = {
      isOnline: vi.fn().mockReturnValue(true)
    };

    loggerSpy = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    historyServiceSpy = {
      createUpdatedItemState: vi.fn().mockImplementation((currentState, articleId, action, amount) => ({
        ...currentState,
        articleId,
        isChecked: action === 'checked',
        checkedAt: new Date(),
        amount,
        checkedBy: 'shared-shoplisl-user',
        history: [{
          timestamp: new Date(),
          userId: 'shared-shoplisl-user',
          userName: 'Du',
          action,
          amount
        }]
      }))
    };

    service = new ListsRepositoryService(
      firebaseDataSpy as any,
      offlineSyncSpy as any,
      connectionServiceSpy as any,
      loggerSpy as any,
      historyServiceSpy as any
    );
  });

  describe('addMultipleArticlesToList', () => {
    it('should add multiple articles in a single batch operation', async () => {
      const listId = 'list1';
      const articleIds = ['article3', 'article4', 'article5'];

      const result = await firstValueFrom(service.addMultipleArticlesToList(listId, articleIds));
      expect(result).toBe(true);

      // Verify Firebase was called only ONCE (no race condition)
      expect(firebaseDataSpy.updateListInFirebase).toHaveBeenCalledTimes(1);

      // Verify all articles were added
      const updateCall = firebaseDataSpy.updateListInFirebase.mock.calls[0];
      expect(updateCall[0]).toBe(listId);
      const updatedData = updateCall[1];

      // Should include original + new articles
      expect(updatedData.articleIds).toEqual(['article1', 'article2', 'article3', 'article4', 'article5']);

      // Should have item states for all new articles
      expect(updatedData.itemStates['article3']).toEqual({
        articleId: 'article3',
        isChecked: false,
        amount: ''
      });
      expect(updatedData.itemStates['article4']).toEqual({
        articleId: 'article4',
        isChecked: false,
        amount: ''
      });
      expect(updatedData.itemStates['article5']).toEqual({
        articleId: 'article5',
        isChecked: false,
        amount: ''
      });
    });

    it('should handle empty article array', async () => {
      const result = await firstValueFrom(service.addMultipleArticlesToList('list1', []));
      expect(result).toBe(true);
      expect(firebaseDataSpy.updateListInFirebase).not.toHaveBeenCalled();
    });

    it('should skip articles that already exist in the list', async () => {
      const articleIds = ['article1', 'article3']; // article1 already exists

      const result = await firstValueFrom(service.addMultipleArticlesToList('list1', articleIds));
      expect(result).toBe(true);

      const updateCall = firebaseDataSpy.updateListInFirebase.mock.calls[0];
      const updatedData = updateCall[1];

      // article1 should not be duplicated
      expect(updatedData.articleIds).toEqual(['article1', 'article2', 'article3']);
    });

    it('should preserve existing item state when article already exists', async () => {
      const articleIds = ['article1']; // Already exists with amount '2'

      const result = await firstValueFrom(service.addMultipleArticlesToList('list1', articleIds));
      expect(result).toBe(true);

      const updateCall = firebaseDataSpy.updateListInFirebase.mock.calls[0];
      const updatedData = updateCall[1];

      // Should reset to unchecked but preserve amount
      expect(updatedData.itemStates['article1']).toEqual({
        articleId: 'article1',
        isChecked: false,
        amount: '2' // Preserved from original
      });
    });

    it('should handle offline mode by queuing operation', async () => {
      connectionServiceSpy.isOnline.mockReturnValue(false);

      const result = await firstValueFrom(service.addMultipleArticlesToList('list1', ['article3']));
      expect(result).toBe(true);
      expect(firebaseDataSpy.updateLocalLists).toHaveBeenCalled();
      expect(offlineSyncSpy.queueOperation).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      firebaseDataSpy.getList.mockReturnValue(throwError(() => new Error('Firebase error')));

      const result = await firstValueFrom(service.addMultipleArticlesToList('list1', ['article3']));
      expect(result).toBe(false);
      expect(loggerSpy.error).toHaveBeenCalled();
    });
  });

  describe('markMultipleArticlesAsChecked', () => {
    it('should mark multiple articles as checked in a single batch operation', async () => {
      const listId = 'list1';
      const articleIds = ['article1', 'article2'];

      const result = await firstValueFrom(service.markMultipleArticlesAsChecked(listId, articleIds));
      expect(result).toBe(true);

      // Verify Firebase was called only ONCE (no race condition)
      expect(firebaseDataSpy.updateListInFirebase).toHaveBeenCalledTimes(1);

      const updateCall = firebaseDataSpy.updateListInFirebase.mock.calls[0];
      const updatedData = updateCall[1];

      // All articles should be marked as checked
      expect(updatedData.itemStates['article1'].isChecked).toBe(true);
      expect(updatedData.itemStates['article2'].isChecked).toBe(true);

      // Should have checkedAt timestamp
      expect(updatedData.itemStates['article1'].checkedAt).toBeDefined();
      expect(updatedData.itemStates['article2'].checkedAt).toBeDefined();
    });

    it('should handle empty article array', async () => {
      const result = await firstValueFrom(service.markMultipleArticlesAsChecked('list1', []));
      expect(result).toBe(true);
      expect(firebaseDataSpy.updateListInFirebase).not.toHaveBeenCalled();
    });

    it('should skip articles that are already checked', async () => {
      const modifiedMockList = {
        ...mockList,
        itemStates: {
          'article1': { articleId: 'article1', isChecked: true, amount: '2' },
          'article2': { articleId: 'article2', isChecked: false, amount: '1' }
        }
      };
      firebaseDataSpy.getList.mockReturnValue(of(modifiedMockList));

      const result = await firstValueFrom(service.markMultipleArticlesAsChecked('list1', ['article1', 'article2']));
      expect(result).toBe(true);

      const updateCall = firebaseDataSpy.updateListInFirebase.mock.calls[0];
      const updatedData = updateCall[1];

      // article1 should remain checked (not re-checked)
      expect(updatedData.itemStates['article1'].isChecked).toBe(true);
      // article2 should be newly checked
      expect(updatedData.itemStates['article2'].isChecked).toBe(true);
    });

    it('should handle offline mode', async () => {
      connectionServiceSpy.isOnline.mockReturnValue(false);

      const result = await firstValueFrom(service.markMultipleArticlesAsChecked('list1', ['article1']));
      expect(result).toBe(true);
      expect(firebaseDataSpy.updateLocalLists).toHaveBeenCalled();
      expect(offlineSyncSpy.queueOperation).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      firebaseDataSpy.getList.mockReturnValue(throwError(() => new Error('Firebase error')));

      const result = await firstValueFrom(service.markMultipleArticlesAsChecked('list1', ['article1']));
      expect(result).toBe(false);
      expect(loggerSpy.error).toHaveBeenCalled();
    });
  });

  describe('removeMultipleArticlesFromList', () => {
    it('should remove multiple articles in a single batch operation', async () => {
      const listId = 'list1';
      const articleIds = ['article1', 'article2'];

      const result = await firstValueFrom(service.removeMultipleArticlesFromList(listId, articleIds));
      expect(result).toBe(true);

      // Verify Firebase was called only ONCE (no race condition)
      expect(firebaseDataSpy.updateListInFirebase).toHaveBeenCalledTimes(1);

      const updateCall = firebaseDataSpy.updateListInFirebase.mock.calls[0];
      const updatedData = updateCall[1];

      // Articles should be removed from articleIds array
      expect(updatedData.articleIds).toEqual([]);

      // Item states should be removed
      expect(updatedData.itemStates['article1']).toBeUndefined();
      expect(updatedData.itemStates['article2']).toBeUndefined();
    });

    it('should handle empty article array', async () => {
      const result = await firstValueFrom(service.removeMultipleArticlesFromList('list1', []));
      expect(result).toBe(true);
      expect(firebaseDataSpy.updateListInFirebase).not.toHaveBeenCalled();
    });

    it('should only remove specified articles', async () => {
      const result = await firstValueFrom(service.removeMultipleArticlesFromList('list1', ['article1']));
      expect(result).toBe(true);

      const updateCall = firebaseDataSpy.updateListInFirebase.mock.calls[0];
      const updatedData = updateCall[1];

      // Only article1 should be removed
      expect(updatedData.articleIds).toEqual(['article2']);
      expect(updatedData.itemStates['article1']).toBeUndefined();
      expect(updatedData.itemStates['article2']).toBeDefined();
    });

    it('should handle offline mode', async () => {
      connectionServiceSpy.isOnline.mockReturnValue(false);

      const result = await firstValueFrom(service.removeMultipleArticlesFromList('list1', ['article1']));
      expect(result).toBe(true);
      expect(firebaseDataSpy.updateLocalLists).toHaveBeenCalled();
      expect(offlineSyncSpy.queueOperation).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      firebaseDataSpy.getList.mockReturnValue(throwError(() => new Error('Firebase error')));

      const result = await firstValueFrom(service.removeMultipleArticlesFromList('list1', ['article1']));
      expect(result).toBe(false);
      expect(loggerSpy.error).toHaveBeenCalled();
    });
  });

  describe('Race Condition Prevention', () => {
    it('should prevent race conditions by using single Firebase update for multiple articles', async () => {
      // This test verifies the key fix: only one Firebase call per batch operation
      const articleIds = ['article3', 'article4', 'article5'];

      await firstValueFrom(service.addMultipleArticlesToList('list1', articleIds));

      // Critical assertion: only ONE Firebase update call
      expect(firebaseDataSpy.updateListInFirebase).toHaveBeenCalledTimes(1);

      // If there were race conditions, we'd see 3 calls (one per article)
      // The fix ensures all articles are processed in a single update
    });

    it('should process all articles in a single state read', async () => {
      const articleIds = ['article3', 'article4', 'article5'];

      await firstValueFrom(service.addMultipleArticlesToList('list1', articleIds));

      // Verify list was read only ONCE
      expect(firebaseDataSpy.getList).toHaveBeenCalledTimes(1);

      // This prevents the race condition where multiple parallel reads
      // get the same initial state
    });
  });
});
