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

      expect(dataServiceSpy.createArticle).toHaveBeenCalled();
      expect(addArticleToListFn).toHaveBeenCalledWith('new-article-1', 'list-1', '2kg');
      expect(result.success).toBe(true);
    });

    it('should handle errors gracefully and mark item as failed', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [
          { itemName: 'FailItem', quantity: '' },
          { itemName: 'NextItem', quantity: '' }
        ],
        currentItemIndex: 0,
        itemName: 'FailItem',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: []
      };

      // First call fails, second call succeeds for next item
      getDisambiguationOptionsFn
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([]); // For next item processing

      const result = await service.processMultiItemSequentially(
        action,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      // First item should be marked as failed
      expect(action.processedItems).toHaveLength(1);
      expect(action.processedItems[0]).toMatchObject({
        failed: true,
        error: 'Network error'
      });
      expect(action.currentItemIndex).toBe(1);
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

    it('should use existing article when provided', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'Milch', quantity: '1L' }],
        currentItemIndex: 0,
        itemName: 'Milch',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Test List'
      } as any;

      const existingArticle = { id: 'article-1', name: 'Vollmilch' } as any;

      addArticleToListFn.mockResolvedValue(undefined);
      getDisambiguationOptionsFn.mockResolvedValue([]); // For next iteration

      const result = await service.processCurrentItemAndContinue(
        action,
        existingArticle,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(addArticleToListFn).toHaveBeenCalledWith('article-1', 'list-1', '1L');
      expect(action.processedItems[0]).toMatchObject({
        articleId: 'article-1',
        addedToList: true
      });
    });

    it('should create new article when selectedArticle is null', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'NewItem', quantity: '500g' }],
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

      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'miscellaneous', icon: '📦' });
      dataServiceSpy.createArticle.mockReturnValue({
        toPromise: vi.fn().mockResolvedValue({ id: 'new-1', name: 'NewItem' })
      });
      addArticleToListFn.mockResolvedValue(undefined);
      getDisambiguationOptionsFn.mockResolvedValue([]); // For next iteration

      const result = await service.processCurrentItemAndContinue(
        action,
        null,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(dataServiceSpy.createArticle).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'NewItem',
          amount: '500g',
          departmentId: 'miscellaneous',
          icon: '📦'
        })
      );
      expect(addArticleToListFn).toHaveBeenCalledWith('new-1', 'list-1', '500g');
    });

    it('should handle article creation failure', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [
          { itemName: 'FailItem', quantity: '' },
          { itemName: 'NextItem', quantity: '' }
        ],
        currentItemIndex: 0,
        itemName: 'FailItem',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Test List'
      } as any;

      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'miscellaneous', icon: '📦' });
      dataServiceSpy.createArticle.mockReturnValue({
        toPromise: vi.fn().mockResolvedValue(null) // Article creation failed
      });

      const result = await service.processCurrentItemAndContinue(
        action,
        null,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(action.processedItems[0]).toMatchObject({
        failed: true
      });
    });
  });

  describe('handleSequentialSkip', () => {
    it('should mark item as skipped and continue to next', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [
          { itemName: 'SkipMe', quantity: '' },
          { itemName: 'ProcessMe', quantity: '' }
        ],
        currentItemIndex: 0,
        itemName: 'SkipMe',
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
        skipReason: 'User requested'
      };

      getDisambiguationOptionsFn.mockResolvedValue([]); // For next item

      const result = await service.handleSequentialSkip(
        action,
        skipOption,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(action.processedItems[0]).toMatchObject({
        skipped: true,
        skipReason: 'User requested'
      });
      expect(action.currentItemIndex).toBe(1);
    });
  });

  describe('handleMultiItemChoice', () => {
    it('should process with existing article when selected', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'Milch', quantity: '1L' }],
        currentItemIndex: 0,
        itemName: 'Milch',
        extractedQuantity: '',
        listName: 'Test List',
        suggestedDepartment: 'miscellaneous',
        originalInput: 'test',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Test List'
      } as any;

      const selectedOption: DisambiguationOption = {
        id: 'existing_1',
        displayName: 'Vollmilch',
        type: 'existing',
        confidence: 0.9,
        article: { id: 'article-1', name: 'Vollmilch' } as any
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

      expect(addArticleToListFn).toHaveBeenCalledWith('article-1', 'list-1', '1L');
    });

    it('should create new article when type is not existing', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'NewItem', quantity: '' }],
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

      const selectedOption: DisambiguationOption = {
        id: 'new_article',
        displayName: '"NewItem" (neu erstellen)',
        type: 'new',
        confidence: 1.0
      };

      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'miscellaneous', icon: '📦' });
      dataServiceSpy.createArticle.mockReturnValue({
        toPromise: vi.fn().mockResolvedValue({ id: 'new-1', name: 'NewItem' })
      });
      addArticleToListFn.mockResolvedValue(undefined);
      getDisambiguationOptionsFn.mockResolvedValue([]);

      const result = await service.handleMultiItemChoice(
        action,
        selectedOption,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(dataServiceSpy.createArticle).toHaveBeenCalled();
    });
  });

  describe('buildFinalMessage', () => {
    it('should build message for successfully added items', () => {
      const addedItems = [
        { item: { itemName: 'Milch' }, quantity: '1L' },
        { item: { itemName: 'Brot' }, quantity: '' }
      ];

      const message = service.buildFinalMessage(addedItems, [], [], 'Einkaufen');

      expect(message).toContain('✅ 2 Artikel erfolgreich');
      expect(message).toContain('Einkaufen');
      expect(message).toContain('"Milch" (1L)');
      expect(message).toContain('"Brot"');
    });

    it('should build message for skipped items', () => {
      const skippedItems = [
        { item: { itemName: 'Skip1' }, originalText: 'Skip1', skipped: true },
        { item: { itemName: 'Skip2' }, originalText: 'Skip2', skipped: true }
      ];

      const message = service.buildFinalMessage([], skippedItems, []);

      expect(message).toContain('⏭️ 2 Artikel übersprungen');
      expect(message).toContain('"Skip1"');
      expect(message).toContain('"Skip2"');
    });

    it('should build message for failed items', () => {
      const failedItems = [
        { item: { itemName: 'Fail1' }, originalText: 'Fail1', failed: true }
      ];

      const message = service.buildFinalMessage([], [], failedItems);

      expect(message).toContain('❌ 1 Artikel fehlgeschlagen');
      expect(message).toContain('"Fail1"');
    });

    it('should build combined message with all item types', () => {
      const addedItems = [{ item: { itemName: 'Added' }, quantity: '' }];
      const skippedItems = [{ item: { itemName: 'Skipped' }, originalText: 'Skipped', skipped: true }];
      const failedItems = [{ item: { itemName: 'Failed' }, originalText: 'Failed', failed: true }];

      const message = service.buildFinalMessage(addedItems, skippedItems, failedItems, 'Test List');

      expect(message).toContain('✅ 1 Artikel erfolgreich');
      expect(message).toContain('⏭️ 1 Artikel übersprungen');
      expect(message).toContain('❌ 1 Artikel fehlgeschlagen');
    });
  });
});
