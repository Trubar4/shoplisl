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

    it('should show disambiguation asking user to confirm when only new-article option exists', async () => {
      // UPDATED: Previously this test verified that items with no existing matches were
      // auto-created. After the fix, these items now show disambiguation so the user
      // can confirm or skip. The user must actively choose to create the new article.
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

      const result = await service.processMultiItemSequentially(
        action,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      // Now shows disambiguation to ask user instead of silently creating
      expect(result.success).toBe(true);
      expect(result.needsUserInput).toBe(true);
      expect(result.message).toContain('UniqueItem');
      // Article should NOT be created without user confirmation
      expect(dataServiceSpy.createArticle).not.toHaveBeenCalled();
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

  // ========================================
  // BUG REPRODUCTION TESTS
  // ========================================

  describe('Bug: items without existing matches are silently added without user confirmation', () => {
    it('should show disambiguation (needsUserInput) even when only new-article option exists', async () => {
      // REPRODUCES BUG: Items 3-5 in recipe (Vollmilch, Salz, Tomaten) were added silently
      // because getDisambiguationOptionsFn returned only [{type: 'new'}] (no existing articles),
      // and the code skipped showing disambiguation when existingOptions.length === 0.
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'Vollmilch 3,5%', quantity: '400 ml' }],
        currentItemIndex: 0,
        itemName: 'Vollmilch 3,5%',
        extractedQuantity: '',
        listName: 'Baum',
        suggestedDepartment: 'dairy',
        originalInput: 'recipe',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Baum'
      } as any;

      // Only 'new' option - no existing articles found (exactly like items 3-5 in the bug)
      const onlyNewOption: DisambiguationOption[] = [
        {
          id: 'new_article',
          displayName: '"Vollmilch 3,5%" (neu erstellen)',
          type: 'new',
          confidence: 1.0
        }
      ];

      getDisambiguationOptionsFn.mockResolvedValue(onlyNewOption);

      const result = await service.processMultiItemSequentially(
        action,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      // EXPECTED after fix: should show disambiguation so user can confirm or skip
      expect(result.needsUserInput).toBe(true);
      expect(result.message).toContain('Vollmilch 3,5%');
      // Article should NOT be created silently without user confirmation
      expect(dataServiceSpy.createArticle).not.toHaveBeenCalled();
    });

    it('should show disambiguation for item 3 of 6-item recipe when items 1-2 were already processed', async () => {
      // REPRODUCES BUG: After items 1-2 show disambiguation, items 3-5 are auto-processed
      // This tests item 3 specifically: the first item after user interaction
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [
          { itemName: 'Weizenmehl Type 405', quantity: '500 g' },
          { itemName: 'Eier', quantity: '2 Stück' },
          { itemName: 'Vollmilch 3,5%', quantity: '400 ml' },
          { itemName: 'Salz', quantity: '1 TL' },
          { itemName: 'Tomaten gehackt', quantity: '200 g' },
          { itemName: 'weiche Butter', quantity: '75 g' }
        ],
        currentItemIndex: 2, // Processing item 3 (index 2): Vollmilch 3,5%
        itemName: 'Vollmilch 3,5%',
        extractedQuantity: '',
        listName: 'Baum',
        suggestedDepartment: 'dairy',
        originalInput: 'recipe',
        processedItems: [
          { item: { itemName: 'Weizenmehl Type 405', quantity: '500 g' }, addedToList: true, originalText: 'Weizenmehl Type 405' } as any,
          { item: { itemName: 'Eier', quantity: '2 Stück' }, failed: true, originalText: 'Eier' } as any
        ],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Baum'
      } as any;

      // Items 3-5 have no existing matches (as in the reported bug)
      const onlyNewOption: DisambiguationOption[] = [
        {
          id: 'new_article',
          displayName: '"Vollmilch 3,5%" (neu erstellen)',
          type: 'new',
          confidence: 1.0
        }
      ];

      getDisambiguationOptionsFn.mockResolvedValue(onlyNewOption);

      const result = await service.processMultiItemSequentially(
        action,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      // EXPECTED: user should be asked to confirm adding Vollmilch 3,5%
      // BUG: currently auto-creates Vollmilch, Salz, Tomaten silently
      expect(result.needsUserInput).toBe(true);
      expect(result.message).toContain('Vollmilch 3,5%');
    });

    it('should not silently create articles for items with no existing matches', async () => {
      // REPRODUCES BUG: Salz was silently added as new article (shown in console log)
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'Salz', quantity: '1 TL' }],
        currentItemIndex: 0,
        itemName: 'Salz',
        extractedQuantity: '',
        listName: 'Baum',
        suggestedDepartment: 'spices',
        originalInput: 'recipe',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Baum'
      } as any;

      const onlyNewOption: DisambiguationOption[] = [
        {
          id: 'new_article',
          displayName: '"Salz" (neu erstellen)',
          type: 'new',
          confidence: 1.0
        }
      ];

      getDisambiguationOptionsFn.mockResolvedValue(onlyNewOption);

      const result = await service.processMultiItemSequentially(
        action,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      // BUG: createArticle is called silently without user confirmation
      // EXPECTED after fix: user should be asked first
      expect(result.needsUserInput).toBe(true);
      expect(dataServiceSpy.createArticle).not.toHaveBeenCalled();
    });
  });

  describe('Bug: article name normalization for adjective-prefixed items', () => {
    it('should normalize "weiche Butter" to "Butter" when creating new article', async () => {
      // REPRODUCES BUG: When user creates new article from "weiche Butter",
      // it creates an article named "weiche Butter" instead of "Butter".
      // "weiche" is a preparation adjective (soft), not part of the article name.
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'weiche Butter', quantity: '75 g' }],
        currentItemIndex: 0,
        itemName: 'weiche Butter',
        extractedQuantity: '',
        listName: 'Baum',
        suggestedDepartment: 'dairy',
        originalInput: 'recipe',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Baum'
      } as any;

      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'dairy', icon: '🧈' });
      dataServiceSpy.createArticle.mockReturnValue({
        toPromise: vi.fn().mockResolvedValue({ id: 'new-butter-id', name: 'Butter' })
      });
      addArticleToListFn.mockResolvedValue(undefined);
      getDisambiguationOptionsFn.mockResolvedValue([]);

      await service.processCurrentItemAndContinue(
        action,
        null, // no selected article - creating new
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      // BUG: currently creates with name 'weiche Butter'
      // EXPECTED after fix: should strip preparation adjective, create with name 'Butter'
      expect(dataServiceSpy.createArticle).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Butter' }),
        'ai'
      );
    });

    it('should normalize "frische Tomaten" to "Tomaten" when creating new article', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'frische Tomaten', quantity: '300 g' }],
        currentItemIndex: 0,
        itemName: 'frische Tomaten',
        extractedQuantity: '',
        listName: 'Baum',
        suggestedDepartment: 'vegetables',
        originalInput: 'recipe',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Baum'
      } as any;

      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'vegetables', icon: '🍅' });
      dataServiceSpy.createArticle.mockReturnValue({
        toPromise: vi.fn().mockResolvedValue({ id: 'new-tomaten-id', name: 'Tomaten' })
      });
      addArticleToListFn.mockResolvedValue(undefined);
      getDisambiguationOptionsFn.mockResolvedValue([]);

      await service.processCurrentItemAndContinue(
        action,
        null,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      expect(dataServiceSpy.createArticle).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Tomaten' }),
        'ai'
      );
    });

    it('should NOT normalize product specifications like "Vollmilch 3,5%"', async () => {
      // "3,5%" is a product specification, not a preparation adjective - should be kept
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'Vollmilch 3,5%', quantity: '400 ml' }],
        currentItemIndex: 0,
        itemName: 'Vollmilch 3,5%',
        extractedQuantity: '',
        listName: 'Baum',
        suggestedDepartment: 'dairy',
        originalInput: 'recipe',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Baum'
      } as any;

      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'dairy', icon: '🥛' });
      dataServiceSpy.createArticle.mockReturnValue({
        toPromise: vi.fn().mockResolvedValue({ id: 'new-milk-id', name: 'Vollmilch 3,5%' })
      });
      addArticleToListFn.mockResolvedValue(undefined);
      getDisambiguationOptionsFn.mockResolvedValue([]);

      await service.processCurrentItemAndContinue(
        action,
        null,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      // "Vollmilch 3,5%" should remain unchanged - it's a product specification
      expect(dataServiceSpy.createArticle).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Vollmilch 3,5%' }),
        'ai'
      );
    });

    it('should NOT normalize "Weizenmehl Type 405" - Type 405 is a product spec', async () => {
      const action: MultiItemPendingAction = {
        type: 'add_multi_items_to_list',
        items: [{ itemName: 'Weizenmehl Type 405', quantity: '500 g' }],
        currentItemIndex: 0,
        itemName: 'Weizenmehl Type 405',
        extractedQuantity: '',
        listName: 'Baum',
        suggestedDepartment: 'bakery',
        originalInput: 'recipe',
        processedItems: [],
        confirmedTargetListId: 'list-1',
        confirmedTargetListName: 'Baum'
      } as any;

      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'bakery', icon: '🌾' });
      dataServiceSpy.createArticle.mockReturnValue({
        toPromise: vi.fn().mockResolvedValue({ id: 'new-mehl-id', name: 'Weizenmehl Type 405' })
      });
      addArticleToListFn.mockResolvedValue(undefined);
      getDisambiguationOptionsFn.mockResolvedValue([]);

      await service.processCurrentItemAndContinue(
        action,
        null,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

      // "Weizenmehl Type 405" should remain unchanged - product specification
      expect(dataServiceSpy.createArticle).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Weizenmehl Type 405' }),
        'ai'
      );
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
