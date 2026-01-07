// src/app/core/services/ai/disambiguation/article-execution.service.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ArticleExecutionService } from './article-execution.service';
import { Article, ShoppingList } from '../../../models';
import { PendingAction, AIExecutionResult, DisambiguationOption, ListSelectionOption } from '../ai-models';

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
    it('should add existing article to specified target list', async () => {
      const action: PendingAction = {
        type: 'add_to_list',
        originalInput: 'test',
        itemName: 'Milch',
        extractedQuantity: '1L',
        listName: 'Einkaufen',
        suggestedDepartment: 'dairy'
      };

      const article: Article = {
        id: 'article-1',
        name: 'Vollmilch',
        departmentId: 'dairy',
        icon: '🥛',
        amount: ''
      } as Article;

      const targetList = { id: 'list-1', name: 'Einkaufen' };

      dataServiceSpy.getLists.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue([targetList])
        })
      });

      dataServiceSpy.addArticleToList.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

      dataServiceSpy.updateListItemAmount.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

      const result = await service.executeActionWithArticle(
        action,
        article,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Vollmilch');
      expect(result.message).toContain('1L');
      expect(result.listId).toBe('list-1');
      expect(result.conversationContext).toBeDefined();
    });

    it('should return error if target list not found', async () => {
      const action: PendingAction = {
        type: 'add_to_list',
        originalInput: 'test',
        itemName: 'Milch',
        extractedQuantity: '',
        listName: 'NonExistentList',
        suggestedDepartment: 'dairy'
      };

      const article: Article = {
        id: 'article-1',
        name: 'Vollmilch',
        departmentId: 'dairy',
        icon: '🥛',
        amount: ''
      } as Article;

      dataServiceSpy.getLists.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue([])
        })
      });

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

    it('should prompt for list selection when no target list specified and multiple lists exist', async () => {
      const action: PendingAction = {
        type: 'add_to_list',
        originalInput: 'test',
        itemName: 'Milch',
        extractedQuantity: '',
        listName: undefined,
        suggestedDepartment: 'dairy'
      };

      const article: Article = {
        id: 'article-1',
        name: 'Vollmilch',
        departmentId: 'dairy',
        icon: '🥛',
        amount: ''
      } as Article;

      const listOptions: ListSelectionOption[] = [
        { id: 'list-1', name: 'Einkaufen', displayName: 'Einkaufen', color: '#000' } as any,
        { id: 'list-2', name: 'REWE', displayName: 'REWE', color: '#111' } as any
      ];

      getListSelectionOptionsFn.mockResolvedValue(listOptions);
      convertListsToDisambiguationOptionsFn.mockReturnValue([]);

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
    });

    it('should auto-select single list when no target specified', async () => {
      const action: PendingAction = {
        type: 'add_to_list',
        originalInput: 'test',
        itemName: 'Milch',
        extractedQuantity: '500ml',
        listName: undefined,
        suggestedDepartment: 'dairy'
      };

      const article: Article = {
        id: 'article-1',
        name: 'Vollmilch',
        departmentId: 'dairy',
        icon: '🥛',
        amount: ''
      } as Article;

      const listOptions: ListSelectionOption[] = [
        { id: 'list-1', name: 'Einkaufen', displayName: 'Einkaufen', color: '#000' } as any
      ];

      const targetList = { id: 'list-1', name: 'Einkaufen' };

      getListSelectionOptionsFn.mockResolvedValue(listOptions);
      listSelectionServiceSpy.findListByName.mockResolvedValue(targetList);

      dataServiceSpy.addArticleToList.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

      dataServiceSpy.updateListItemAmount.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

      const result = await service.executeActionWithArticle(
        action,
        article,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Vollmilch');
      expect(result.listId).toBe('list-1');
    });
  });

  describe('executeActionWithNewArticle', () => {
    it('should create new article and add to target list', async () => {
      const pendingAction: PendingAction = {
        type: 'add_to_list',
        originalInput: 'test',
        itemName: 'NewItem',
        extractedQuantity: '2kg',
        listName: 'Einkaufen',
        suggestedDepartment: 'miscellaneous'
      };

      const targetList = { id: 'list-1', name: 'Einkaufen' };
      const newArticle = { id: 'new-article-1', name: 'NewItem', departmentId: 'miscellaneous', icon: '📦' };

      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'miscellaneous', icon: '📦' });

      dataServiceSpy.createArticle.mockReturnValue({
        toPromise: vi.fn().mockResolvedValue(newArticle)
      });

      dataServiceSpy.getLists.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue([targetList])
        })
      });

      dataServiceSpy.addArticleToList.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

      dataServiceSpy.updateListItemAmount.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

      const result = await service.executeActionWithNewArticle(
        pendingAction,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('NewItem');
      expect(result.message).toContain('2kg');
      expect(result.message).toContain('erstellt');
      expect(dataServiceSpy.createArticle).toHaveBeenCalled();
    });

    it('should return error if article creation fails', async () => {
      const pendingAction: PendingAction = {
        type: 'add_to_list',
        originalInput: 'test',
        itemName: 'FailItem',
        extractedQuantity: '',
        listName: 'Einkaufen',
        suggestedDepartment: 'miscellaneous'
      };

      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'miscellaneous', icon: '📦' });

      dataServiceSpy.createArticle.mockReturnValue({
        toPromise: vi.fn().mockResolvedValue(null) // Creation failed
      });

      const result = await service.executeActionWithNewArticle(
        pendingAction,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Fehler beim Erstellen');
    });
  });

  describe('addArticleToList', () => {
    it('should add article to list successfully', async () => {
      dataServiceSpy.addArticleToList.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

      dataServiceSpy.updateListItemAmount.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

      await service.addArticleToList('article-1', 'list-1', '1L');

      expect(dataServiceSpy.addArticleToList).toHaveBeenCalledWith('list-1', 'article-1');
      expect(dataServiceSpy.updateListItemAmount).toHaveBeenCalledWith('list-1', 'article-1', '1L');
    });

    it('should throw error if adding article fails', async () => {
      dataServiceSpy.addArticleToList.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(null) // Failed
        })
      });

      await expect(service.addArticleToList('article-1', 'list-1', '1L'))
        .rejects.toThrow('Failed to add article to list');
    });

    it('should not update amount if empty string', async () => {
      dataServiceSpy.addArticleToList.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

      await service.addArticleToList('article-1', 'list-1', '');

      expect(dataServiceSpy.addArticleToList).toHaveBeenCalled();
      expect(dataServiceSpy.updateListItemAmount).not.toHaveBeenCalled();
    });
  });

  describe('addMultipleArticlesToList', () => {
    it('should add multiple articles successfully', async () => {
      const targetList = { id: 'list-1', name: 'Einkaufen' };
      const articleIds = ['article-1', 'article-2', 'article-3'];
      const pendingAction = {
        processedItems: [
          { item: { itemName: 'Item1', quantity: '1L' } },
          { item: { itemName: 'Item2', quantity: '' } },
          { item: { itemName: 'Item3', quantity: '500g' } }
        ]
      } as any;

      dataServiceSpy.addMultipleArticlesToList.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

      const result = await service.addMultipleArticlesToList(targetList, articleIds, pendingAction);

      expect(result.success).toBe(true);
      expect(result.message).toContain('3 Artikel');
      expect(result.message).toContain('Einkaufen');
      expect(result.listId).toBe('list-1');
    });

    it('should return error if batch add fails', async () => {
      const targetList = { id: 'list-1', name: 'Einkaufen' };
      const articleIds = ['article-1'];
      const pendingAction = { processedItems: [] } as any;

      dataServiceSpy.addMultipleArticlesToList.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(null) // Failed
        })
      });

      const result = await service.addMultipleArticlesToList(targetList, articleIds, pendingAction);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Fehler');
    });
  });

  describe('addSingleArticleToList', () => {
    it('should add existing article directly', async () => {
      const targetList = { id: 'list-1', name: 'Einkaufen' };
      const articleData = { id: 'article-1', name: 'Milch', amount: '1L' };
      const pendingAction = { originalInput: 'test' } as PendingAction;

      dataServiceSpy.addArticleToList.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

      dataServiceSpy.updateListItemAmount.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

      const result = await service.addSingleArticleToList(
        targetList,
        articleData,
        pendingAction,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Milch');
      expect(getDisambiguationOptionsFn).not.toHaveBeenCalled(); // Skipped disambiguation
    });

    it('should request disambiguation when similar articles found', async () => {
      const targetList = { id: 'list-1', name: 'Einkaufen' };
      const articleData = { name: 'Milch', amount: '1L' }; // No ID
      const pendingAction = { originalInput: 'test' } as PendingAction;

      const disambiguationOptions: DisambiguationOption[] = [
        { id: 'existing_1', type: 'existing', displayName: 'Vollmilch', confidence: 0.9 }
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
      expect(result.message).toContain('ähnliche Artikel');
      expect(result.disambiguationOptions).toHaveLength(2); // Original + skip option
    });

    it('should create new article when no similar articles found', async () => {
      const targetList = { id: 'list-1', name: 'Einkaufen' };
      const articleData = { name: 'UniqueItem', amount: '2kg' };
      const pendingAction = { originalInput: 'test' } as PendingAction;

      getDisambiguationOptionsFn.mockResolvedValue([]); // No similar articles
      getEnhancedSuggestionsFn.mockResolvedValue({ departmentId: 'miscellaneous', icon: '📦' });

      const newArticle = { id: 'new-1', name: 'UniqueItem' };
      dataServiceSpy.createArticle.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(newArticle)
        })
      });

      dataServiceSpy.addArticleToList.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

      dataServiceSpy.updateListItemAmount.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(true)
        })
      });

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
        { id: 'list-1', name: 'Einkaufen' },
        { id: 'list-2', name: 'REWE' }
      ];

      dataServiceSpy.getLists.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue(lists)
        })
      });

      const result = await service.findTargetList({ listId: 'list-2' });

      expect(result).toEqual({ id: 'list-2', name: 'REWE' });
    });

    it('should find list by name if ID fails', async () => {
      const targetList = { id: 'list-1', name: 'Einkaufen' };

      dataServiceSpy.getLists.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue([])
        })
      });

      listSelectionServiceSpy.findListByName.mockResolvedValue(targetList);

      const result = await service.findTargetList({ listId: 'wrong-id', listName: 'Einkaufen' });

      expect(result).toEqual(targetList);
      expect(listSelectionServiceSpy.findListByName).toHaveBeenCalledWith('Einkaufen');
    });

    it('should return null if no list found', async () => {
      dataServiceSpy.getLists.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue([])
        })
      });

      listSelectionServiceSpy.findListByName.mockResolvedValue(null);

      const result = await service.findTargetList({ listName: 'NonExistent' });

      expect(result).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle exceptions in executeActionWithArticle gracefully', async () => {
      const action: PendingAction = {
        type: 'add_to_list',
        originalInput: 'test',
        itemName: 'Milch',
        extractedQuantity: '',
        listName: 'Einkaufen',
        suggestedDepartment: 'dairy'
      };

      const article: Article = { id: 'article-1', name: 'Milch' } as Article;

      const targetList = { id: 'list-1', name: 'Einkaufen' };

      dataServiceSpy.getLists.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockResolvedValue([targetList])
        })
      });

      // Make addArticleToList throw error to trigger catch block
      dataServiceSpy.addArticleToList.mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          toPromise: vi.fn().mockImplementation(() => {
            throw new Error('Database error');
          })
        })
      });

      const result = await service.executeActionWithArticle(
        action,
        article,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Fehler');
      expect(result.message).toContain('Milch');
      expect(loggerServiceSpy.error).toHaveBeenCalled();
    });

    it('should handle exceptions in executeActionWithNewArticle gracefully', async () => {
      const pendingAction: PendingAction = {
        type: 'add_to_list',
        originalInput: 'test',
        itemName: 'NewItem',
        extractedQuantity: '',
        listName: 'Einkaufen',
        suggestedDepartment: 'miscellaneous'
      };

      getEnhancedSuggestionsFn.mockRejectedValue(new Error('Suggestion service error'));

      const result = await service.executeActionWithNewArticle(
        pendingAction,
        getEnhancedSuggestionsFn,
        getListSelectionOptionsFn,
        convertListsToDisambiguationOptionsFn
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('NewItem');
      expect(loggerServiceSpy.error).toHaveBeenCalled();
    });
  });
});
