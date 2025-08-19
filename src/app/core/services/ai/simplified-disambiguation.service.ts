// src/app/core/services/ai/simplified-disambiguation.service.ts
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
} from './ai-models';
import { Article, ShoppingList } from '../../models';
import { DataService } from '../data.service';
import { DepartmentService } from '../department.service';
import { SmartSuggestionsService } from './smart-suggestions.service';
import { DepartmentIconMappingService } from './department-icon-mapping.service';
import { LoggerService } from '../logger.service';
import { PerformanceMonitorService } from './performance-monitor.service';
import { AICachingService } from './caching.service';
import { AIErrorHandlerService, ErrorContext, ValidationRules } from './error-handler.service';

@Injectable({
  providedIn: 'root'
})
export class SimplifiedDisambiguationService {

  constructor(
    private dataService: DataService,
    private departmentService: DepartmentService,
    private smartSuggestions: SmartSuggestionsService,
    private departmentIconMapping: DepartmentIconMappingService,
    private cachingService: AICachingService,
    private errorHandler: AIErrorHandlerService,
    private performanceMonitor: PerformanceMonitorService,
    private logger: LoggerService
  ) {}

  // ========================================
  // MAIN DISAMBIGUATION METHODS
  // ========================================

  async getDisambiguationOptions(itemName: string, excludeId?: string): Promise<DisambiguationOption[]> {
    this.performanceMonitor.startOperation('getDisambiguationOptions');
    
    try {
      // Validate input
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
        2 * 60 * 1000 // 2 minutes TTL
      ).toPromise();
      
      const finalResult = result || [];
      this.performanceMonitor.endOperation('getDisambiguationOptions', true, !!result); // Cache hit if result existed
      return finalResult;
      
    } catch (error) {
      this.performanceMonitor.endOperation('getDisambiguationOptions', false, false, error instanceof Error ? error.message : 'Unknown error');
      console.error('Error in getDisambiguationOptions:', error);
      return [];
    }
  }
  
  private async getDisambiguationOptionsFromSource(itemName: string, excludeId?: string): Promise<DisambiguationOption[]> {
    try {
      const articles = await this.dataService.getArticles().pipe(take(1)).toPromise();
      const options: DisambiguationOption[] = [];
  
      if (!articles) return options;
  
      // Get similar existing articles
      const similarArticles = this.findSimilarArticles(articles, itemName, excludeId);
      
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

  async handleDisambiguationChoice(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    this.performanceMonitor.startOperation('handleDisambiguationChoice');
    
    try {
      console.log('🎯 Handling disambiguation choice:', { pendingAction, selectedOption });
      
      const result = await this.handleDisambiguationChoiceInternal(pendingAction, selectedOption);
      
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

  private async handleDisambiguationChoiceInternal(
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
      console.error('Error in handleDisambiguationChoiceInternal:', error);
      throw error; // Re-throw to be caught by parent method
    }
  }

  // ========================================
  // ARTICLE SIMILARITY METHODS
  // ========================================

  private findSimilarArticles(articles: Article[], itemName: string, excludeId?: string) {
    const searchTerm = itemName.toLowerCase().trim();

    return articles
      .filter(article => article.id !== excludeId)
      .map(article => {
        const similarity = this.calculateArticleSimilarity(searchTerm, article.name.toLowerCase());
        return { article, similarity };
      })
      .filter(item => item.similarity >= MIN_SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
  }

  private calculateArticleSimilarity(searchTerm: string, articleName: string): number {
    // Exact match
    if (articleName === searchTerm) return 1.0;
    
    // Contains match
    if (articleName.includes(searchTerm) || searchTerm.includes(articleName)) return 0.8;
    
    // Levenshtein similarity
    return this.calculateLevenshteinSimilarity(searchTerm, articleName);
  }

  private calculateLevenshteinSimilarity(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLength);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
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
          departmentId: this.departmentIconMapping.suggestDepartment(itemName),
          icon: this.departmentIconMapping.suggestIcon(itemName)
        };
      },
      5 * 60 * 1000 // 5 minutes TTL for suggestions
    ).toPromise();
    
    // Ensure we always return a valid object, never undefined
    return result || {
      departmentId: this.departmentIconMapping.suggestDepartment(itemName),
      icon: this.departmentIconMapping.suggestIcon(itemName)
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

  async handleListSelection(pendingAction: PendingAction, selectedOption: DisambiguationOption): Promise<AIExecutionResult> {
    try {
      const listId = selectedOption.id.replace('list_', '');
      const targetList = await this.findListById(listId);
  
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
      const targetList = await this.findListById(listId);
  
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
        suggestedDepartment: this.departmentIconMapping.suggestDepartment(multiItemData.items[0]?.itemName || ''),
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

  async getListSelectionOptions(): Promise<ListSelectionOption[]> {
    try {
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      if (!lists) return [];

      return lists.map(list => ({
        id: list.id,
        name: list.name,
        color: list.color || '#1a9edb',
        icon: list.icon || '🛒',
        itemCount: list.articleIds?.length || 0
      }));
    } catch (error) {
      console.error('Error getting list selection options:', error);
      return [];
    }
  }

  convertListsToDisambiguationOptions(listOptions: ListSelectionOption[]): DisambiguationOption[] {
    return listOptions.map(list => ({
      id: `list_${list.id}`,
      displayName: list.name,
      type: 'existing' as const,
      confidence: 1.0,
      department: `${list.itemCount} ${list.itemCount === 1 ? 'Artikel' : 'Artikel'}`,
      icon: list.icon
    }));
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
      return this.findListByName(targetInfo.listName);
    }
    
    return null;
  }

  private async addArticleToList(articleId: string, listId: string, amount: string): Promise<void> {
    const targetList = await this.findListById(listId);
    if (!targetList) {
      throw new Error(`Target list not found: ${listId}`);
    }

    const updatedArticleIds = [...targetList.articleIds];
    if (!updatedArticleIds.includes(articleId)) {
      updatedArticleIds.push(articleId);
    }

    const updatedItemStates = { ...targetList.itemStates };
    updatedItemStates[articleId] = {
      articleId: articleId,
      isChecked: false,
      amount: amount
    };

    const updateResult = await this.dataService.updateList(targetList.id, {
      articleIds: updatedArticleIds,
      itemStates: updatedItemStates
    }).pipe(take(1)).toPromise();

    if (!updateResult) {
      throw new Error(`Failed to add article to list`);
    }
  }

  private async findListByName(listName: string): Promise<ShoppingList | null> {
    try {
      const lists = await this.dataService.getLists().pipe(
        take(1),
        timeout(5000)
      ).toPromise();
      
      if (!lists) return null;
      
      const normalizedQuery = listName.toLowerCase().trim();
      
      // Exact match first
      let match = lists.find(list => 
        list.name.toLowerCase() === normalizedQuery
      );
      
      if (match) return match;
      
      // Partial match
      match = lists.find(list => 
        list.name.toLowerCase().includes(normalizedQuery) ||
        normalizedQuery.includes(list.name.toLowerCase())
      );
      
      return match || null;
    } catch (error) {
      console.error('Error finding list by name:', error);
      return null;
    }
  }

  private async findListById(listId: string): Promise<any> {
    try {
      const lists = await this.dataService.getLists().pipe(take(1), timeout(5000)).toPromise();
      return lists?.find(list => list.id === listId) || null;
    } catch (error) {
      return null;
    }
  }

  private async addMultipleArticlesToList(
    targetList: any, 
    multipleArticleIds: string[], 
    pendingAction: PendingAction
  ): Promise<AIExecutionResult> {
    const updatedArticleIds = [...targetList.articleIds];
    const updatedItemStates = { ...targetList.itemStates };
    
    for (const articleId of multipleArticleIds) {
      if (!updatedArticleIds.includes(articleId)) {
        updatedArticleIds.push(articleId);
      }
      
      updatedItemStates[articleId] = {
        articleId: articleId,
        isChecked: false,
        amount: ''
      };
    }

    const updateResult = await this.dataService.updateList(targetList.id, {
      articleIds: updatedArticleIds,
      itemStates: updatedItemStates
    }).pipe(take(1)).toPromise();

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
      const targetList = await this.findListByName(singleList.name);
      
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
      message: `🎯 Zu welcher Liste soll "${article.name}"${quantityText} hinzugefügt werden?`,
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
      const targetList = await this.findListByName(singleList.name);
      
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
      message: `🎯 Artikel "${newArticle.name}" wurde erstellt.\n\nZu welcher Liste soll er${quantityText} hinzugefügt werden?`,
      needsUserInput: true,
      disambiguationOptions: this.convertListsToDisambiguationOptions(listOptions),
      pendingAction: listSelectionAction
    };
  }

}