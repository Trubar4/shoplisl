// src/app/core/services/ai/disambiguation/multi-item-processor.service.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MultiItemProcessorService } from './multi-item-processor.service';
import { MultiItemPendingAction, DisambiguationOption, AIExecutionResult } from '../ai-models';

describe('MultiItemProcessorService', () => {
  let service: MultiItemProcessorService;
  let dataServiceSpy: any;
  let loggerServiceSpy: any;
  let injectorSpy: any;
  let getDisambiguationOptionsFn: any;
  let getEnhancedSuggestionsFn: any;
  let addArticleToListFn: any;

  beforeEach(() => {
    // Mock DataService
    dataServiceSpy = {
      createArticle: vi.fn()
    };

    // Mock LoggerService
    loggerServiceSpy = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    };

    // Mock Injector
    injectorSpy = {};

    // Create service instance
    service = new MultiItemProcessorService(
      dataServiceSpy,
      loggerServiceSpy,
      injectorSpy
    );

    // Mock callback functions
    getDisambiguationOptionsFn = vi.fn();
    getEnhancedSuggestionsFn = vi.fn();
    addArticleToListFn = vi.fn();
  });

  describe('processMultiItemSequentially', () => {
    it('should return error if no items to process', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [],
        currentItemIndex: 0,
        itemName: '',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: []
      };

      const result = await service.processMultiItemSequentially(
        action,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Keine Artikel zu verarbeiten');
    });

    it('should stop processing after 20 iterations (safety check)', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'Test', quantity: '' }],
        currentItemIndex: 21, // Exceeds safety limit
        itemName: 'Test',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: []
      };

      const result = await service.processMultiItemSequentially(
        action,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Keine Artikel konnten verarbeitet werden');
    });

    it('should complete when all items processed', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'Test', quantity: '1L' }],
        currentItemIndex: 1, // Already past last item
        itemName: 'Test',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: [{
          item: { itemName: 'Test', quantity: '1L' },
          addedToList: true,
          addedToListId: 'list-1',
          addedToListName: 'Test List',
          originalText: 'Test'
        } as any],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Test List'
      } as any;

      const result = await service.processMultiItemSequentially(
        action,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('erfolgreich');
      expect(result.listId).toBe('list-1');
    });

    it('should request disambiguation when existing articles found', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'Milch', quantity: '1L' }],
        currentItemIndex: 0,
        itemName: 'Milch',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: []
      };

      const disambiguationOptions: DisambiguationOption[] = [
        {
          id: 'existing_1',
          displayName: 'Vollmilch',
          type: 'existing',
          confidence: 0.9,
          article: { id: '1', name: 'Vollmilch', departmentId: 'dairy', icon: '🥛' } as any
        }
      ];

      getDisambiguationOptionsFn.mockResolvedValue(disambiguationOptions);

      const result = await service.processMultiItemSequentially(
        action,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(result.success).toBe(true);
      expect(result.needsUserInput).toBe(true);
      expect(result.disambiguationOptions).toEqual(disambiguationOptions);
      expect(result.message).toContain('ähnliche Artikel gefunden');
    });

    it('should create new article when no disambiguation needed', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'UniqueItem', quantity: '2kg' }],
        currentItemIndex: 0,
        itemName: 'UniqueItem',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Test List'
      } as any;

      const disambiguationOptions: DisambiguationOption[] = [
        {
          id: 'new_article',
          displayName: '"UniqueItem" (neu erstellen)',
          type: 'new',
          confidence: 1.0
        }
      ];

      getDisambiguationOptionsFn.mockResolvedValue(disambiguationOptions);
      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'miscellaneous', icon: '📦' });
      dataServiceSpy.createArticle.mockReturnValue({
        toPromise: vi.fn().mockResolvedValue({ id: 'new-article-1', name: 'UniqueItem' })
      });
      addArticleToListFn.mockResolvedValue(undefined);

      const result = await service.processMultiItemSequentially(
        action,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      // Should complete the processing
      expect(result.success).toBe(true);
      expect(result.message).toContain('erfolgreich');
    });

    it('should handle errors during processing', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'ErrorItem', quantity: '' }],
        currentItemIndex: 0,
        itemName: 'ErrorItem',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Test List'
      } as any;

      getDisambiguationOptionsFn.mockRejectedValue(new Error('API Error'));

      const result = await service.processMultiItemSequentially(
        action,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      // Should mark as failed and complete
      expect(action.processedItems).toHaveLength(1);
      expect(action.processedItems[0].failed).toBe(true);
      expect(result.success).toBe(false);
    });
  });

  describe('processCurrentItemAndContinue', () => {
    it('should return error if no target list confirmed', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'Test', quantity: '' }],
        currentItemIndex: 0,
        itemName: 'Test',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: []
      };

      const result = await service.processCurrentItemAndContinue(
        action,
        null,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Keine Zielliste bestätigt');
    });

    it('should use existing article if provided', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'Test', quantity: '1L' }],
        currentItemIndex: 0,
        itemName: 'Test',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Test List'
      } as any;

      const existingArticle = { id: 'article-1', name: 'Test', departmentId: 'miscellaneous', icon: '📦' } as any;
      addArticleToListFn.mockResolvedValue(undefined);
      getDisambiguationOptionsFn.mockResolvedValue([]);

      const result = await service.processCurrentItemAndContinue(
        action,
        existingArticle,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(addArticleToListFn).toHaveBeenCalledWith('article-1', 'list-1', '1L');
      expect(action.processedItems).toHaveLength(1);
      expect(action.processedItems[0].articleId).toBe('article-1');
    });

    it('should create new article if none provided', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'NewItem', quantity: '3kg' }],
        currentItemIndex: 0,
        itemName: 'NewItem',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Test List'
      } as any;

      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'food', icon: '🍕' });
      dataServiceSpy.createArticle.mockReturnValue({
        toPromise: vi.fn().mockResolvedValue({ id: 'new-article-2', name: 'NewItem' })
      });
      addArticleToListFn.mockResolvedValue(undefined);
      getDisambiguationOptionsFn.mockResolvedValue([]);

      const result = await service.processCurrentItemAndContinue(
        action,
        null,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(dataServiceSpy.createArticle).toHaveBeenCalled();
      expect(addArticleToListFn).toHaveBeenCalledWith('new-article-2', 'list-1', '3kg');
      expect(action.processedItems).toHaveLength(1);
      expect(action.processedItems[0].articleId).toBe('new-article-2');
    });
  });

  describe('handleSequentialSkip', () => {
    it('should mark item as skipped and continue', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [
          { itemName: 'Item1', quantity: '' },
          { itemName: 'Item2', quantity: '' }
        ],
        currentItemIndex: 0,
        itemName: 'Item1',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: []
      };

      const skipOption: DisambiguationOption = {
        id: 'skip',
        displayName: 'Überspringen',
        type: 'skip',
        confidence: 1.0,
        skipReason: 'User skipped'
      };

      getDisambiguationOptionsFn.mockResolvedValue([]);

      const result = await service.handleSequentialSkip(
        action,
        skipOption,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(action.processedItems).toHaveLength(1);
      expect(action.processedItems[0].skipped).toBe(true);
      expect(action.processedItems[0].skipReason).toBe('User skipped');
      expect(action.currentItemIndex).toBe(1);
    });
  });

  describe('handleMultiItemChoice', () => {
    it('should process with selected article', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'Test', quantity: '1kg' }],
        currentItemIndex: 0,
        itemName: 'Test',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Test List'
      } as any;

      const selectedOption: DisambiguationOption = {
        id: 'article-1',
        displayName: 'Existing Article',
        type: 'existing',
        confidence: 0.9,
        article: { id: 'article-1', name: 'Existing Article', departmentId: 'misc', icon: '📦' } as any
      };

      addArticleToListFn.mockResolvedValue(undefined);
      getDisambiguationOptionsFn.mockResolvedValue([]);

      const result = await service.handleMultiItemChoice(
        action,
        selectedOption,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(addArticleToListFn).toHaveBeenCalledWith('article-1', 'list-1', '1kg');
    });
  });

  describe('buildFinalMessage', () => {
    it('should format message for added items only', () => {
      const addedItems = [
        { item: { itemName: 'Milch' }, quantity: '1L' },
        { item: { itemName: 'Brot' }, quantity: '' }
      ];

      const message = service.buildFinalMessage(addedItems, [], [], 'Einkaufen');

      expect(message).toContain('2 Artikel erfolgreich');
      expect(message).toContain('Einkaufen');
      expect(message).toContain('Milch');
      expect(message).toContain('1L');
      expect(message).toContain('Brot');
    });

    it('should format message for skipped items', () => {
      const skippedItems = [
        { item: { itemName: 'Item1' }, originalText: 'Item1', skipped: true },
        { item: { itemName: 'Item2' }, originalText: 'Item2', skipped: true }
      ];

      const message = service.buildFinalMessage([], skippedItems, [], 'Einkaufen');

      expect(message).toContain('2 Artikel übersprungen');
      expect(message).toContain('Item1');
      expect(message).toContain('Item2');
    });

    it('should format message for failed items', () => {
      const failedItems = [
        { item: { itemName: 'ErrorItem' }, originalText: 'ErrorItem', failed: true }
      ];

      const message = service.buildFinalMessage([], [], failedItems, 'Einkaufen');

      expect(message).toContain('1 Artikel fehlgeschlagen');
      expect(message).toContain('ErrorItem');
    });

    it('should format combined message', () => {
      const addedItems = [{ item: { itemName: 'Added' }, quantity: '' }];
      const skippedItems = [{ item: { itemName: 'Skipped' }, originalText: 'Skipped', skipped: true }];
      const failedItems = [{ item: { itemName: 'Failed' }, originalText: 'Failed', failed: true }];

      const message = service.buildFinalMessage(addedItems, skippedItems, failedItems, 'TestList');

      expect(message).toContain('1 Artikel erfolgreich');
      expect(message).toContain('1 Artikel übersprungen');
      expect(message).toContain('1 Artikel fehlgeschlagen');
    });
  });
});
