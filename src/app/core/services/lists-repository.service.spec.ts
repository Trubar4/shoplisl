import { of, throwError } from 'rxjs';
import { ListsRepositoryService } from './lists-repository.service';
import { FirebaseDataService } from './firebase-data.service';
import { OfflineSyncService } from './offline-sync.service';
import { ConnectionService } from './connection.service';
import { LoggerService } from './logger.service';
import { Timestamp } from '@angular/fire/firestore';

describe('ListsRepositoryService - Batch Operations', () => {
  let service: ListsRepositoryService;
  let firebaseDataSpy: any;
  let offlineSyncSpy: any;
  let connectionServiceSpy: any;
  let loggerSpy: any;

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

    service = new ListsRepositoryService(
      firebaseDataSpy as any,
      offlineSyncSpy as any,
      connectionServiceSpy as any,
      loggerSpy as any
    );
  });

  describe('addMultipleArticlesToList', () => {
    it('should add multiple articles in a single batch operation', (done) => {
      const listId = 'list1';
      const articleIds = ['article3', 'article4', 'article5'];

      service.addMultipleArticlesToList(listId, articleIds).subscribe(result => {
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

        done();
      });
    });

    it('should handle empty article array', (done) => {
      service.addMultipleArticlesToList('list1', []).subscribe(result => {
        expect(result).toBe(true);
        expect(firebaseDataSpy.updateListInFirebase).not.toHaveBeenCalled();
        done();
      });
    });

    it('should skip articles that already exist in the list', (done) => {
      const articleIds = ['article1', 'article3']; // article1 already exists

      service.addMultipleArticlesToList('list1', articleIds).subscribe(result => {
        expect(result).toBe(true);

        const updateCall = firebaseDataSpy.updateListInFirebase.mock.calls[0];
        const updatedData = updateCall[1];

        // article1 should not be duplicated
        expect(updatedData.articleIds).toEqual(['article1', 'article2', 'article3']);
        done();
      });
    });

    it('should preserve existing item state when article already exists', (done) => {
      const articleIds = ['article1']; // Already exists with amount '2'

      service.addMultipleArticlesToList('list1', articleIds).subscribe(result => {
        expect(result).toBe(true);

        const updateCall = firebaseDataSpy.updateListInFirebase.mock.calls[0];
        const updatedData = updateCall[1];

        // Should reset to unchecked but preserve amount
        expect(updatedData.itemStates['article1']).toEqual({
          articleId: 'article1',
          isChecked: false,
          amount: '2' // Preserved from original
        });
        done();
      });
    });

    it('should handle offline mode by queuing operation', (done) => {
      connectionServiceSpy.isOnline.mockReturnValue(false);

      service.addMultipleArticlesToList('list1', ['article3']).subscribe(result => {
        expect(result).toBe(true);
        expect(firebaseDataSpy.updateLocalLists).toHaveBeenCalled();
        expect(offlineSyncSpy.queueOperation).toHaveBeenCalled();
        done();
      });
    });

    it('should handle errors gracefully', (done) => {
      firebaseDataSpy.getList.mockReturnValue(throwError(() => new Error('Firebase error')));

      service.addMultipleArticlesToList('list1', ['article3']).subscribe({
        next: (result) => {
          expect(result).toBe(false);
          expect(loggerSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('markMultipleArticlesAsChecked', () => {
    it('should mark multiple articles as checked in a single batch operation', (done) => {
      const listId = 'list1';
      const articleIds = ['article1', 'article2'];

      service.markMultipleArticlesAsChecked(listId, articleIds).subscribe(result => {
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

        done();
      });
    });

    it('should handle empty article array', (done) => {
      service.markMultipleArticlesAsChecked('list1', []).subscribe(result => {
        expect(result).toBe(true);
        expect(firebaseDataSpy.updateListInFirebase).not.toHaveBeenCalled();
        done();
      });
    });

    it('should skip articles that are already checked', (done) => {
      const modifiedMockList = {
        ...mockList,
        itemStates: {
          'article1': { articleId: 'article1', isChecked: true, amount: '2' },
          'article2': { articleId: 'article2', isChecked: false, amount: '1' }
        }
      };
      firebaseDataSpy.getList.mockReturnValue(of(modifiedMockList));

      service.markMultipleArticlesAsChecked('list1', ['article1', 'article2']).subscribe(result => {
        expect(result).toBe(true);

        const updateCall = firebaseDataSpy.updateListInFirebase.mock.calls[0];
        const updatedData = updateCall[1];

        // article1 should remain checked (not re-checked)
        expect(updatedData.itemStates['article1'].isChecked).toBe(true);
        // article2 should be newly checked
        expect(updatedData.itemStates['article2'].isChecked).toBe(true);

        done();
      });
    });

    it('should handle offline mode', (done) => {
      connectionServiceSpy.isOnline.mockReturnValue(false);

      service.markMultipleArticlesAsChecked('list1', ['article1']).subscribe(result => {
        expect(result).toBe(true);
        expect(firebaseDataSpy.updateLocalLists).toHaveBeenCalled();
        expect(offlineSyncSpy.queueOperation).toHaveBeenCalled();
        done();
      });
    });

    it('should handle errors gracefully', (done) => {
      firebaseDataSpy.getList.mockReturnValue(throwError(() => new Error('Firebase error')));

      service.markMultipleArticlesAsChecked('list1', ['article1']).subscribe({
        next: (result) => {
          expect(result).toBe(false);
          expect(loggerSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('removeMultipleArticlesFromList', () => {
    it('should remove multiple articles in a single batch operation', (done) => {
      const listId = 'list1';
      const articleIds = ['article1', 'article2'];

      service.removeMultipleArticlesFromList(listId, articleIds).subscribe(result => {
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

        done();
      });
    });

    it('should handle empty article array', (done) => {
      service.removeMultipleArticlesFromList('list1', []).subscribe(result => {
        expect(result).toBe(true);
        expect(firebaseDataSpy.updateListInFirebase).not.toHaveBeenCalled();
        done();
      });
    });

    it('should only remove specified articles', (done) => {
      service.removeMultipleArticlesFromList('list1', ['article1']).subscribe(result => {
        expect(result).toBe(true);

        const updateCall = firebaseDataSpy.updateListInFirebase.mock.calls[0];
        const updatedData = updateCall[1];

        // Only article1 should be removed
        expect(updatedData.articleIds).toEqual(['article2']);
        expect(updatedData.itemStates['article1']).toBeUndefined();
        expect(updatedData.itemStates['article2']).toBeDefined();

        done();
      });
    });

    it('should handle offline mode', (done) => {
      connectionServiceSpy.isOnline.mockReturnValue(false);

      service.removeMultipleArticlesFromList('list1', ['article1']).subscribe(result => {
        expect(result).toBe(true);
        expect(firebaseDataSpy.updateLocalLists).toHaveBeenCalled();
        expect(offlineSyncSpy.queueOperation).toHaveBeenCalled();
        done();
      });
    });

    it('should handle errors gracefully', (done) => {
      firebaseDataSpy.getList.mockReturnValue(throwError(() => new Error('Firebase error')));

      service.removeMultipleArticlesFromList('list1', ['article1']).subscribe({
        next: (result) => {
          expect(result).toBe(false);
          expect(loggerSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('Race Condition Prevention', () => {
    it('should prevent race conditions by using single Firebase update for multiple articles', (done) => {
      // This test verifies the key fix: only one Firebase call per batch operation
      const articleIds = ['article3', 'article4', 'article5'];

      service.addMultipleArticlesToList('list1', articleIds).subscribe(() => {
        // Critical assertion: only ONE Firebase update call
        expect(firebaseDataSpy.updateListInFirebase).toHaveBeenCalledTimes(1);

        // If there were race conditions, we'd see 3 calls (one per article)
        // The fix ensures all articles are processed in a single update
        done();
      });
    });

    it('should process all articles in a single state read', (done) => {
      const articleIds = ['article3', 'article4', 'article5'];

      service.addMultipleArticlesToList('list1', articleIds).subscribe(() => {
        // Verify list was read only ONCE
        expect(firebaseDataSpy.getList).toHaveBeenCalledTimes(1);

        // This prevents the race condition where multiple parallel reads
        // get the same initial state
        done();
      });
    });
  });
});
