// src/app/core/services/ai/disambiguation/article-execution.service.ts
import { Injectable } from '@angular/core';
import { take, timeout } from 'rxjs/operators';
import { Article, ShoppingList } from '../../../models';
import {
  PendingAction,
  AIExecutionResult,
  DisambiguationOption,
  ListSelectionOption
} from '../ai-models';
import { DataService } from '../../data.service';
import { LoggerService } from '../../logger.service';
import { AICachingService } from '../caching.service';
import { ListSelectionService } from './list-selection.service';

/**
 * Article execution service for handling article CRUD operations and list assignments
 *
 * Handles:
 * - Article creation and addition to lists
 * - Target list resolution (by ID, by name)
 * - Single and batch article operations
 * - "No target list" scenarios with user prompts
 *
 * @example
 * ```typescript
 * const executor = new ArticleExecutionService(dataService, logger, listSelection);
 * const result = await executor.executeActionWithArticle(action, article);
 * // Adds article to target list with conversation context
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class ArticleExecutionService {

  constructor(
    private dataService: DataService,
    private logger: LoggerService,
    private cachingService: AICachingService,
    private listSelection: ListSelectionService
  ) {}

  /**
   * Executes action with an existing article
   *
   * @param action - Pending action containing article data
   * @param article - Existing article to add to list
   * @param getEnhancedSuggestionsFn - Callback to get enhanced suggestions (unused in this path)
   * @param getListSelectionOptionsFn - Callback to get list selection options
   * @param convertListsToDisambiguationOptionsFn - Callback to convert lists to disambiguation format
   * @returns Promise resolving to execution result
   */
  async executeActionWithArticle(
    action: PendingAction,
    article: Article,
    getEnhancedSuggestionsFn: (itemName: string) => Promise<{departmentId: string, icon: string}>,
    getListSelectionOptionsFn: () => Promise<ListSelectionOption[]>,
    convertListsToDisambiguationOptionsFn: (options: ListSelectionOption[]) => DisambiguationOption[]
  ): Promise<AIExecutionResult> {
    try {
      const targetInfo = this.getTargetListInfo(action);

      if (targetInfo.listName) {
        const targetList = await this.findTargetList(targetInfo);

        if (!targetList) {
          return {
            success: false,
            message: `❌ Liste "${targetInfo.listName}" nicht gefunden.`
          };
        }

        return this.addExistingArticleToList(targetList, article, action);

      } else {
        return this.handleNoTargetList(
          action,
          article,
          getListSelectionOptionsFn,
          convertListsToDisambiguationOptionsFn
        );
      }

    } catch (error) {
      this.logger.error('disambiguation', 'Error executing action with existing article', error);
      return {
        success: false,
        message: `❌ Fehler beim Hinzufügen von "${article.name}".`
      };
    }
  }

  /**
   * Executes action by creating a new article
   *
   * @param pendingAction - Pending action containing item details
   * @param getEnhancedSuggestionsFn - Callback to get department/icon suggestions
   * @param getListSelectionOptionsFn - Callback to get list selection options
   * @param convertListsToDisambiguationOptionsFn - Callback to convert lists to disambiguation format
   * @returns Promise resolving to execution result
   */
  async executeActionWithNewArticle(
    pendingAction: PendingAction,
    getEnhancedSuggestionsFn: (itemName: string) => Promise<{departmentId: string, icon: string}>,
    getListSelectionOptionsFn: () => Promise<ListSelectionOption[]>,
    convertListsToDisambiguationOptionsFn: (options: ListSelectionOption[]) => DisambiguationOption[]
  ): Promise<AIExecutionResult> {
    try {
      // Create new article with enhanced suggestions
      const suggestions = await getEnhancedSuggestionsFn(pendingAction.itemName);
      const articleData = {
        name: pendingAction.itemName,
        amount: pendingAction.extractedQuantity || '',
        departmentId: suggestions.departmentId,
        icon: suggestions.icon
      };

      const newArticle = await this.dataService.createArticle(articleData, 'ai').toPromise();

      if (!newArticle) {
        return {
          success: false,
          message: `❌ Fehler beim Erstellen des Artikels "${pendingAction.itemName}".`
        };
      }

      // Invalidate disambiguation cache so subsequent searches find the new article
      this.cachingService.clearByPattern(
        new RegExp(`^disambiguation:${pendingAction.itemName.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`)
      );

      // Handle target list
      const targetInfo = this.getTargetListInfo(pendingAction);
      if (targetInfo.listName) {
        const targetList = await this.findTargetList(targetInfo);

        if (!targetList) {
          return {
            success: false,
            message: `❌ Liste "${targetInfo.listName}" nicht gefunden.`
          };
        }

        return this.addNewArticleToList(targetList, newArticle, pendingAction);

      } else {
        return this.handleNoTargetListForNewArticle(
          pendingAction,
          newArticle,
          getListSelectionOptionsFn,
          convertListsToDisambiguationOptionsFn
        );
      }

    } catch (error) {
      this.logger.error('disambiguation', 'Error executing action with new article', error);
      return {
        success: false,
        message: `❌ Fehler beim Erstellen des Artikels "${pendingAction.itemName}".`
      };
    }
  }

  /**
   * Adds an article to a list
   *
   * @param articleId - ID of article to add
   * @param listId - ID of target list
   * @param amount - Optional amount/quantity
   * @returns Promise resolving when article is added
   */
  async addArticleToList(articleId: string, listId: string, amount: string): Promise<void> {
    // Use repository's addArticleToList for optimistic UI updates
    const result = await this.dataService.addArticleToList(listId, articleId, 'ai').pipe(take(1)).toPromise();

    if (!result) {
      throw new Error(`Failed to add article to list`);
    }

    // Update amount if specified
    if (amount) {
      await this.dataService.updateListItemAmount(listId, articleId, amount).pipe(take(1)).toPromise();
    }
  }

  /**
   * Adds multiple articles to a list in batch
   *
   * @param targetList - Target shopping list
   * @param multipleArticleIds - Array of article IDs to add
   * @param pendingAction - Pending action containing processed items for summary
   * @returns Promise resolving to execution result with summary
   */
  async addMultipleArticlesToList(
    targetList: any,
    multipleArticleIds: string[],
    pendingAction: PendingAction
  ): Promise<AIExecutionResult> {
    // Use repository's addMultipleArticlesToList for optimistic UI updates and race condition prevention
    const updateResult = await this.dataService.addMultipleArticlesToList(targetList.id, multipleArticleIds, 'ai')
      .pipe(take(1)).toPromise();

    if (updateResult) {
      const processedItems = (pendingAction as any).processedItems || [];
      const itemSummary = processedItems
        .map((p: any) => `"${p.item?.itemName || p.originalText}"${p.item?.quantity ? ` (${p.item.quantity})` : ''}`)
        .join(', ');

      return {
        success: true,
        message: `✅ ${multipleArticleIds.length} Artikel zur Liste "${targetList.name}" hinzugefügt:\n${itemSummary}`,
        listId: targetList.id
      };
    } else {
      return {
        success: false,
        message: '❌ Fehler beim Hinzufügen der Artikel zur Liste.'
      };
    }
  }

  /**
   * Adds a single article to a list, with optional disambiguation
   *
   * Checks for existing similar articles before creating new one.
   *
   * @param targetList - Target shopping list
   * @param articleData - Article data (may or may not have ID)
   * @param pendingAction - Pending action context
   * @param getDisambiguationOptionsFn - Callback to get disambiguation options
   * @param getEnhancedSuggestionsFn - Callback to get enhanced suggestions
   * @returns Promise resolving to execution result
   */
  async addSingleArticleToList(
    targetList: any,
    articleData: any,
    pendingAction: PendingAction,
    getDisambiguationOptionsFn: (itemName: string) => Promise<DisambiguationOption[]>,
    getEnhancedSuggestionsFn: (itemName: string) => Promise<{departmentId: string, icon: string}>
  ): Promise<AIExecutionResult> {
    let articleId = articleData.id;

    if (!articleId) {
      // Check for disambiguation BEFORE creating new article
      const disambiguationOptions = await getDisambiguationOptionsFn(articleData.name);
      const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');

      if (existingOptions.length > 0) {
        const newPendingAction: PendingAction = {
          type: 'add_item',
          originalInput: pendingAction.originalInput,
          itemName: articleData.name,
          extractedQuantity: articleData.amount,
          listName: targetList.name,
          suggestedDepartment: articleData.departmentId || 'miscellaneous',
          conversationListId: targetList.id
        } as any;

        const enhancedOptions = [
          ...disambiguationOptions,
          {
            id: 'skip_item',
            displayName: `"${articleData.name}" überspringen`,
            type: 'skip' as const,
            confidence: 1.0,
            icon: '⏭️'
          }
        ];

        return {
          success: true,
          message: `Für "${articleData.name}" habe ich ähnliche Artikel gefunden. Welchen möchtest du verwenden?`,
          needsUserInput: true,
          disambiguationOptions: enhancedOptions,
          pendingAction: newPendingAction
        };
      }

      // Create new article
      const suggestions = await getEnhancedSuggestionsFn(articleData.name);
      const newArticle = await this.dataService.createArticle({
        name: articleData.name,
        amount: articleData.amount || '',
        departmentId: suggestions.departmentId,
        icon: suggestions.icon
      }, 'ai').pipe(take(1), timeout(5000)).toPromise();

      if (!newArticle) {
        return {
          success: false,
          message: '❌ Fehler beim Erstellen des Artikels.'
        };
      }

      // Invalidate disambiguation cache so subsequent searches find the new article
      this.cachingService.clearByPattern(
        new RegExp(`^disambiguation:${articleData.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`)
      );

      articleId = newArticle.id;
    }

    // Add article to list
    await this.addArticleToList(articleId, targetList.id, articleData.amount || '');

    return {
      success: true,
      message: `✅ "${articleData.name}"${articleData.amount ? ` (${articleData.amount})` : ''} wurde zur Liste "${targetList.name}" hinzugefügt.`,
      listId: targetList.id
    };
  }

  /**
   * Finds target list by ID or name
   *
   * @param targetInfo - Object containing listId and/or listName
   * @returns Promise resolving to shopping list or null
   */
  async findTargetList(targetInfo: {listName?: string, listId?: string}): Promise<ShoppingList | null> {
    if (targetInfo.listId) {
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      const listById = lists?.find(list => list.id === targetInfo.listId);
      if (listById) return listById;
    }

    if (targetInfo.listName) {
      return this.listSelection.findListByName(targetInfo.listName);
    }

    return null;
  }

  /**
   * Extracts target list info from pending action
   *
   * @param action - Pending action
   * @returns Object with optional listName and listId
   */
  private getTargetListInfo(action: PendingAction): {listName?: string, listId?: string} {
    return {
      listName: action.listName,
      listId: (action as any).conversationListId
    };
  }

  /**
   * Adds existing article to list with conversation context
   *
   * @param targetList - Target shopping list
   * @param article - Existing article
   * @param action - Pending action
   * @returns Promise resolving to execution result with conversation context
   */
  private async addExistingArticleToList(
    targetList: any,
    article: Article,
    action: PendingAction
  ): Promise<AIExecutionResult> {
    await this.addArticleToList(article.id, targetList.id, action.extractedQuantity || article.amount || '');

    const quantityText = action.extractedQuantity ? ` (${action.extractedQuantity})` : '';

    const conversationContext = {
      lastAction: {
        type: 'article_added' as const,
        listId: targetList.id,
        listName: targetList.name,
        articleName: article.name,
        timestamp: new Date()
      },
      waitingForArticles: {
        listId: targetList.id,
        listName: targetList.name,
        prompt: 'Conversation mode maintained'
      }
    };

    return {
      success: true,
      message: `✅ "${article.name}"${quantityText} wurde zur Liste "${targetList.name}" hinzugefügt.`,
      listId: targetList.id,
      conversationContext: conversationContext,
      followUpPrompt: 'Möchtest du noch weitere Artikel hinzufügen?'
    };
  }

  /**
   * Adds newly created article to list with conversation context
   *
   * @param targetList - Target shopping list
   * @param newArticle - Newly created article
   * @param pendingAction - Pending action
   * @returns Promise resolving to execution result with conversation context
   */
  private async addNewArticleToList(
    targetList: any,
    newArticle: Article,
    pendingAction: PendingAction
  ): Promise<AIExecutionResult> {
    await this.addArticleToList(newArticle.id, targetList.id, pendingAction.extractedQuantity || '');

    const quantityText = pendingAction.extractedQuantity ? ` (${pendingAction.extractedQuantity})` : '';

    const conversationContext = {
      lastAction: {
        type: 'article_added' as const,
        listId: targetList.id,
        listName: targetList.name,
        articleName: newArticle.name,
        timestamp: new Date()
      },
      waitingForArticles: {
        listId: targetList.id,
        listName: targetList.name,
        prompt: 'Conversation mode maintained'
      }
    };

    return {
      success: true,
      message: `✅ "${newArticle.name}"${quantityText} wurde erstellt und zur Liste "${targetList.name}" hinzugefügt.`,
      listId: targetList.id,
      conversationContext: conversationContext,
      followUpPrompt: 'Möchtest du noch weitere Artikel hinzufügen?'
    };
  }

  /**
   * Handles case when no target list is specified for existing article
   *
   * Auto-selects if only one list exists, otherwise prompts user.
   *
   * @param action - Pending action
   * @param article - Existing article
   * @param getListSelectionOptionsFn - Callback to get list options
   * @param convertListsToDisambiguationOptionsFn - Callback to convert lists format
   * @returns Promise resolving to execution result (may need user input)
   */
  private async handleNoTargetList(
    action: PendingAction,
    article: Article,
    getListSelectionOptionsFn: () => Promise<ListSelectionOption[]>,
    convertListsToDisambiguationOptionsFn: (options: ListSelectionOption[]) => DisambiguationOption[]
  ): Promise<AIExecutionResult> {
    const listOptions = await getListSelectionOptionsFn();

    if (listOptions.length === 0) {
      return {
        success: false,
        message: '❌ Keine Listen gefunden! Erstelle zuerst eine Liste.'
      };
    }

    if (listOptions.length === 1) {
      // Use the only available list
      const singleList = listOptions[0];
      const targetList = await this.listSelection.findListByName(singleList.name);

      if (targetList) {
        return this.addExistingArticleToList(targetList, article, action);
      }
    }

    // Multiple lists - ask user to choose
    const listSelectionAction: PendingAction = {
      type: 'select_list',
      originalInput: action.originalInput,
      itemName: article.name,
      extractedQuantity: action.extractedQuantity,
      listName: undefined,
      suggestedDepartment: action.suggestedDepartment,
      articleToAdd: {
        id: article.id,
        name: article.name,
        amount: action.extractedQuantity || article.amount || '',
        departmentId: article.departmentId || 'miscellaneous',
        icon: article.icon || '📦'
      }
    };

    return {
      success: true,
      message: `Bitte wähle eine Liste.`,
      needsUserInput: true,
      disambiguationOptions: convertListsToDisambiguationOptionsFn(listOptions),
      pendingAction: listSelectionAction
    };
  }

  /**
   * Handles case when no target list is specified for new article
   *
   * Auto-selects if only one list exists, otherwise prompts user.
   *
   * @param pendingAction - Pending action
   * @param newArticle - Newly created article
   * @param getListSelectionOptionsFn - Callback to get list options
   * @param convertListsToDisambiguationOptionsFn - Callback to convert lists format
   * @returns Promise resolving to execution result (may need user input)
   */
  private async handleNoTargetListForNewArticle(
    pendingAction: PendingAction,
    newArticle: Article,
    getListSelectionOptionsFn: () => Promise<ListSelectionOption[]>,
    convertListsToDisambiguationOptionsFn: (options: ListSelectionOption[]) => DisambiguationOption[]
  ): Promise<AIExecutionResult> {
    const listOptions = await getListSelectionOptionsFn();

    if (listOptions.length === 0) {
      return {
        success: false,
        message: '❌ Keine Listen gefunden! Erstelle zuerst eine Liste.'
      };
    }

    if (listOptions.length === 1) {
      // Use the only available list
      const singleList = listOptions[0];
      const targetList = await this.listSelection.findListByName(singleList.name);

      if (targetList) {
        return this.addNewArticleToList(targetList, newArticle, pendingAction);
      }
    }

    // Multiple lists - ask user to choose
    const listSelectionAction: PendingAction = {
      type: 'select_list',
      originalInput: pendingAction.originalInput,
      itemName: newArticle.name,
      extractedQuantity: pendingAction.extractedQuantity,
      listName: undefined,
      suggestedDepartment: pendingAction.suggestedDepartment,
      articleToAdd: {
        id: newArticle.id,
        name: newArticle.name,
        amount: pendingAction.extractedQuantity || '',
        departmentId: newArticle.departmentId || 'miscellaneous',
        icon: newArticle.icon || '📦'
      }
    };

    return {
      success: true,
      message: `Bitte wähle eine Liste.`,
      needsUserInput: true,
      disambiguationOptions: convertListsToDisambiguationOptionsFn(listOptions),
      pendingAction: listSelectionAction
    };
  }
}
