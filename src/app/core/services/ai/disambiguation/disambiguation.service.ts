// src/app/core/services/ai/disambiguation/disambiguation.service.ts
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { take, timeout } from 'rxjs/operators';
import {
  DisambiguationOption,
  PendingAction,
  MultiItemPendingAction,
  ProcessedItem,
  AIExecutionResult,
  ListSelectionOption,
  isMultiItemPendingAction,
  MIN_SIMILARITY_THRESHOLD,
  DisambiguationError
} from '../ai-models';
import { Article, ShoppingList } from '../../../models';
import { DataService } from '../../data.service';
import { DepartmentService } from '../../department.service';
import { SmartSuggestionsService } from '../smart-suggestions.service';
import { suggestDepartment, suggestIcon } from '../../../utils/department-mapping.utils';
import { LoggerService } from '../../logger.service';
import { PerformanceMonitorService } from '../performance-monitor.service';
import { AICachingService } from '../caching.service';
import { AIMessagingService, ErrorContext, ValidationRules } from '../ai-messaging.service';
import { CircuitBreakerService } from '../circuit-breaker.service';
import { ArticleMatcherService } from './article-matcher.service';
import { ListSelectionService } from './list-selection.service';
import { MultiItemProcessorService } from './multi-item-processor.service';
import { ArticleExecutionService } from './article-execution.service';

@Injectable({
  providedIn: 'root'
})
export class DisambiguationService {

  constructor(
    private dataService: DataService,
    private departmentService: DepartmentService,
    private smartSuggestions: SmartSuggestionsService,
    private cachingService: AICachingService,
    private errorHandler: AIMessagingService,
    private performanceMonitor: PerformanceMonitorService,
    private logger: LoggerService,
    private circuitBreaker: CircuitBreakerService,
    private articleMatcher: ArticleMatcherService,
    private listSelection: ListSelectionService,
    private multiItemProcessor: MultiItemProcessorService,
    private articleExecution: ArticleExecutionService
  ) {}

  // ========================================
  // MAIN DISAMBIGUATION METHODS
  // ========================================

  /**
   * Gets disambiguation options for an item name
   *
   * Searches existing articles using fuzzy matching (Levenshtein distance) and returns
   * options sorted by similarity. Includes circuit breaker protection and caching.
   *
   * @param itemName - Name of the item to find disambiguation options for
   * @param excludeId - Optional article ID to exclude from results
   * @returns Promise resolving to array of disambiguation options including:
   *   - Existing articles above similarity threshold (sorted by similarity)
   *   - "Create new" option
   *   - "Skip" option (for multi-item scenarios)
   *
   * @example
   * ```typescript
   * // Find options for "Milch"
   * const options = await service.getDisambiguationOptions('Milch');
   * // Returns: [
   * //   { id: '1', displayText: 'Vollmilch 3,5%', type: 'existing', similarity: 0.90 },
   * //   { id: '2', displayText: 'Milch 1,5%', type: 'existing', similarity: 0.85 },
   * //   { id: 'new', displayText: 'Neu erstellen: Milch', type: 'new' }
   * // ]
   *
   * // Exclude specific article
   * const options = await service.getDisambiguationOptions('Milch', 'article-1');
   * ```
   *
   * @throws {AIServiceError} If validation fails or critical error occurs
   * @see {@link MIN_SIMILARITY_THRESHOLD} for similarity cutoff (default 0.6)
   * @see {@link DisambiguationOption} for option structure
   */
  async getDisambiguationOptions(itemName: string, excludeId?: string): Promise<DisambiguationOption[]> {
    try {
      const result = await this.circuitBreaker.execute(
        'disambiguation-options',
        () => this.getDisambiguationOptionsInternal(itemName, excludeId),
        () => this.getFallbackDisambiguationOptions(itemName),
        {
          failureThreshold: 3,
          successThreshold: 2,
          timeout: 8000,
          resetTimeout: 20000,
          retryAttempts: 2,
          retryDelay: 500,
          enableFallback: true,
          enableMetrics: true
        }
      ).toPromise();

      // Ensure we always return an array
      return result || [];
    } catch (error) {
      this.logger.error('ai', 'Circuit breaker execution failed', error);
      return this.getFallbackDisambiguationOptions(itemName);
    }
  }

