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
    private listSelection: ListSelectionService
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
    const currentItem = action.items[action.currentItemIndex];

    const skippedItem: ProcessedItem = {
      item: currentItem,
      skipped: true,
      skipReason: selectedOption.skipReason || 'Übersprungen',
      originalText: currentItem.itemName
    };

    action.processedItems.push(skippedItem);
    action.currentItemIndex++;

    return this.processMultiItemSequentially(action);
  }

  private async handleMultiItemChoice(
    pendingAction: MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    let selectedArticle: Article | null = null;

    if (selectedOption.type === 'existing' && selectedOption.article) {
      selectedArticle = selectedOption.article;
    }

    return this.processCurrentItemAndContinue(pendingAction, selectedArticle);
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
  async processMultiItemSequentially(action: MultiItemPendingAction): Promise<AIExecutionResult> {
    console.log(`🎯 Processing item ${action.currentItemIndex + 1}/${action.items.length}`);

    // Safety checks
    if (!action.items || action.items.length === 0) {
      return { success: false, message: '❌ Keine Artikel zu verarbeiten.' };
    }

    if (action.currentItemIndex > 20) {
      console.error('🎯 SAFETY: Too many iterations - stopping');
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
      const disambiguationOptions = await this.getDisambiguationOptions(currentItem.itemName);
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
      return this.processCurrentItemAndContinue(action, null);

    } catch (error) {
      console.error('🎯 Error in sequential processing:', error);

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
          this.processMultiItemSequentially(action).then(resolve);
        }, 0);
      });
    }
  }

  /**
   * Processes the current item in a multi-item sequence and continues to the next
   *
   * Handles article creation (if needed), adds to list, and continues sequential processing.
   * This method is tightly coupled with processMultiItemSequentially and should remain in this service.
   *
   * @param action - Multi-item pending action
   * @param selectedArticle - Article selected by user (null if creating new)
   * @returns Promise resolving to next step in sequence
   */
  async processCurrentItemAndContinue(
    action: MultiItemPendingAction,
    selectedArticle: Article | null
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
        const suggestions = await this.getEnhancedSuggestions(currentItem.itemName);
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
      await this.addArticleToList(articleId, targetListId, currentItem.quantity || '');

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

      return this.processMultiItemSequentially(action);

    } catch (error) {
      console.error('🎯 ERROR PROCESSING CURRENT ITEM:', error);

      const failedItem: any = {
        item: currentItem,
        failed: true,
        error: error instanceof Error ? error.message : 'Unknown error',
        originalText: currentItem.itemName
      };

      action.processedItems.push(failedItem);
      action.currentItemIndex++;

      return this.processMultiItemSequentially(action);
    }
  }

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

  private buildFinalMessage(
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
  // ARTICLE EXECUTION METHODS
  // ========================================

  private async executeActionWithArticle(action: PendingAction, article: Article): Promise<AIExecutionResult> {
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
        return this.handleNoTargetList(action, article);
      }

    } catch (error) {
      console.error('🎯 Error executing action with existing article:', error);
      return {
        success: false,
        message: `❌ Fehler beim Hinzufügen von "${article.name}".`
      };
    }
  }

  private async executeActionWithNewArticle(pendingAction: PendingAction): Promise<AIExecutionResult> {
    try {
      // Create new article with enhanced suggestions
      const suggestions = await this.getEnhancedSuggestions(pendingAction.itemName);
      const articleData = {
        name: pendingAction.itemName,
        amount: pendingAction.extractedQuantity || '',
        departmentId: suggestions.departmentId,
        icon: suggestions.icon
      };

      const newArticle = await this.dataService.createArticle(articleData).toPromise();

      if (!newArticle) {
        return {
          success: false,
          message: `❌ Fehler beim Erstellen des Artikels "${pendingAction.itemName}".`
        };
      }

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
        return this.handleNoTargetListForNewArticle(pendingAction, newArticle);
      }

    } catch (error) {
      console.error('🎯 Error executing action with new article:', error);
      return {
        success: false,
        message: `❌ Fehler beim Erstellen des Artikels "${pendingAction.itemName}".`
      };
    }
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  private getTargetListInfo(action: PendingAction): {listName?: string, listId?: string} {
    return {
      listName: action.listName,
      listId: (action as any).conversationListId
    };
  }

  private async findTargetList(targetInfo: {listName?: string, listId?: string}): Promise<any> {
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

  private async addArticleToList(articleId: string, listId: string, amount: string): Promise<void> {
    // Use repository's addArticleToList for optimistic UI updates
    const result = await this.dataService.addArticleToList(listId, articleId).pipe(take(1)).toPromise();

    if (!result) {
      throw new Error(`Failed to add article to list`);
    }

    // Update amount if specified
    if (amount) {
      await this.dataService.updateListItemAmount(listId, articleId, amount).pipe(take(1)).toPromise();
    }
  }

  private async addMultipleArticlesToList(
    targetList: any,
    multipleArticleIds: string[],
    pendingAction: PendingAction
  ): Promise<AIExecutionResult> {
    // Use repository's addMultipleArticlesToList for optimistic UI updates and race condition prevention
    const updateResult = await this.dataService.addMultipleArticlesToList(targetList.id, multipleArticleIds)
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

  private async addSingleArticleToList(
    targetList: any,
    articleData: any,
    pendingAction: PendingAction
  ): Promise<AIExecutionResult> {
    let articleId = articleData.id;

    if (!articleId) {
      // Check for disambiguation BEFORE creating new article
      const disambiguationOptions = await this.getDisambiguationOptions(articleData.name);
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
      const suggestions = await this.getEnhancedSuggestions(articleData.name);
      const newArticle = await this.dataService.createArticle({
        name: articleData.name,
        amount: articleData.amount || '',
        departmentId: suggestions.departmentId,
        icon: suggestions.icon
      }).pipe(take(1), timeout(5000)).toPromise();

      if (!newArticle) {
        return {
          success: false,
          message: '❌ Fehler beim Erstellen des Artikels.'
        };
      }
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

  private async handleNoTargetList(action: PendingAction, article: Article): Promise<AIExecutionResult> {
    const listOptions = await this.getListSelectionOptions();

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

    const quantityText = action.extractedQuantity ? ` (${action.extractedQuantity})` : '';
    return {
      success: true,
      message: `Bitte wähle eine Liste.`,
      needsUserInput: true,
      disambiguationOptions: this.convertListsToDisambiguationOptions(listOptions),
      pendingAction: listSelectionAction
    };
  }

  private async handleNoTargetListForNewArticle(pendingAction: PendingAction, newArticle: Article): Promise<AIExecutionResult> {
    const listOptions = await this.getListSelectionOptions();

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

    const quantityText = pendingAction.extractedQuantity ? ` (${pendingAction.extractedQuantity})` : '';
    return {
      success: true,
      message: `Bitte wähle eine Liste.`,
      needsUserInput: true,
      disambiguationOptions: this.convertListsToDisambiguationOptions(listOptions),
      pendingAction: listSelectionAction
    };
  }

}
