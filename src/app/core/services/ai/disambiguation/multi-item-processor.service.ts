// src/app/core/services/ai/disambiguation/multi-item-processor.service.ts
import { Injectable, Injector } from '@angular/core';
import { Article } from '../../../models';
import {
  MultiItemPendingAction,
  ProcessedItem,
  AIExecutionResult,
  DisambiguationOption
} from '../ai-models';
import { DataService } from '../../data.service';
import { LoggerService } from '../../logger.service';

/**
 * Multi-item processor service for sequential item processing
 *
 * Handles:
 * - Sequential processing of multiple items (recipes, bulk additions)
 * - Progress tracking and state management
 * - Skip logic and error handling
 * - Final result message generation
 *
 * @example
 * ```typescript
 * const processor = new MultiItemProcessorService(dataService, logger, injector);
 * const result = await processor.processMultiItemSequentially(multiItemAction);
 * // Processes items one by one with disambiguation
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class MultiItemProcessorService {

  constructor(
    private dataService: DataService,
    private logger: LoggerService,
    private injector: Injector
  ) {}

  /**
   * Processes multiple items sequentially with disambiguation
   *
   * Handles multi-item additions by processing each item one at a time,
   * requesting disambiguation when needed. Maintains context across items.
   *
   * Uses injector to get DisambiguationService lazily to avoid circular dependency.
   *
   * @param action - Multi-item pending action containing array of items to process
   * @param getDisambiguationOptionsFn - Callback to get disambiguation options
   * @param getEnhancedSuggestionsFn - Callback to get enhanced suggestions
   * @param addArticleToListFn - Callback to add article to list
   * @returns Promise resolving to execution result (disambiguation prompt or completion)
   *
   * @example
   * ```typescript
   * const action: MultiItemPendingAction = {
   *   type: 'add_multi_items_to_list',
   *   items: [
   *     { itemName: 'Milch', quantity: '1L' },
   *     { itemName: 'Brot', quantity: undefined },
   *     { itemName: 'Bananen', quantity: '500g' }
   *   ],
   *   currentItemIndex: 0,
   *   listId: 'list-123',
   *   listName: 'Einkaufen',
   *   processedItems: []
   * };
   *
   * const result = await service.processMultiItemSequentially(
   *   action,
   *   (itemName) => disambiguationService.getDisambiguationOptions(itemName),
   *   (itemName) => formatterService.getEnhancedSuggestions(itemName),
   *   (articleId, listId, amount) => executionService.addArticleToList(articleId, listId, amount)
   * );
   * ```
   */
  async processMultiItemSequentially(
    action: MultiItemPendingAction,
    getDisambiguationOptionsFn: (itemName: string) => Promise<DisambiguationOption[]>,
    getEnhancedSuggestionsFn: (itemName: string) => Promise<{departmentId: string, icon: string}>,
    addArticleToListFn: (articleId: string, listId: string, amount: string) => Promise<void>
  ): Promise<AIExecutionResult> {
    this.logger.info('multi-item', `Processing item ${action.currentItemIndex + 1}/${action.items.length}`);

    // Safety checks
    if (!action.items || action.items.length === 0) {
      return { success: false, message: '❌ Keine Artikel zu verarbeiten.' };
    }

    if (action.currentItemIndex > 20) {
      this.logger.error('multi-item', 'SAFETY: Too many iterations - stopping');
      return this.executeMultiItemFinalAction(action);
    }

    // Check completion
    if (action.currentItemIndex >= action.items.length) {
      return this.executeMultiItemFinalAction(action);
    }

    const currentItem = action.items[action.currentItemIndex];
    if (!currentItem) {
      return this.executeMultiItemFinalAction(action);
    }

    try {
      const disambiguationOptions = await getDisambiguationOptionsFn(currentItem.itemName);
      const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');

      if (existingOptions.length > 0) {
        // Mark as sequential processing
        (action as any).isMultiItemSequential = true;
        (action as any).isFromRecipe = true;
        action.itemName = currentItem.itemName;

        const message = `"${currentItem.itemName}" Ich habe ähnliche Artikel gefunden. Welchen möchtest du verwenden?`;

        return {
          success: true,
          message,
          needsUserInput: true,
          disambiguationOptions,
          pendingAction: action
        };
      }

      // No disambiguation needed - create new article and continue
      return this.processCurrentItemAndContinue(
        action,
        null,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

    } catch (error) {
      this.logger.error('multi-item', 'Error in sequential processing', error);

      const failedItem: ProcessedItem = {
        item: currentItem,
        failed: true,
        error: error instanceof Error ? error.message : 'Unknown error',
        originalText: currentItem.itemName
      };

      action.processedItems.push(failedItem);
      action.currentItemIndex++;

      return new Promise((resolve) => {
        setTimeout(() => {
          this.processMultiItemSequentially(
            action,
            getDisambiguationOptionsFn,
            getEnhancedSuggestionsFn,
            addArticleToListFn
          ).then(resolve);
        }, 0);
      });
    }
  }

  /**
   * Processes the current item in a multi-item sequence and continues to the next
   *
   * Handles article creation (if needed), adds to list, and continues sequential processing.
   *
   * @param action - Multi-item pending action
   * @param selectedArticle - Article selected by user (null if creating new)
   * @param getDisambiguationOptionsFn - Callback to get disambiguation options
   * @param getEnhancedSuggestionsFn - Callback to get enhanced suggestions
   * @param addArticleToListFn - Callback to add article to list
   * @returns Promise resolving to next step in sequence
   */
  async processCurrentItemAndContinue(
    action: MultiItemPendingAction,
    selectedArticle: Article | null,
    getDisambiguationOptionsFn: (itemName: string) => Promise<DisambiguationOption[]>,
    getEnhancedSuggestionsFn: (itemName: string) => Promise<{departmentId: string, icon: string}>,
    addArticleToListFn: (articleId: string, listId: string, amount: string) => Promise<void>
  ): Promise<AIExecutionResult> {
    const currentItem = action.items[action.currentItemIndex];

    if (!currentItem) {
      action.currentItemIndex++;
      return this.executeMultiItemFinalAction(action);
    }

    const targetListId = (action as any).confirmedTargetListId;
    const targetListName = (action as any).confirmedTargetListName;

    if (!targetListId || !targetListName) {
      return {
        success: false,
        message: '❌ Fehler: Keine Zielliste bestätigt.'
      };
    }

    try {
      let articleId: string;

      if (selectedArticle) {
        articleId = selectedArticle.id;
      } else {
        // Create new article with enhanced suggestions
        const suggestions = await getEnhancedSuggestionsFn(currentItem.itemName);
        const articleData = {
          name: currentItem.itemName,
          amount: currentItem.quantity || '',
          departmentId: suggestions.departmentId,
          icon: suggestions.icon
        };

        const newArticle = await this.dataService.createArticle(articleData).toPromise();
        if (!newArticle) {
          throw new Error(`Failed to create article: ${currentItem.itemName}`);
        }
        articleId = newArticle.id;
      }

      // Add to target list atomically
      await addArticleToListFn(articleId, targetListId, currentItem.quantity || '');

      const processedItem: any = {
        item: currentItem,
        articleId,
        disambiguationResolved: true,
        quantity: currentItem.quantity || '',
        originalText: currentItem.itemName,
        addedToList: true,
        addedToListId: targetListId,
        addedToListName: targetListName
      };

      action.processedItems.push(processedItem);
      action.currentItemIndex++;

      return this.processMultiItemSequentially(
        action,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );

    } catch (error) {
      this.logger.error('multi-item', 'ERROR PROCESSING CURRENT ITEM', error);

      const failedItem: any = {
        item: currentItem,
        failed: true,
        error: error instanceof Error ? error.message : 'Unknown error',
        originalText: currentItem.itemName
      };

      action.processedItems.push(failedItem);
      action.currentItemIndex++;

      return this.processMultiItemSequentially(
        action,
        getDisambiguationOptionsFn,
        getEnhancedSuggestionsFn,
        addArticleToListFn
      );
    }
  }

  /**
   * Handles skip option for multi-item sequential processing
   *
   * Marks the current item as skipped and continues to the next item.
   *
   * @param action - Multi-item pending action
   * @param selectedOption - Skip option selected by user
   * @param getDisambiguationOptionsFn - Callback to get disambiguation options
   * @param getEnhancedSuggestionsFn - Callback to get enhanced suggestions
   * @param addArticleToListFn - Callback to add article to list
   * @returns Promise resolving to next item processing result
   */
  async handleSequentialSkip(
    action: MultiItemPendingAction,
    selectedOption: DisambiguationOption,
    getDisambiguationOptionsFn: (itemName: string) => Promise<DisambiguationOption[]>,
    getEnhancedSuggestionsFn: (itemName: string) => Promise<{departmentId: string, icon: string}>,
    addArticleToListFn: (articleId: string, listId: string, amount: string) => Promise<void>
  ): Promise<AIExecutionResult> {
    const currentItem = action.items[action.currentItemIndex];

    const skippedItem: ProcessedItem = {
      item: currentItem,
      skipped: true,
      skipReason: selectedOption.skipReason || 'Übersprungen',
      originalText: currentItem.itemName
    };

    action.processedItems.push(skippedItem);
    action.currentItemIndex++;

    return this.processMultiItemSequentially(
      action,
      getDisambiguationOptionsFn,
      getEnhancedSuggestionsFn,
      addArticleToListFn
    );
  }

  /**
   * Handles multi-item choice by processing with selected article
   *
   * @param pendingAction - Multi-item pending action
   * @param selectedOption - Disambiguation option selected by user
   * @param getDisambiguationOptionsFn - Callback to get disambiguation options
   * @param getEnhancedSuggestionsFn - Callback to get enhanced suggestions
   * @param addArticleToListFn - Callback to add article to list
   * @returns Promise resolving to processing result
   */
  async handleMultiItemChoice(
    pendingAction: MultiItemPendingAction,
    selectedOption: DisambiguationOption,
    getDisambiguationOptionsFn: (itemName: string) => Promise<DisambiguationOption[]>,
    getEnhancedSuggestionsFn: (itemName: string) => Promise<{departmentId: string, icon: string}>,
    addArticleToListFn: (articleId: string, listId: string, amount: string) => Promise<void>
  ): Promise<AIExecutionResult> {
    let selectedArticle: Article | null = null;

    if (selectedOption.type === 'existing' && selectedOption.article) {
      selectedArticle = selectedOption.article;
    }

    return this.processCurrentItemAndContinue(
      pendingAction,
      selectedArticle,
      getDisambiguationOptionsFn,
      getEnhancedSuggestionsFn,
      addArticleToListFn
    );
  }

  /**
   * Executes final action after all items processed
   *
   * Generates summary message and conversation context.
   *
   * @param action - Multi-item pending action with all processed items
   * @returns Promise resolving to final execution result
   */
  private async executeMultiItemFinalAction(action: MultiItemPendingAction): Promise<AIExecutionResult> {
    const addedItems = action.processedItems.filter(p => (p as any).addedToList);
    const skippedItems = action.processedItems.filter(p => p.skipped);
    const failedItems = action.processedItems.filter(p => p.failed);

    if (addedItems.length === 0 && skippedItems.length === 0) {
      return { success: false, message: '❌ Keine Artikel konnten verarbeitet werden.' };
    }

    const targetListId = (action as any).confirmedTargetListId;
    const targetListName = (action as any).confirmedTargetListName;

    let message = this.buildFinalMessage(addedItems, skippedItems, failedItems, targetListName);

    let conversationContext: any = undefined;
    let followUpPrompt: string | undefined = undefined;

    if (targetListId && targetListName && addedItems.length > 0) {
      conversationContext = {
        lastAction: {
          type: 'article_added' as const,
          listId: targetListId,
          listName: targetListName,
          articleName: `${addedItems.length} Artikel`,
          timestamp: new Date()
        },
        waitingForArticles: {
          listId: targetListId,
          listName: targetListName,
          prompt: 'Multi-item processing completed'
        }
      };

      followUpPrompt = `Möchtest du noch weitere Artikel zu "${targetListName}" hinzufügen?`;
    }

    return {
      success: true,
      message: message,
      listId: targetListId,
      conversationContext,
      followUpPrompt
    };
  }

  /**
   * Builds final summary message for multi-item processing
   *
   * @param addedItems - Items successfully added to list
   * @param skippedItems - Items skipped by user
   * @param failedItems - Items that failed to process
   * @param targetListName - Name of target list
   * @returns Formatted summary message
   *
   * @example
   * ```typescript
   * const message = buildFinalMessage(
   *   [{ item: { itemName: 'Milch' }, quantity: '1L' }],
   *   [{ item: { itemName: 'Brot' } }],
   *   [],
   *   'Einkaufen'
   * );
   * // Returns: "✅ 1 Artikel erfolgreich zu "Einkaufen" hinzugefügt:\n"Milch" (1L)\n\n⏭️ 1 Artikel übersprungen:\n"Brot""
   * ```
   */
  buildFinalMessage(
    addedItems: any[],
    skippedItems: any[],
    failedItems: any[],
    targetListName?: string
  ): string {
    let message = '';

    if (addedItems.length > 0) {
      const addedSummary = addedItems.map(p =>
        `"${p.item.itemName}"${p.quantity ? ` (${p.quantity})` : ''}`
      );
      message += `✅ ${addedItems.length} Artikel erfolgreich zu "${targetListName || 'Liste'}" hinzugefügt:\n${addedSummary.join(', ')}`;
    }

    if (skippedItems.length > 0) {
      const skippedSummary = skippedItems.map(p => `"${p.originalText || p.item.itemName}"`);
      message += `${message ? '\n\n' : ''}⏭️ ${skippedItems.length} Artikel übersprungen:\n${skippedSummary.join(', ')}`;
    }

    if (failedItems.length > 0) {
      const failedSummary = failedItems.map(p => `"${p.originalText || p.item.itemName}"`);
      message += `${message ? '\n\n' : ''}❌ ${failedItems.length} Artikel fehlgeschlagen:\n${failedSummary.join(', ')}`;
    }

    return message;
  }
}
