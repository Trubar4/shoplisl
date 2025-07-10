// src/app/core/services/ai/disambiguation.service.ts - FIXED VERSION
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  DisambiguationOption,
  PendingAction,
  MultiItemPendingAction,
  ProcessedItem, 
  AIExecutionResult,
  ListSelectionOption,
  isMultiItemPendingAction,
  DISAMBIGUATION_THRESHOLD,
  MIN_SIMILARITY_THRESHOLD,
  DisambiguationError
} from './ai-models';
import { Article, ShoppingList } from '../../models';
import { DataService } from '../data';

@Injectable({
  providedIn: 'root'
})
export class DisambiguationService {

  constructor(
    private dataService: DataService
  ) {}

  // ========================================
  // MAIN DISAMBIGUATION METHODS
  // ========================================

  async getDisambiguationOptions(itemName: string, excludeId?: string): Promise<DisambiguationOption[]> {
    console.log('🔍 Getting disambiguation options for:', itemName);
    
    try {
      const articles = await this.dataService.getArticles().pipe(take(1)).toPromise();
      const options: DisambiguationOption[] = [];
  
      if (!articles) return options;
  
      const searchTerm = itemName.toLowerCase().trim();
  
      const similarArticles = articles
        .filter(article => article.id !== excludeId)
        .map(article => {
          const articleName = article.name.toLowerCase();
          
          const exactMatch = articleName === searchTerm ? 1.0 : 0;
          const containsMatch = articleName.includes(searchTerm) || searchTerm.includes(articleName) ? 0.8 : 0;
          const levenshteinSim = this.calculateSimilarity(searchTerm, articleName);
          
          const similarity = Math.max(exactMatch, containsMatch, levenshteinSim);
          
          return { article, similarity };
        })
        .filter(item => item.similarity >= MIN_SIMILARITY_THRESHOLD)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3); // FIXED: Only show top 4 options
  
      // Add existing articles as options
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
  
      // Always add option to create new article
      options.push({
        id: 'new_article',
        displayName: `"${itemName}" (neu erstellen)`,
        type: 'new',
        confidence: 1.0,
        icon: '✨'
      });
  
      return options;
      
    } catch (error) {
      console.error('Error getting disambiguation options:', error);
      throw new DisambiguationError('Failed to get disambiguation options', { itemName, error });
    }
  }

  // ========================================
  // MULTI-ITEM SEQUENTIAL PROCESSING - FIXED
  // ========================================

  async processMultiItemSequentially(action: MultiItemPendingAction): Promise<AIExecutionResult> {
    console.log('🎯 PROCESSING MULTI-ITEM SEQUENTIALLY - FIXED VERSION');
    console.log(`🎯 Processing item ${action.currentItemIndex + 1}/${action.items.length}`);
    console.log('🎯 Action state:', {
      currentIndex: action.currentItemIndex,
      totalItems: action.items.length,
      processedCount: action.processedItems.length,
      listName: action.listName,
      conversationListId: (action as any).conversationListId
    });
    
    // CRITICAL FIX: Check completion condition first
    if (action.currentItemIndex >= action.items.length) {
      console.log('🎯 All items processed - executing final action');
      return this.executeMultiItemFinalAction(action);
    }

    const currentItem = action.items[action.currentItemIndex];
    if (!currentItem) {
      console.log('🎯 No current item found - executing final action');
      return this.executeMultiItemFinalAction(action);
    }
  
    console.log(`🎯 PROCESSING ITEM ${action.currentItemIndex + 1}/${action.items.length}:`, currentItem);
  
    try {
      // Get disambiguation options for current item
      const disambiguationOptions = await this.getDisambiguationOptions(currentItem.itemName);
          
      // Check if disambiguation is needed (existing articles found)
      const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');
      
      if (existingOptions.length > 0) {
        console.log('🎯 Disambiguation needed for:', currentItem.itemName);
        
        // CRITICAL: Mark as sequential processing for UI
        (action as any).isMultiItemSequential = true;
        (action as any).isFromRecipe = true;
        
        // Generate simplified message for sequential processing
        const message = `"${currentItem.itemName}" Ich habe ähnliche Artikel gefunden. Welchen möchtest du verwenden?`;
        
        return {
          success: true,
          message,
          needsUserInput: true,
          disambiguationOptions,
          pendingAction: action
        };
      }
  
      // No disambiguation needed - create new article and continue automatically
      console.log('🎯 No disambiguation needed - creating new article and continuing');
      return this.processCurrentItemAndContinue(action, null);
      
    } catch (error) {
      console.error('🎯 Error in sequential processing:', error);
      
      // Add failed item and continue
      const failedItem: ProcessedItem = {
        item: currentItem,
        failed: true,
        error: error instanceof Error ? error.message : 'Unknown error',
        originalText: currentItem.itemName
      };
      
      action.processedItems.push(failedItem);
      action.currentItemIndex++;
      
      // Continue with next item
      return this.processMultiItemSequentially(action);
    }
  }

  // ========================================
  // ITEM PROCESSING - FIXED
  // ========================================

  async processCurrentItemAndContinue(
    action: MultiItemPendingAction,
    selectedArticle: Article | null
  ): Promise<AIExecutionResult> {
    const currentItem = action.items[action.currentItemIndex];
    
    console.log('🎯 Processing current item and continuing:', currentItem);
    console.log('🎯 Selected article:', selectedArticle?.name || 'NEW');
    
    try {
      let articleId: string;
      
      if (selectedArticle) {
        // Use existing article
        console.log('🎯 Using existing article:', selectedArticle.name);
        articleId = selectedArticle.id;
        
        // Update quantity if specified
        if (currentItem.quantity) {
          await this.dataService.updateArticle(articleId, {
            ...selectedArticle,
            amount: currentItem.quantity
          }).toPromise();
        }
      } else {
        // Create new article
        console.log('🎯 Creating new article for:', currentItem.itemName);
        const newArticle = await this.dataService.createArticle({
          name: currentItem.itemName,
          amount: currentItem.quantity || '',
          departmentId: this.suggestDepartment(currentItem.itemName),
          icon: this.suggestIcon(currentItem.itemName)
        }).toPromise();
        
        if (!newArticle) {
          throw new Error(`Failed to create article: ${currentItem.itemName}`);
        }
        
        articleId = newArticle.id;
        console.log('✅ Created new article:', newArticle.name, 'ID:', articleId);
      }
  
      // CRITICAL FIX: Add to processed items with correct structure
      const processedItem: ProcessedItem = {
        item: currentItem,
        articleId,
        disambiguationResolved: true,
        quantity: currentItem.quantity,
        originalText: currentItem.itemName
      };
      
      action.processedItems.push(processedItem);
      console.log(`✅ Added item ${action.currentItemIndex + 1}/${action.items.length} to processed items`);
      console.log('✅ Processed items so far:', action.processedItems.length);
  
      // CRITICAL FIX: Move to next item
      action.currentItemIndex++;
      console.log(`🎯 Moving to next item: ${action.currentItemIndex + 1}/${action.items.length}`);
  
      // CRITICAL FIX: Continue processing next item recursively
      return this.processMultiItemSequentially(action);
  
    } catch (error) {
      console.error('🎯 ERROR PROCESSING CURRENT ITEM:', error);
      
      // Add failed item but continue processing
      const failedItem: ProcessedItem = {
        item: currentItem,
        failed: true,
        error: error instanceof Error ? error.message : 'Unknown error',
        originalText: currentItem.itemName
      };
      
      action.processedItems.push(failedItem);
      action.currentItemIndex++;
      
      // Continue with next item
      return this.processMultiItemSequentially(action);
    }
  }

  // ========================================
  // FINAL ACTION EXECUTION - FIXED
  // ========================================

  private async executeMultiItemFinalAction(action: MultiItemPendingAction): Promise<AIExecutionResult> {
    console.log('🎯 EXECUTING FINAL MULTI-ITEM ACTION - FIXED VERSION');
    console.log('🎯 Final processed items:', action.processedItems);
    
    const processedItems = action.processedItems.filter(p => p.articleId && !p.skipped && !p.failed);
    const skippedItems = action.processedItems.filter(p => p.skipped);
    const failedItems = action.processedItems.filter(p => p.failed);
    
    console.log('🎯 Final summary:', {
      total: action.processedItems.length,
      processed: processedItems.length,
      skipped: skippedItems.length, 
      failed: failedItems.length
    });
    
    if (processedItems.length === 0 && skippedItems.length === 0) {
      return {
        success: false,
        message: '❌ Keine Artikel konnten verarbeitet werden.'
      };
    }
    
    // CRITICAL FIX: Get all article IDs that need to be added
    const articleIds = processedItems.map(p => p.articleId!);
    console.log('🎯 Article IDs to add:', articleIds);
    
    try {
      // CRITICAL FIX: Determine target list with better logic
      let targetList: any = null;
      
      console.log('🎯 Determining target list...');
      console.log('🎯 - action.listName:', action.listName);
      console.log('🎯 - conversationListId:', (action as any).conversationListId);
      
      // Try by conversation list ID first (most reliable)
      if ((action as any).conversationListId) {
        console.log('🎯 Searching by conversation list ID:', (action as any).conversationListId);
        const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
        targetList = lists?.find(list => list.id === (action as any).conversationListId);
        if (targetList) {
          console.log('✅ Found target list by conversation ID:', targetList.name);
        }
      }
      
      // Try by list name if ID search failed
      if (!targetList && action.listName) {
        console.log('🎯 Searching by list name:', action.listName);
        targetList = await this.findListByName(action.listName);
        if (targetList) {
          console.log('✅ Found target list by name:', targetList.name);
        }
      }
      
      // Get first available list as fallback
      if (!targetList) {
        console.log('🎯 No specific target list found, getting available lists...');
        const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
        console.log('🎯 Available lists:', lists?.map(l => ({ id: l.id, name: l.name })));
        
        if (lists && lists.length === 1) {
          // Only one list available - use it
          targetList = lists[0];
          console.log('🎯 Using only available list:', targetList.name);
        } else if (lists && lists.length > 1) {
          // Multiple lists - need user selection
          console.log('🎯 Multiple lists available - requesting selection');
          
          const listOptions = await this.getListSelectionOptions();
          
          return {
            success: true,
            message: `🎯 ${processedItems.length} Artikel erstellt. Zu welcher Liste sollen sie hinzugefügt werden?`,
            needsUserInput: true,
            disambiguationOptions: this.convertListsToDisambiguationOptions(listOptions),
            pendingAction: {
              type: 'select_list',
              originalInput: action.originalInput,
              itemName: `${processedItems.length} Artikel`,
              multipleArticleIds: articleIds,
              processedItems: action.processedItems
            } as any
          };
        } else {
          return {
            success: false,
            message: '❌ Keine Listen gefunden! Erstelle zuerst eine Liste.'
          };
        }
      }
      
      // CRITICAL FIX: Add all articles to the target list at once
      if (targetList && articleIds.length > 0) {
        console.log(`🎯 Adding ${articleIds.length} articles to list "${targetList.name}"`);
        
        // Get current list state
        const updatedArticleIds = [...(targetList.articleIds || [])];
        const updatedItemStates = { ...(targetList.itemStates || {}) };
        
        // Add each processed item
        for (const processedItem of processedItems) {
          const articleId = processedItem.articleId!;
          
          // Add to article IDs if not already present
          if (!updatedArticleIds.includes(articleId)) {
            updatedArticleIds.push(articleId);
            console.log('🎯 Added article ID to list:', articleId);
          }
          
          // Set item state
          updatedItemStates[articleId] = {
            articleId: articleId,
            isChecked: false, // ACTIVE state
            amount: processedItem.quantity || processedItem.item.quantity || ''
          };
          console.log('🎯 Set item state for:', articleId, updatedItemStates[articleId]);
        }
        
        console.log('🎯 Final update - Article IDs:', updatedArticleIds.length);
        console.log('🎯 Final update - Item states:', Object.keys(updatedItemStates).length);
        
        // CRITICAL FIX: Update the list with all new articles in one operation
        const updateResult = await this.dataService.updateList(targetList.id, {
          articleIds: updatedArticleIds,
          itemStates: updatedItemStates
        }).toPromise();
        
        if (!updateResult) {
          console.error('❌ Failed to update list with new articles');
          return {
            success: false,
            message: '❌ Fehler beim Hinzufügen der Artikel zur Liste.'
          };
        }
        
        console.log('✅ Successfully added all articles to list');
        
        // Build comprehensive summary message
        let message = '';
        
        if (processedItems.length > 0) {
          const addedItems = processedItems.map(p => 
            `"${p.item.itemName}"${p.quantity ? ` (${p.quantity})` : ''}`
          );
          message += `✅ ${processedItems.length} Artikel zu "${targetList.name}" hinzugefügt:\n${addedItems.join(', ')}`;
        }
        
        if (skippedItems.length > 0) {
          const skippedSummary = skippedItems.map(p => 
            `"${p.originalText || p.item.itemName}"`
          );
          message += `${message ? '\n\n' : ''}⏭️ ${skippedItems.length} Artikel übersprungen:\n${skippedSummary.join(', ')}`;
        }
        
        if (failedItems.length > 0) {
          const failedSummary = failedItems.map(p => 
            `"${p.originalText || p.item.itemName}"`
          );
          message += `${message ? '\n\n' : ''}❌ ${failedItems.length} Artikel fehlgeschlagen:\n${failedSummary.join(', ')}`;
        }
        
        // CRITICAL FIX: Set up proper conversation context for continued interaction
        const conversationContext = {
          lastAction: {
            type: 'article_added' as const,
            listId: targetList.id,
            listName: targetList.name,
            articleName: `${processedItems.length} Artikel`,
            timestamp: new Date()
          },
          waitingForArticles: {
            listId: targetList.id,
            listName: targetList.name,
            prompt: 'Multi-item processing completed'
          }
        };
        
        return {
          success: true,
          message: message,
          listId: targetList.id,
          conversationContext,
          followUpPrompt: `Möchtest du noch weitere Artikel zu "${targetList.name}" hinzufügen?`
        };
        
      } else {
        // Only skipped/failed items
        let message = '';
        
        if (skippedItems.length > 0) {
          const skippedSummary = skippedItems.map(p => `"${p.originalText || p.item.itemName}"`);
          message += `⏭️ ${skippedItems.length} Artikel übersprungen:\n${skippedSummary.join(', ')}`;
        }
        
        if (failedItems.length > 0) {
          const failedSummary = failedItems.map(p => `"${p.originalText || p.item.itemName}"`);
          message += `${message ? '\n\n' : ''}❌ ${failedItems.length} Artikel fehlgeschlagen:\n${failedSummary.join(', ')}`;
        }
        
        message += '\n\nKeine Artikel hinzugefügt.';
        
        return {
          success: true,
          message: message
        };
      }
  
    } catch (error) {
      console.error('🎯 ERROR IN FINAL ACTION:', error);
      return {
        success: false,
        message: `❌ Fehler beim Ausführen der finalen Aktion: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  // ========================================
  // DISAMBIGUATION CHOICE HANDLING - FIXED
  // ========================================

  async handleDisambiguationChoice(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('🎯 Handling disambiguation choice:', { pendingAction, selectedOption });
  
    try {
      // CRITICAL: Handle SKIP option first
      if (selectedOption.type === 'skip') {
        console.log('⏭️ Processing skip option');
        return this.handleSkipOption(pendingAction, selectedOption);
      }
  
      // CRITICAL FIX: Handle multi-item sequential processing
      if (isMultiItemPendingAction(pendingAction)) {
        console.log('🎯 Handling multi-item disambiguation choice');
        return this.handleMultiItemDisambiguationChoice(pendingAction, selectedOption);
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
      console.error('Error handling disambiguation choice:', error);
      return {
        success: false,
        message: `❌ Fehler beim Verarbeiten der Auswahl: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  private async handleMultiItemDisambiguationChoice(
    pendingAction: MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('🎯 HANDLING MULTI-ITEM DISAMBIGUATION CHOICE');
    console.log('🎯 Current item index:', pendingAction.currentItemIndex);
    console.log('🎯 Selected option type:', selectedOption.type);

    let selectedArticle: Article | null = null;
    
    if (selectedOption.type === 'existing' && selectedOption.article) {
      selectedArticle = selectedOption.article;
      console.log('🎯 Using existing article:', selectedArticle.name);
    } else {
      console.log('🎯 Will create new article');
    }

    // CRITICAL FIX: Process current item and continue to next
    return this.processCurrentItemAndContinue(pendingAction, selectedArticle);
  }

  private async handleSkipOption(
    pendingAction: PendingAction | MultiItemPendingAction, 
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('⏭️ Processing skip for action:', pendingAction);
  
    // Handle multi-item sequential skip
    if (isMultiItemPendingAction(pendingAction)) {
      return this.handleSequentialSkip(pendingAction, selectedOption);
    }
  
    // Handle regular single-item skip
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
    console.log('⏭️ Handling sequential skip for item:', action.items[action.currentItemIndex]);
    
    const currentItem = action.items[action.currentItemIndex];
    
    // CRITICAL FIX: Add current item to processed items as skipped
    const skippedItem: ProcessedItem = {
      item: currentItem,
      skipped: true,
      skipReason: selectedOption.skipReason || 'Übersprungen',
      originalText: currentItem.itemName
    };
    
    action.processedItems.push(skippedItem);
    console.log(`⏭️ Skipped "${currentItem.itemName}", total processed:`, action.processedItems.length);
  
    // Move to next item
    action.currentItemIndex++;
    console.log(`⏭️ Moving to next item: ${action.currentItemIndex + 1}/${action.items.length}`);
    
    // CRITICAL FIX: Continue processing with next item
    return this.processMultiItemSequentially(action);
  }

  // ========================================
  // LIST SELECTION METHODS
  // ========================================

  async handleListSelection(pendingAction: PendingAction, selectedOption: DisambiguationOption): Promise<AIExecutionResult> {
    try {
      const listId = selectedOption.id.replace('list_', '');
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      const targetList = lists?.find(list => list.id === listId);

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
        // Add multiple existing articles to list
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
        }).toPromise();

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
        }
      }

      // Single article handling
      let articleId = articleData.id;
      if (!articleId) {
        const newArticle = await this.dataService.createArticle({
          name: articleData.name,
          amount: articleData.amount || '',
          departmentId: articleData.departmentId || 'miscellaneous',
          icon: articleData.icon || '📦'
        }).toPromise();
        
        if (!newArticle) {
          throw new Error('Failed to create article');
        }
        articleId = newArticle.id;
      }

      // Add article to selected list
      const updatedArticleIds = [...targetList.articleIds];
      if (!updatedArticleIds.includes(articleId)) {
        updatedArticleIds.push(articleId);
      }

      const updatedItemStates = { ...targetList.itemStates };
      updatedItemStates[articleId] = {
        articleId: articleId,
        isChecked: false,
        amount: articleData.amount || ''
      };

      const updateResult = await this.dataService.updateList(targetList.id, {
        articleIds: updatedArticleIds,
        itemStates: updatedItemStates
      }).toPromise();

      if (updateResult) {
        return {
          success: true,
          message: `✅ "${articleData.name}"${articleData.amount ? ` (${articleData.amount})` : ''} wurde zur Liste "${targetList.name}" hinzugefügt.`,
          listId: targetList.id
        };
      }

      return {
        success: false,
        message: '❌ Fehler beim Hinzufügen zur ausgewählten Liste.'
      };

    } catch (error) {
      console.error('List selection error:', error);
      return {
        success: false,
        message: '❌ Fehler beim Hinzufügen zur ausgewählten Liste.'
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
  // ARTICLE EXECUTION METHODS - FIXED
  // ========================================

  private async executeActionWithArticle(action: PendingAction, article: Article): Promise<AIExecutionResult> {
    console.log('🎯 EXECUTING ACTION WITH EXISTING ARTICLE:', { action, article });
    
    try {
      if (action.listName) {
        const targetList = await this.findListByName(action.listName);
        
        if (!targetList) {
          return {
            success: false,
            message: `❌ Liste "${action.listName}" nicht gefunden.`
          };
        }
        
        // Add existing article to the list
        const updatedArticleIds = [...targetList.articleIds];
        if (!updatedArticleIds.includes(article.id)) {
          updatedArticleIds.push(article.id);
        }

        const updatedItemStates = { ...targetList.itemStates };
        updatedItemStates[article.id] = {
          articleId: article.id,
          isChecked: false, // ACTIVE state
          amount: action.extractedQuantity || article.amount || ''
        };

        const updateResult = await this.dataService.updateList(targetList.id, {
          articleIds: updatedArticleIds,
          itemStates: updatedItemStates
        }).toPromise();
        
        if (updateResult) {
          const quantityText = action.extractedQuantity ? ` (${action.extractedQuantity})` : '';
          return {
            success: true,
            message: `✅ "${article.name}"${quantityText} wurde zur Liste "${targetList.name}" hinzugefügt.`,
            listId: targetList.id
          };
        } else {
          return {
            success: false,
            message: `❌ Fehler beim Hinzufügen von "${article.name}" zur Liste "${targetList.name}".`
          };
        }
        
      } else {
        // No target list - ask for selection
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
            const updatedArticleIds = [...targetList.articleIds];
            if (!updatedArticleIds.includes(article.id)) {
              updatedArticleIds.push(article.id);
            }

            const updatedItemStates = { ...targetList.itemStates };
            updatedItemStates[article.id] = {
              articleId: article.id,
              isChecked: false,
              amount: action.extractedQuantity || article.amount || ''
            };

            const updateResult = await this.dataService.updateList(targetList.id, {
              articleIds: updatedArticleIds,
              itemStates: updatedItemStates
            }).toPromise();
            
            if (updateResult) {
              const quantityText = action.extractedQuantity ? ` (${action.extractedQuantity})` : '';
              return {
                success: true,
                message: `✅ "${article.name}"${quantityText} wurde zur Liste "${targetList.name}" hinzugefügt.`,
                listId: targetList.id
              };
            }
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
      
    } catch (error) {
      console.error('🎯 Error executing action with existing article:', error);
      return {
        success: false,
        message: `❌ Fehler beim Hinzufügen von "${article.name}".`
      };
    }
  }

  private async executeActionWithNewArticle(action: PendingAction): Promise<AIExecutionResult> {
    console.log('🎯 EXECUTING ACTION WITH NEW ARTICLE:', action);
    
    try {
      // Create new article
      const articleData = {
        name: action.itemName,
        amount: action.extractedQuantity || '',
        departmentId: action.suggestedDepartment || 'miscellaneous',
        icon: this.suggestIcon(action.itemName)
      };
      
      console.log('🎯 Creating new article:', articleData);
      
      const newArticle = await this.dataService.createArticle(articleData).toPromise();
      
      if (!newArticle) {
        return {
          success: false,
          message: `❌ Fehler beim Erstellen des Artikels "${action.itemName}".`
        };
      }
      
      console.log('✅ Created new article:', newArticle);
      
      // Add to list if specified
      if (action.listName) {
        const targetList = await this.findListByName(action.listName);
        
        if (!targetList) {
          return {
            success: false,
            message: `❌ Liste "${action.listName}" nicht gefunden.`
          };
        }
        
        const updatedArticleIds = [...targetList.articleIds];
        if (!updatedArticleIds.includes(newArticle.id)) {
          updatedArticleIds.push(newArticle.id);
        }

        const updatedItemStates = { ...targetList.itemStates };
        updatedItemStates[newArticle.id] = {
          articleId: newArticle.id,
          isChecked: false,
          amount: action.extractedQuantity || ''
        };

        const updateResult = await this.dataService.updateList(targetList.id, {
          articleIds: updatedArticleIds,
          itemStates: updatedItemStates
        }).toPromise();
        
        if (updateResult) {
          const quantityText = action.extractedQuantity ? ` (${action.extractedQuantity})` : '';
          return {
            success: true,
            message: `✅ "${newArticle.name}"${quantityText} wurde erstellt und zur Liste "${targetList.name}" hinzugefügt.`,
            listId: targetList.id
          };
        } else {
          return {
            success: false,
            message: `❌ Fehler beim Hinzufügen von "${newArticle.name}" zur Liste "${targetList.name}".`
          };
        }
        
      } else {
        // No target list - ask for selection
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
            const updatedArticleIds = [...targetList.articleIds];
            if (!updatedArticleIds.includes(newArticle.id)) {
              updatedArticleIds.push(newArticle.id);
            }

            const updatedItemStates = { ...targetList.itemStates };
            updatedItemStates[newArticle.id] = {
              articleId: newArticle.id,
              isChecked: false,
              amount: action.extractedQuantity || ''
            };

            const updateResult = await this.dataService.updateList(targetList.id, {
              articleIds: updatedArticleIds,
              itemStates: updatedItemStates
            }).toPromise();
            
            if (updateResult) {
              const quantityText = action.extractedQuantity ? ` (${action.extractedQuantity})` : '';
              return {
                success: true,
                message: `✅ "${newArticle.name}"${quantityText} wurde erstellt und zur Liste "${targetList.name}" hinzugefügt.`,
                listId: targetList.id
              };
            }
          }
        }

        // Multiple lists - ask user to choose
        const listSelectionAction: PendingAction = {
          type: 'select_list',
          originalInput: action.originalInput,
          itemName: newArticle.name,
          extractedQuantity: action.extractedQuantity,
          listName: undefined,
          suggestedDepartment: action.suggestedDepartment,
          articleToAdd: {
            id: newArticle.id,
            name: newArticle.name,
            amount: action.extractedQuantity || '',
            departmentId: newArticle.departmentId || 'miscellaneous',
            icon: newArticle.icon || '📦'
          }
        };

        const quantityText = action.extractedQuantity ? ` (${action.extractedQuantity})` : '';
        return {
          success: true,
          message: `🎯 Artikel "${newArticle.name}" wurde erstellt.\n\nZu welcher Liste soll er${quantityText} hinzugefügt werden?`,
          needsUserInput: true,
          disambiguationOptions: this.convertListsToDisambiguationOptions(listOptions),
          pendingAction: listSelectionAction
        };
      }
      
    } catch (error) {
      console.error('🎯 Error executing action with new article:', error);
      return {
        success: false,
        message: `❌ Fehler beim Erstellen des Artikels "${action.itemName}".`
      };
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  private calculateSimilarity(str1: string, str2: string): number {
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

  private async findListByName(listName: string): Promise<ShoppingList | null> {
    try {
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
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

  // Placeholder methods (should be moved to appropriate services)
  private suggestDepartment(itemName: string): string {
    return 'miscellaneous';
  }

  private suggestIcon(itemName: string): string {
    return '📦';
  }
}