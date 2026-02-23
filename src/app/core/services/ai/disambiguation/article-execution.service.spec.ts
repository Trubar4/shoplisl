// src/app/core/services/ai/disambiguation/article-execution.service.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ArticleExecutionService } from './article-execution.service';
import { PendingAction, DisambiguationOption, ListSelectionOption } from '../ai-models';
import { of, throwError } from 'rxjs';

describe('ArticleExecutionService', () => {
  let service: ArticleExecutionService;
  let dataServiceSpy: any;
  let loggerServiceSpy: any;
  let listSelectionServiceSpy: any;
  let getEnhancedSuggestionsFn: any;
  let getListSelectionOptionsFn: any;
  let convertListsToDisambiguationOptionsFn: any;
  let getDisambiguationOptionsFn: any;

  beforeEach(() => {
    // Mock DataService
    dataServiceSpy = {
      createArticle: vi.fn(),
      addArticleToList: vi.fn(),
      updateListItemAmount: vi.fn(),
      addMultipleArticlesToList: vi.fn(),
      getLists: vi.fn()
    };

    // Mock LoggerService
    loggerServiceSpy = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    };

    // Mock ListSelectionService
    listSelectionServiceSpy = {
      findListByName: vi.fn(),
      findListById: vi.fn()
    };

    // Create service instance
    service = new ArticleExecutionService(
      dataServiceSpy,
      loggerServiceSpy,
      listSelectionServiceSpy
    );

    // Mock callback functions
    getEnhancedSuggestionsFn = vi.fn();
    getListSelectionOptionsFn = vi.fn();
    convertListsToDisambiguationOptionsFn = vi.fn();
    getDisambiguationOptionsFn = vi.fn();
  });

  describe('executeActionWithArticle', () => {
    it('should add existing article to specified list', async () => {
      const action: PendingAction = {
        type: 'add_item',
        originalInput: 'add milk',
        itemName: 'Milch',
        extractedQuantity: '1L',
        listName: 'Einkaufen',
        suggestedDepartment: 'dairy'
      };

      const article = {
        id: 'article-1',
        name: 'Milch',
        departmentId: 'dairy',
        icon: '🥛',
        amount: ''
      } as any;

      const targetList = {
        id: 'list-1',
        name: 'Einkaufen'
      };

      listSelectionServiceSpy.findListByName.mockResolvedValue(targetList);
      dataServiceSpy.addArticleToList.mockReturnValue(of(true));
      dataServiceSpy.updateListItemAmount.mockReturnValue(of(true));

      const result = await service.executeActionWithArticle(
        action,
        article,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Milch');
      expect(result.message).toContain('Einkaufen');
      expect(result.listId).toBe('list-1');
      expect(dataServiceSpy.addArticleToList).toHaveBeenCalledWith('list-1', 'article-1', 'ai');
    });

    it('should return error if target list not found', async () => {
      const action: PendingAction = {
        type: 'add_item',
        originalInput: 'add milk',
        itemName: 'Milch',
        extractedQuantity: '1L',
        listName: 'NonExistent',
        suggestedDepartment: 'dairy'
      };

      const article = { id: 'article-1', name: 'Milch' } as any;

      listSelectionServiceSpy.findListByName.mockResolvedValue(null);

      const result = await service.executeActionWithArticle(
        action,
        article,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('nicht gefunden');
    });

    it('should prompt for list selection when no list specified and multiple lists exist', async () => {
      const action: PendingAction = {
        type: 'add_item',
        originalInput: 'add milk',
        itemName: 'Milch',
        extractedQuantity: '1L',
        listName: undefined,
        suggestedDepartment: 'dairy'
      };

      const article = { id: 'article-1', name: 'Milch', amount: '', departmentId: 'dairy', icon: '🥛' } as any;

      const listOptions: ListSelectionOption[] = [
        { id: 'list-1', name: 'Einkaufen', icon: '🛒' },
        { id: 'list-2', name: 'Wochenende', icon: '📅' }
      ];

      getListSelectionOptionsFn.mockResolvedValue(listOptions);
      convertListsToDisambiguationOptionsFn.mockReturnValue([
        { id: 'list-1', displayName: 'Einkaufen', type: 'list' as const },
        { id: 'list-2', displayName: 'Wochenende', type: 'list' as const }
      ]);

      const result = await service.executeActionWithArticle(
        action,
        article,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(true);
      expect(result.needsUserInput).toBe(true);
      expect(result.message).toContain('wähle eine Liste');
      expect(result.pendingAction?.type).toBe('select_list');
    });

    it('should auto-select single list when no list specified', async () => {
      const action: PendingAction = {
        type: 'add_item',
        originalInput: 'add milk',
        itemName: 'Milch',
        extractedQuantity: '1L',
        listName: undefined,
        suggestedDepartment: 'dairy'
      };

      const article = { id: 'article-1', name: 'Milch', amount: '', departmentId: 'dairy', icon: '🥛' } as any;

      const singleList = { id: 'list-1', name: 'Einkaufen' };

      getListSelectionOptionsFn.mockResolvedValue([
        { id: 'list-1', name: 'Einkaufen', icon: '🛒' }
      ]);

      listSelectionServiceSpy.findListByName.mockResolvedValue(singleList);
      dataServiceSpy.addArticleToList.mockReturnValue(of(true));
      dataServiceSpy.updateListItemAmount.mockReturnValue(of(true));

      const result = await service.executeActionWithArticle(
        action,
        article,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(true);
      expect(result.listId).toBe('list-1');
    });
  });

  describe('executeActionWithNewArticle', () => {
    it('should create article and add to specified list', async () => {
      const action: PendingAction = {
        type: 'add_item',
        originalInput: 'add new item',
        itemName: 'NewItem',
        extractedQuantity: '5kg',
        listName: 'Einkaufen',
        suggestedDepartment: 'miscellaneous'
      };

      const targetList = { id: 'list-1', name: 'Einkaufen' };
      const newArticle = { id: 'new-article-1', name: 'NewItem', departmentId: 'misc', icon: '📦' };

      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'misc', icon: '📦' });
      dataServiceSpy.createArticle.mockReturnValue({
        toPromise: vi.fn().mockResolvedValue(newArticle)
      });
      listSelectionServiceSpy.findListByName.mockResolvedValue(targetList);
      dataServiceSpy.addArticleToList.mockReturnValue(of(true));
      dataServiceSpy.updateListItemAmount.mockReturnValue(of(true));

      const result = await service.executeActionWithNewArticle(
        action,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('NewItem');
      expect(result.message).toContain('erstellt');
      expect(result.listId).toBe('list-1');
      expect(dataServiceSpy.createArticle).toHaveBeenCalled();
    });

    it('should return error if article creation fails', async () => {
      const action: PendingAction = {
        type: 'add_item',
        originalInput: 'add item',
        itemName: 'Item',
        extractedQuantity: '',
        listName: 'List',
        suggestedDepartment: 'misc'
      };

      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'misc', icon: '📦' });
      dataServiceSpy.createArticle.mockReturnValue({
        toPromise: vi.fn().mockResolvedValue(null)
      });

      const result = await service.executeActionWithNewArticle(
        action,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Fehler beim Erstellen');
    });
  });

  describe('addArticleToList', () => {
    it('should add article to list with amount', async () => {
      dataServiceSpy.addArticleToList.mockReturnValue(of(true));
      dataServiceSpy.updateListItemAmount.mockReturnValue(of(true));

      await service.addArticleToList('article-1', 'list-1', '2kg');

      expect(dataServiceSpy.addArticleToList).toHaveBeenCalledWith('list-1', 'article-1', 'ai');
      expect(dataServiceSpy.updateListItemAmount).toHaveBeenCalledWith('list-1', 'article-1', '2kg');
    });

    it('should add article without amount if not specified', async () => {
      dataServiceSpy.addArticleToList.mockReturnValue(of(true));

      await service.addArticleToList('article-1', 'list-1', '');

      expect(dataServiceSpy.addArticleToList).toHaveBeenCalledWith('list-1', 'article-1', 'ai');
      expect(dataServiceSpy.updateListItemAmount).not.toHaveBeenCalled();
    });

    it('should throw error if add fails', async () => {
      dataServiceSpy.addArticleToList.mockReturnValue(of(false));

      await expect(service.addArticleToList('article-1', 'list-1', '')).rejects.toThrow();
    });
  });

  describe('addMultipleArticlesToList', () => {
    it('should add multiple articles to list', async () => {
      const targetList = { id: 'list-1', name: 'Einkaufen' };
      const articleIds = ['article-1', 'article-2', 'article-3'];
      const pendingAction: any = {
        processedItems: [
          { item: { itemName: 'Item1', quantity: '1kg' }, originalText: 'Item1' },
          { item: { itemName: 'Item2', quantity: '' }, originalText: 'Item2' },
          { item: { itemName: 'Item3', quantity: '500g' }, originalText: 'Item3' }
        ]
      };

      dataServiceSpy.addMultipleArticlesToList.mockReturnValue(of(true));

      const result = await service.addMultipleArticlesToList(targetList, articleIds, pendingAction);

      expect(result.success).toBe(true);
      expect(result.message).toContain('3 Artikel');
      expect(result.message).toContain('Einkaufen');
      expect(result.listId).toBe('list-1');
    });

    it('should return error if batch add fails', async () => {
      const targetList = { id: 'list-1', name: 'Einkaufen' };
      const articleIds = ['article-1'];

      dataServiceSpy.addMultipleArticlesToList.mockReturnValue(of(false));

      const result = await service.addMultipleArticlesToList(targetList, articleIds, {} as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Fehler');
    });
  });

  describe('addSingleArticleToList', () => {
    it('should add existing article directly', async () => {
      const targetList = { id: 'list-1', name: 'Einkaufen' };
      const articleData = {
        id: 'article-1',
        name: 'Existing',
        amount: '3kg',
        departmentId: 'misc',
        icon: '📦'
      };
      const pendingAction: any = { originalInput: 'test' };

      dataServiceSpy.addArticleToList.mockReturnValue(of(true));
      dataServiceSpy.updateListItemAmount.mockReturnValue(of(true));

      const result = await service.addSingleArticleToList(
        targetList,
        articleData,
        pendingAction,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Existing');
      expect(dataServiceSpy.addArticleToList).toHaveBeenCalled();
    });

    it('should request disambiguation if similar articles exist', async () => {
      const targetList = { id: 'list-1', name: 'Einkaufen' };
      const articleData = {
        name: 'Milch',
        amount: '1L',
        departmentId: 'dairy'
      };
      const pendingAction: any = { originalInput: 'test' };

      const disambiguationOptions: DisambiguationOption[] = [
        {
          id: 'existing-1',
          displayName: 'Vollmilch',
          type: 'existing',
          confidence: 0.9,
          article: { id: 'article-1', name: 'Vollmilch' } as any
        }
      ];

      getDisambiguationOptionsFn.mockResolvedValue(disambiguationOptions);

      const result = await service.addSingleArticleToList(
        targetList,
        articleData,
        pendingAction,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn
      );

      expect(result.success).toBe(true);
      expect(result.needsUserInput).toBe(true);
      expect(result.disambiguationOptions).toHaveLength(2); // Original + skip option
      expect(result.disambiguationOptions![1].type).toBe('skip');
    });

    it('should create new article if no similar ones exist', async () => {
      const targetList = { id: 'list-1', name: 'Einkaufen' };
      const articleData = {
        name: 'UniqueItem',
        amount: '2kg',
        departmentId: 'misc'
      };
      const pendingAction: any = { originalInput: 'test' };

      getDisambiguationOptionsFn.mockResolvedValue([]);
      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'misc', icon: '📦' });
      dataServiceSpy.createArticle.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue({ id: 'new-article-1', name: 'UniqueItem' })
        })
      });
      dataServiceSpy.addArticleToList.mockReturnValue(of(true));
      dataServiceSpy.updateListItemAmount.mockReturnValue(of(true));

      const result = await service.addSingleArticleToList(
        targetList,
        articleData,
        pendingAction,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('UniqueItem');
      expect(dataServiceSpy.createArticle).toHaveBeenCalled();
    });
  });

  describe('findTargetList', () => {
    it('should find list by ID', async () => {
      const lists = [
        { id: 'list-1', name: 'List1' },
        { id: 'list-2', name: 'List2' }
      ];

      dataServiceSpy.getLists.mockReturnValue(of(lists));

      const result = await service.findTargetList({ listId: 'list-2' });

      expect(result).toEqual({ id: 'list-2', name: 'List2' });
    });

    it('should find list by name if ID not found', async () => {
      const targetList = { id: 'list-1', name: 'Einkaufen' };

      dataServiceSpy.getLists.mockReturnValue(of([]));
      listSelectionServiceSpy.findListByName.mockResolvedValue(targetList);

      const result = await service.findTargetList({ listId: 'nonexistent', listName: 'Einkaufen' });

      expect(result).toEqual(targetList);
    });

    it('should return null if no list found', async () => {
      dataServiceSpy.getLists.mockReturnValue(of([]));
      listSelectionServiceSpy.findListByName.mockResolvedValue(null);

      const result = await service.findTargetList({ listName: 'NonExistent' });

      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle errors in executeActionWithArticle', async () => {
      const action: PendingAction = {
        type: 'add_item',
        originalInput: 'test',
        itemName: 'Test',
        extractedQuantity: '',
        listName: 'List',
        suggestedDepartment: 'misc'
      };

      const article = { id: 'article-1', name: 'Test' } as any;

      listSelectionServiceSpy.findListByName.mockRejectedValue(new Error('Network error'));

      const result = await service.executeActionWithArticle(
        action,
        article,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Fehler');
      expect(loggerServiceSpy.error).toHaveBeenCalled();
    });

    it('should handle errors in executeActionWithNewArticle', async () => {
      const action: PendingAction = {
        type: 'add_item',
        originalInput: 'test',
        itemName: 'Test',
        extractedQuantity: '',
        listName: 'List',
        suggestedDepartment: 'misc'
      };

      getEnhancedSuggestionsFn.mockRejectedValue(new Error('Suggestion error'));

      const result = await service.executeActionWithNewArticle(
        action,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Fehler');
      expect(loggerServiceSpy.error).toHaveBeenCalled();
    });
  });

  describe('conversation context', () => {
    it('should include conversation context and follow-up prompt', async () => {
      const action: PendingAction = {
        type: 'add_item',
        originalInput: 'test',
        itemName: 'Test',
        extractedQuantity: '1kg',
        listName: 'Einkaufen',
        suggestedDepartment: 'misc'
      };

      const article = { id: 'article-1', name: 'Test', amount: '', departmentId: 'misc', icon: '📦' } as any;
      const targetList = { id: 'list-1', name: 'Einkaufen' };

      listSelectionServiceSpy.findListByName.mockResolvedValue(targetList);
      dataServiceSpy.addArticleToList.mockReturnValue(of(true));
      dataServiceSpy.updateListItemAmount.mockReturnValue(of(true));

      const result = await service.executeActionWithArticle(
        action,
        article,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.conversationContext).toBeDefined();
      expect(result.conversationContext?.lastAction.type).toBe('article_added');
      expect(result.conversationContext?.lastAction.listId).toBe('list-1');
      expect(result.followUpPrompt).toContain('weitere Artikel');
    });
  });
});