  private async getDisambiguationOptionsInternal(itemName: string, excludeId?: string): Promise<DisambiguationOption[]> {
    this.performanceMonitor.startOperation('getDisambiguationOptions');

    try {
      const context: ErrorContext = {
        operation: 'getDisambiguationOptions',
        input: { itemName, excludeId },
        timestamp: new Date()
      };

      this.errorHandler.validateInput(itemName, [
        ValidationRules.required('itemName'),
        ValidationRules.minLength('itemName', 1),
        ValidationRules.maxLength('itemName', 100)
      ], context);

      const cacheKey = this.cachingService.createDisambiguationKey(itemName, excludeId);

      const result = await this.cachingService.getOrSet(
        cacheKey,
        () => this.getDisambiguationOptionsFromSource(itemName, excludeId),
        2 * 60 * 1000
      ).toPromise();

      const finalResult = result || [];
      this.performanceMonitor.endOperation('getDisambiguationOptions', true, !!result);
      return finalResult;

    } catch (error) {
      this.performanceMonitor.endOperation('getDisambiguationOptions', false, false, error instanceof Error ? error.message : 'Unknown error');
      console.error('Error in getDisambiguationOptions:', error);
      return [];
    }
  }

  private getFallbackDisambiguationOptions(itemName: string): DisambiguationOption[] {
    this.logger.info('ai', `Using fallback disambiguation options for: ${itemName}`);

    // Basic fallback - always offer to create new
    const departmentId = suggestDepartment(itemName);
    const icon = suggestIcon(itemName);
    const departmentName = this.departmentService.getDepartmentName(departmentId, 'german');

    return [{
      id: 'new_article_fallback',
      displayName: `"${itemName}" (neu erstellen)`,
      type: 'new',
      confidence: 0.5, // Lower confidence for fallback
      icon: icon,
      department: departmentName,
      suggestedDepartmentId: departmentId,
      preview: `${departmentName} ${icon} (Fallback)`
    }];
  }

  private async getDisambiguationOptionsFromSource(itemName: string, excludeId?: string): Promise<DisambiguationOption[]> {
    try {
      const articles = await this.dataService.getArticles().pipe(take(1)).toPromise();
      const options: DisambiguationOption[] = [];

      if (!articles) return options;

      // Get similar existing articles using ArticleMatcherService
      const similarArticles = await this.articleMatcher.findSimilarArticles(articles, itemName, excludeId);

      // Add existing articles as options
      this.addExistingArticleOptions(options, similarArticles);

      // Add "create new" option if no exact match
      await this.addCreateNewOption(options, similarArticles, itemName);

      return options;

    } catch (error) {
      console.error('Error getting disambiguation options from source:', error);
      throw new DisambiguationError('Failed to get disambiguation options', { itemName, error });
    }
  }

  /**
   * Handles user's choice from disambiguation options
   *
   * Processes the selected option and executes the appropriate action:
   * - For existing articles: adds to list or uses in creation
   * - For "create new": creates new article with suggested department/icon
   * - For "skip": skips to next item in multi-item sequence
   *
   * Supports both single-item and multi-item pending actions.
   *
   * @param pendingAction - The action waiting for disambiguation (single or multi-item)
   * @param selectedOption - The option chosen by the user
   * @returns Promise resolving to execution result after processing the choice
   *
   * @example
   * ```typescript
   * // Single item: User selected existing article
   * const pendingAction: PendingAction = {
   *   type: 'add_to_list',
   *   itemName: 'Milch',
   *   listId: 'list-123',
   *   listName: 'Einkaufen'
   * };
   *
   * const selectedOption: DisambiguationOption = {
   *   id: 'article-456',
   *   displayText: 'Vollmilch 3,5%',
   *   type: 'existing'
   * };
   *
   * const result = await service.handleDisambiguationChoice(pendingAction, selectedOption);
   * // Result: Article added to list
   *
   * // Multi-item: User chose to skip
   * const multiAction: MultiItemPendingAction = {
   *   type: 'add_multi_items_to_list',
   *   items: [...],
   *   currentIndex: 0,
   *   ...
   * };
   *
   * const skipOption: DisambiguationOption = {
   *   id: 'skip',
   *   displayText: 'Überspringen',
   *   type: 'skip'
   * };
   *
   * const result = await service.handleDisambiguationChoice(multiAction, skipOption);
   * // Result: Skips current item, continues to next
   * ```
   *
   * @throws {DisambiguationError} If choice processing fails
   * @see {@link getDisambiguationOptions} for getting available options
   * @see {@link processMultiItemSequentially} for multi-item handling
   */
  async handleDisambiguationChoice(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    try {
      const result = await this.circuitBreaker.execute(
        'disambiguation-choice',
        () => this.handleDisambiguationChoiceInternal(pendingAction, selectedOption),
        () => this.getFallbackExecutionResult(pendingAction, selectedOption),
        {
          failureThreshold: 3,
          successThreshold: 2,
          timeout: 10000,
          resetTimeout: 20000,
          retryAttempts: 2,
          retryDelay: 500,
          enableFallback: true,
          enableMetrics: true
        }
      ).toPromise();

      // Ensure we always return a result
      return result || this.getFallbackExecutionResult(pendingAction, selectedOption);
    } catch (error) {
      this.logger.error('ai', 'Circuit breaker execution failed', error);
      return this.getFallbackExecutionResult(pendingAction, selectedOption);
    }
  }

  private async handleDisambiguationChoiceInternal(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    this.performanceMonitor.startOperation('handleDisambiguationChoice');

    try {
      console.log('🎯 Handling disambiguation choice:', { pendingAction, selectedOption });

      const result = await this.handleDisambiguationChoiceOriginal(pendingAction, selectedOption);

      this.performanceMonitor.endOperation('handleDisambiguationChoice', result.success);
      return result;

    } catch (error) {
      this.performanceMonitor.endOperation('handleDisambiguationChoice', false, false, error instanceof Error ? error.message : 'Unknown error');
      console.error('Error handling disambiguation choice:', error);

      return {
        success: false,
        message: `❌ Fehler beim Verarbeiten der Auswahl: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  private async handleDisambiguationChoiceOriginal(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    try {
      // Handle SKIP option first
      if (selectedOption.type === 'skip') {
        return this.handleSkipOption(pendingAction, selectedOption);
      }

      // Handle list selection for multi-items
      if ((pendingAction as any).type === 'select_list_for_multi_items') {
        return this.handleListSelectionForMultiItems(pendingAction, selectedOption);
      }

      // Handle multi-item sequential processing
      if (isMultiItemPendingAction(pendingAction)) {
        return this.handleMultiItemChoice(pendingAction, selectedOption);
      }

      // Handle single-item cases
      if (pendingAction.type === 'select_list') {
        return this.handleListSelection(pendingAction, selectedOption);
      }

      // Handle article disambiguation for single items
      if (selectedOption.type === 'existing' && selectedOption.article) {
        return this.executeActionWithArticle(pendingAction, selectedOption.article);
      } else {
        return this.executeActionWithNewArticle(pendingAction);
      }

    } catch (error) {
      console.error('Error in handleDisambiguationChoiceOriginal:', error);
      throw error;
    }
  }

  private getFallbackExecutionResult(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): AIExecutionResult {
    this.logger.warn('ai', 'Using fallback execution result');

    return {
      success: false,
      message: '🔧 Service temporarily unavailable. Please try again in a moment.',
      suggestedAction: 'Retry your request or use manual article creation.'
    };
  }

  // ========================================
  // OPTION BUILDING METHODS
  // ========================================

  private addExistingArticleOptions(options: DisambiguationOption[], similarArticles: any[]): void {
    for (const item of similarArticles) {
      options.push({
        id: `existing_${item.article.id}`,
        displayName: item.article.name,
        type: 'existing',
        article: item.article,
        confidence: item.similarity,
        department: item.article.departmentId,
        icon: item.article.icon
      });
    }
  }

  private async addCreateNewOption(
    options: DisambiguationOption[],
    similarArticles: any[],
    itemName: string
  ): Promise<void> {
    const hasExactMatch = similarArticles.some(item =>
      item.article.name.toLowerCase().trim() === itemName.toLowerCase().trim()
    );

    if (!hasExactMatch) {
      const suggestions = await this.getEnhancedSuggestions(itemName);
      const departmentName = this.departmentService.getDepartmentName(
        suggestions.departmentId,
        'german'
      );

      options.push({
        id: 'new_article',
        displayName: `"${itemName}" (neu erstellen)`,
        type: 'new',
        confidence: 1.0,
        icon: suggestions.icon,
        department: departmentName,
        suggestedDepartmentId: suggestions.departmentId,
        preview: `${departmentName} ${suggestions.icon}`
      });
    }
  }

  private async getEnhancedSuggestions(itemName: string): Promise<{departmentId: string, icon: string}> {
    const cacheKey = this.cachingService.createSuggestionsKey(itemName);

    const result = await this.cachingService.getOrSet(
      cacheKey,
      async () => {
        try {
          const smartSuggestions = await this.smartSuggestions.getSmartSuggestions(itemName);
          if (smartSuggestions) {
            return {
              departmentId: smartSuggestions.departmentId,
              icon: smartSuggestions.icon
            };
          }
        } catch (error) {
          console.warn('Smart suggestions failed, using mapping service:', error);
        }

        // Always return a valid object
        return {
          departmentId: suggestDepartment(itemName),
          icon: suggestIcon(itemName)
        };
      },
      5 * 60 * 1000 // 5 minutes TTL for suggestions
    ).toPromise();

    // Ensure we always return a valid object, never undefined
    return result || {
      departmentId: suggestDepartment(itemName),
      icon: suggestIcon(itemName)
    };
  }

  // ========================================
  // CHOICE HANDLING METHODS
  // ========================================

  private async handleSkipOption(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    if (isMultiItemPendingAction(pendingAction)) {
      return this.handleSequentialSkip(pendingAction, selectedOption);
    }

    const itemName = pendingAction.itemName;
    let message = `⏭️ "${itemName}" übersprungen`;

    if (selectedOption.skipReason) {
      message += ` (${selectedOption.skipReason})`;
    }

    return {
      success: true,
      message: message
    };
  }

  private async handleSequentialSkip(
    action: MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    return this.multiItemProcessor.handleSequentialSkip(
      action,
      selectedOption,
      (itemName) => this.getDisambiguationOptions(itemName),
      (itemName) => this.getEnhancedSuggestions(itemName),
      (articleId, listId, amount) => this.articleExecution.addArticleToList(articleId, listId, amount)
    );
  }

  private async handleMultiItemChoice(
    pendingAction: MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    return this.multiItemProcessor.handleMultiItemChoice(
      pendingAction,
      selectedOption,
      (itemName) => this.getDisambiguationOptions(itemName),
      (itemName) => this.getEnhancedSuggestions(itemName),
      (articleId, listId, amount) => this.articleExecution.addArticleToList(articleId, listId, amount)
    );
  }

  // ========================================
  // MULTI-ITEM PROCESSING METHODS
  // ========================================

  /**
   * Processes multiple items sequentially with disambiguation
   *
   * Handles multi-item additions by processing each item one at a time,
   * requesting disambiguation when needed. Maintains context across items.
   *
   * @param action - Multi-item pending action containing array of items to process
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
   *   currentIndex: 0,
   *   listId: 'list-123',
   *   listName: 'Einkaufen',
   *   processedItems: []
   * };
   *
   * const result = await service.processMultiItemSequentially(action);
   * // First call: Returns disambiguation for "Milch"
   * // After user selects: Processes "Milch", returns disambiguation for "Brot"
   * // Continues until all items processed
   * ```
   *
   * @see {@link processCurrentItemAndContinue} for single item processing
   * @see {@link MultiItemPendingAction} for action structure
   */
  /**
   * Processes multiple items sequentially with disambiguation
   *
   * Delegates to MultiItemProcessorService for implementation.
   *
   * @param action - Multi-item pending action
   * @returns Promise resolving to execution result
   */
  async processMultiItemSequentially(action: MultiItemPendingAction): Promise<AIExecutionResult> {
    return this.multiItemProcessor.processMultiItemSequentially(
      action,
      (itemName) => this.getDisambiguationOptions(itemName),
      (itemName) => this.getEnhancedSuggestions(itemName),
      (articleId, listId, amount) => this.articleExecution.addArticleToList(articleId, listId, amount)
    );
  }

  /**
   * Processes the current item in a multi-item sequence and continues to the next
   *
   * Delegates to MultiItemProcessorService for implementation.
   *
   * @param action - Multi-item pending action
   * @param selectedArticle - Article selected by user (null if creating new)
   * @returns Promise resolving to next step in sequence
   */
  async processCurrentItemAndContinue(
    action: MultiItemPendingAction,
    selectedArticle: Article | null
  ): Promise<AIExecutionResult> {
    return this.multiItemProcessor.processCurrentItemAndContinue(
      action,
      selectedArticle,
      (itemName) => this.getDisambiguationOptions(itemName),
      (itemName) => this.getEnhancedSuggestions(itemName),
      (articleId, listId, amount) => this.articleExecution.addArticleToList(articleId, listId, amount)
    );
  }

  // ========================================
  // LIST OPERATIONS
  // ========================================

  /**
   * Handles user's list selection
   *
   * Processes when user selects a list from available options, typically after
   * creating or adding an article that needs to be assigned to a list.
   *
   * @param pendingAction - Pending action containing article data
   * @param selectedOption - Selected list option (ID should start with 'list_')
   * @returns Promise resolving to execution result after adding article to list
   *
   * @example
   * ```typescript
   * const pendingAction: PendingAction = {
   *   type: 'add_to_list_after_creation',
   *   itemName: 'Milch',
   *   articleToAdd: { id: 'article-123', name: 'Milch', ... }
   * };
   *
   * const selectedOption: DisambiguationOption = {
   *   id: 'list_456',
   *   displayText: 'Einkaufen',
   *   type: 'list'
   * };
   *
   * const result = await service.handleListSelection(pendingAction, selectedOption);
   * ```
   *
   * @see {@link getListSelectionOptions} for getting available lists
   */
  async handleListSelection(pendingAction: PendingAction, selectedOption: DisambiguationOption): Promise<AIExecutionResult> {
    try {
      const listId = selectedOption.id.replace('list_', '');
      const targetList = await this.listSelection.findListById(listId);

      if (!targetList) {
        return {
          success: false,
          message: '❌ Ausgewählte Liste nicht gefunden.'
        };
      }

      const articleData = pendingAction.articleToAdd!;

      // Handle multiple articles
      const multipleArticleIds = (pendingAction as any).multipleArticleIds;
      if (multipleArticleIds && Array.isArray(multipleArticleIds)) {
        return this.addMultipleArticlesToList(targetList, multipleArticleIds, pendingAction);
      }

      // Single article handling
      return this.addSingleArticleToList(targetList, articleData, pendingAction);

    } catch (error) {
      console.error('List selection error:', error);
      return {
        success: false,
        message: `❌ Fehler beim Hinzufügen zur Liste: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  async handleListSelectionForMultiItems(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    try {
      const listId = selectedOption.id.replace('list_', '');
      const targetList = await this.listSelection.findListById(listId);

      if (!targetList) {
        return { success: false, message: '❌ Ausgewählte Liste nicht gefunden.' };
      }

      const multiItemData = (pendingAction as any).multiItemData;
      if (!multiItemData || !multiItemData.items) {
        return { success: false, message: '❌ Fehler: Multi-Item Daten nicht gefunden.' };
      }

      const multiAction: any = {
        type: multiItemData.command === 'create_list_with_items' ? 'create_list_with_multiple_items' : 'add_multiple_items',
        originalInput: multiItemData.originalInput,
        itemName: multiItemData.items[0]?.itemName || '',
        extractedQuantity: multiItemData.items[0]?.quantity || '',
        items: multiItemData.items,
        listName: targetList.name,
        currentItemIndex: 0,
        processedItems: [],
        suggestedDepartment: suggestDepartment(multiItemData.items[0]?.itemName || ''),
        conversationListId: targetList.id,
        confirmedTargetListId: targetList.id,
        confirmedTargetListName: targetList.name
      };

      return this.processMultiItemSequentially(multiAction);
    } catch (error) {
      return {
        success: false,
        message: `❌ Fehler bei der Listenauswahl: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  /**
   * Gets available lists for selection
   *
   * Returns all shopping lists as selection options, formatted for display
   * in a disambiguation-style UI.
   *
   * @returns Promise resolving to array of list selection options
   *
   * @example
   * ```typescript
   * const listOptions = await service.getListSelectionOptions();
   * // Returns: [
   * //   { id: 'list-1', displayText: 'Einkaufen', listName: 'Einkaufen', color: '#4CAF50' },
   * //   { id: 'list-2', displayText: 'REWE', listName: 'REWE', color: '#FF9800' }
   * // ]
   * ```
   *
   * @see {@link handleListSelection} for processing user's list choice
   */
  async getListSelectionOptions(): Promise<ListSelectionOption[]> {
    return this.listSelection.getListSelectionOptions();
  }

  /**
   * Converts list selection options to disambiguation options format
   *
   * Transforms ListSelectionOption[] into DisambiguationOption[] for consistent UI.
   *
   * @param listOptions - Array of list selection options
   * @returns Array of disambiguation options formatted for display
   */
  convertListsToDisambiguationOptions(listOptions: ListSelectionOption[]): DisambiguationOption[] {
    return this.listSelection.convertListsToDisambiguationOptions(listOptions);
  }

  // ========================================
  // ARTICLE EXECUTION METHODS (Delegated)
  // ========================================

  /**
   * Executes action with an existing article
   *
   * Delegates to ArticleExecutionService for implementation.
   */
  private async executeActionWithArticle(action: PendingAction, article: Article): Promise<AIExecutionResult> {
    return this.articleExecution.executeActionWithArticle(
      action,
      article,
      (itemName) => this.getEnhancedSuggestions(itemName),
      () => this.getListSelectionOptions(),
      (options) => this.convertListsToDisambiguationOptions(options)
    );
  }

  /**
   * Executes action by creating a new article
   *
   * Delegates to ArticleExecutionService for implementation.
   */
  private async executeActionWithNewArticle(pendingAction: PendingAction): Promise<AIExecutionResult> {
    return this.articleExecution.executeActionWithNewArticle(
      pendingAction,
      (itemName) => this.getEnhancedSuggestions(itemName),
      () => this.getListSelectionOptions(),
      (options) => this.convertListsToDisambiguationOptions(options)
    );
  }

  // ========================================
  // HELPER METHODS (Delegated)
  // ========================================

  /**
   * Adds an article to a list
   *
   * Delegates to ArticleExecutionService for implementation.
   */
  private async addArticleToList(articleId: string, listId: string, amount: string): Promise<void> {
    return this.articleExecution.addArticleToList(articleId, listId, amount);
  }

  /**
   * Adds multiple articles to a list
   *
   * Delegates to ArticleExecutionService for implementation.
   */
  private async addMultipleArticlesToList(
    targetList: any,
    multipleArticleIds: string[],
    pendingAction: PendingAction
  ): Promise<AIExecutionResult> {
    return this.articleExecution.addMultipleArticlesToList(targetList, multipleArticleIds, pendingAction);
  }

  /**
   * Adds a single article to a list
   *
   * Delegates to ArticleExecutionService for implementation.
   */
  private async addSingleArticleToList(
    targetList: any,
    articleData: any,
    pendingAction: PendingAction
  ): Promise<AIExecutionResult> {
    return this.articleExecution.addSingleArticleToList(
      targetList,
      articleData,
      pendingAction,
      (itemName) => this.getDisambiguationOptions(itemName),
      (itemName) => this.getEnhancedSuggestions(itemName)
    );
  }

}
