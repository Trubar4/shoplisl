// src/app/core/services/ai/disambiguation.service.ts
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  DisambiguationOption,
  PendingAction,
  MultiItemPendingAction,
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

  /**
   * 🎯 ENHANCED: Smart disambiguation with fuzzy matching
   */
  async getDisambiguationOptions(itemName: string, excludeId?: string): Promise<DisambiguationOption[]> {
    console.log('🔍 Getting disambiguation options for:', itemName);
    
    try {
      const articles = await this.dataService.getArticles().pipe(take(1)).toPromise();
      const options: DisambiguationOption[] = [];

      if (!articles) return options;

      // Clean the search term
      const searchTerm = itemName.toLowerCase().trim();
      console.log('🔍 Search term:', searchTerm);

      // Find similar existing articles using multiple matching strategies
      const similarArticles = articles
        .filter(article => article.id !== excludeId)
        .map(article => {
          const articleName = article.name.toLowerCase();
          
          // Calculate multiple similarity scores
          const exactMatch = articleName === searchTerm ? 1.0 : 0;
          const containsMatch = articleName.includes(searchTerm) || searchTerm.includes(articleName) ? 0.8 : 0;
          const levenshteinSim = this.calculateSimilarity(searchTerm, articleName);
          
          // Use the best similarity score
          const similarity = Math.max(exactMatch, containsMatch, levenshteinSim);
          
          console.log(`🔍 Article "${article.name}" similarity: ${similarity}`);
          
          return {
            article,
            similarity
          };
        })
        .filter(item => item.similarity >= MIN_SIMILARITY_THRESHOLD)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 4); // Max 4 existing options

      console.log('🔍 Similar articles found:', similarArticles.length);

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

      // Always add option to create new article with the EXACT name provided
      options.push({
        id: 'new_article',
        displayName: `"${itemName}" (neu erstellen)`,
        type: 'new',
        confidence: 1.0,
        icon: '✨'
      });

      console.log('🔍 Final disambiguation options:', options);
      return options;
      
    } catch (error) {
      console.error('Error getting disambiguation options:', error);
      throw new DisambiguationError('Failed to get disambiguation options', { itemName, error });
    }
  }

  /**
   * 🎯 ENHANCED: Handle disambiguation choice (supports both single and multi-item)
   */
  async handleDisambiguationChoice(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('🎯 Handling disambiguation choice:', { pendingAction, selectedOption });

    try {
      // Check if this is a multi-item action
      if (isMultiItemPendingAction(pendingAction)) {
        return this.handleMultiItemDisambiguationChoice(pendingAction, selectedOption);
      }

      // Handle single-item disambiguation
      if (pendingAction.type === 'select_list') {
        return this.handleListSelection(pendingAction, selectedOption);
      }

      // Handle article disambiguation
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

  /**
   * 🎯 Enhanced disambiguation choice handler for multi-items
   */
  async handleMultiItemDisambiguationChoice(
    pendingAction: MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('🎯 HANDLING MULTI-ITEM DISAMBIGUATION CHOICE:', { pendingAction, selectedOption });

    let selectedArticle: Article | null = null;
    
    if (selectedOption.type === 'existing' && selectedOption.article) {
      selectedArticle = selectedOption.article;
    }

    // Process current item and continue to next
    return this.processCurrentItemAndContinue(pendingAction, selectedArticle);
  }

  // ========================================
  // LIST SELECTION METHODS
  // ========================================

  /**
   * 🎯 Handle list selection from disambiguation
   */
  async handleListSelection(pendingAction: PendingAction, selectedOption: DisambiguationOption): Promise<AIExecutionResult> {
    try {
      // Extract list ID from selected option
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

      // 🆕 NEW: Handle multiple articles
      const multipleArticleIds = (pendingAction as any).multipleArticleIds;
      if (multipleArticleIds && Array.isArray(multipleArticleIds)) {
        // Add multiple existing articles to list
        for (const articleId of multipleArticleIds) {
          await this.dataService.addArticleToList(targetList.id, articleId).toPromise();
        }

        const processedItems = (pendingAction as any).processedItems || [];
        const itemSummary = processedItems
          .map((p: any) => `"${p.item.itemName}"${p.item.quantity ? ` (${p.item.quantity})` : ''}`)
          .join(', ');

        return {
          success: true,
          message: `✅ ${multipleArticleIds.length} Artikel zur Liste "${targetList.name}" hinzugefügt:\n${itemSummary}`,
          listId: targetList.id
        };
      }

      // Create article if it doesn't exist yet
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
      await this.dataService.addArticleToList(targetList.id, articleId).toPromise();

      return {
        success: true,
        message: `✅ "${articleData.name}"${articleData.amount ? ` (${articleData.amount})` : ''} wurde zur Liste "${targetList.name}" hinzugefügt.`,
        listId: targetList.id
      };

    } catch (error) {
      console.error('List selection error:', error);
      return {
        success: false,
        message: '❌ Fehler beim Hinzufügen zur ausgewählten Liste.'
      };
    }
  }

  /**
   * 🎯 Get available lists as selection options
   */
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

  /**
   * 🎯 Convert lists to disambiguation options for UI
   */
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
  // MULTI-ITEM PROCESSING METHODS
  // ========================================

  /**
   * 🎯 Process current item and continue to next item
   */
  private async processCurrentItemAndContinue(
    action: MultiItemPendingAction,
    selectedArticle: Article | null
  ): Promise<AIExecutionResult> {
    const currentItem = action.items[action.currentItemIndex];
    
    try {
      let articleId: string;
      
      if (selectedArticle) {
        // Use existing article
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
      }

      // Add to processed items
      action.processedItems.push({
        item: currentItem,
        articleId,
        disambiguationResolved: true
      });

      // Move to next item
      action.currentItemIndex++;

      // Continue processing or finish
      return this.processMultiItemSequentially(action);

    } catch (error) {
      console.error('🎯 ERROR PROCESSING ITEM:', error);
      return {
        success: false,
        message: `❌ Fehler beim Verarbeiten von "${currentItem.itemName}": ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  /**
   * 🎯 Process multiple items sequentially with disambiguation
   */
  async processMultiItemSequentially(action: MultiItemPendingAction): Promise<AIExecutionResult> {
    console.log('🎯 PROCESSING MULTI-ITEM SEQUENTIALLY:', action);
    
    const currentIndex = action.currentItemIndex;
    const currentItem = action.items[currentIndex];
    
    if (!currentItem) {
      // All items processed - execute final action
      return this.executeMultiItemFinalAction(action);
    }

    console.log(`🎯 PROCESSING ITEM ${currentIndex + 1}/${action.items.length}:`, currentItem);

    // Get disambiguation options for current item
    const disambiguationOptions = await this.getDisambiguationOptions(currentItem.itemName);
    
    // Check if disambiguation is needed
    const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');
    
    if (existingOptions.length > 0) {
      // Show disambiguation for current item
      const message = `🎯 Artikel ${currentIndex + 1}/${action.items.length}: "${currentItem.itemName}"\n\nIch habe ähnliche Artikel gefunden. Welchen möchtest du verwenden?`;
      
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
  }

  /**
   * 🎯 Execute final action after all items are processed
   */
  private async executeMultiItemFinalAction(action: MultiItemPendingAction): Promise<AIExecutionResult> {
    console.log('🎯 EXECUTING FINAL MULTI-ITEM ACTION:', action);
    
    const processedCount = action.processedItems.length;
    const articleIds = action.processedItems.map(p => p.articleId!);
    
    try {
      if (action.type === 'create_list_with_multiple_items') {
        // Create new list with all items
        const itemStates: any = {};
        articleIds.forEach(id => {
          itemStates[id] = { articleId: id, isChecked: false };
        });

        const newList = await this.dataService.createList({
          name: action.listName!,
          color: this.suggestListColor(action.listName!),
          icon: '🛒',
          articleIds,
          itemStates
        }).toPromise();

        const itemSummary = action.processedItems
          .map(p => `"${p.item.itemName}"${p.item.quantity ? ` (${p.item.quantity})` : ''}`)
          .join(', ');

        return {
          success: true,
          message: `✅ Liste "${action.listName}" wurde mit ${processedCount} Artikeln erstellt:\n${itemSummary}`,
          listId: newList?.id
        };

      } else {
        // Add items to existing list or ask for list selection
        if (!action.listName) {
          // Ask for list selection
          const listOptions = await this.getListSelectionOptions();
          
          if (listOptions.length === 0) {
            return {
              success: false,
              message: `❌ Keine Listen gefunden! Erstelle zuerst eine Liste.`
            };
          }

          if (listOptions.length === 1) {
            // Use the only available list
            const targetList = await this.findListByName(listOptions[0].name);
            if (targetList) {
              for (const articleId of articleIds) {
                await this.dataService.addArticleToList(targetList.id, articleId).toPromise();
              }

              const itemSummary = action.processedItems
                .map(p => `"${p.item.itemName}"${p.item.quantity ? ` (${p.item.quantity})` : ''}`)
                .join(', ');

              return {
                success: true,
                message: `✅ ${processedCount} Artikel zur Liste "${targetList.name}" hinzugefügt:\n${itemSummary}`,
                listId: targetList.id
              };
            }
          }

          // Multiple lists - ask user to choose
          const listSelectionAction: PendingAction = {
            type: 'select_list',
            originalInput: action.originalInput,
            itemName: `${processedCount} Artikel`,
            articleToAdd: {
              name: `${processedCount} Artikel`,
              amount: '',
              departmentId: 'miscellaneous',
              icon: '📦'
            }
          };

          // Store article IDs for list selection
          (listSelectionAction as any).multipleArticleIds = articleIds;
          (listSelectionAction as any).processedItems = action.processedItems;

          return {
            success: true,
            message: `🎯 Zu welcher Liste sollen die ${processedCount} Artikel hinzugefügt werden?`,
            needsUserInput: true,
            disambiguationOptions: this.convertListsToDisambiguationOptions(listOptions),
            pendingAction: listSelectionAction
          };

        } else {
          // Add to specified list
          const targetList = await this.findListByName(action.listName);
          
          if (!targetList) {
            return {
              success: false,
              message: `❌ Liste "${action.listName}" nicht gefunden.`
            };
          }

          for (const articleId of articleIds) {
            await this.dataService.addArticleToList(targetList.id, articleId).toPromise();
          }

          const itemSummary = action.processedItems
            .map(p => `"${p.item.itemName}"${p.item.quantity ? ` (${p.item.quantity})` : ''}`)
            .join(', ');

          return {
            success: true,
            message: `✅ ${processedCount} Artikel zur Liste "${action.listName}" hinzugefügt:\n${itemSummary}`,
            listId: targetList.id
          };
        }
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
  // SIMILARITY CALCULATION METHODS
  // ========================================

  /**
   * 🎯 Calculate similarity between two strings using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLength);
  }

  /**
   * 🎯 Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  // ========================================
  // HELPER METHODS (TEMPORARY - SHOULD BE IN AI-RESPONSE SERVICE)
  // ========================================

/**
 * 🎯 Execute action with existing article (FIXED: Actually adds to list)
 */
private async executeActionWithArticle(action: PendingAction, article: Article): Promise<AIExecutionResult> {
  console.log('🎯 EXECUTING ACTION WITH EXISTING ARTICLE:', { action, article });
  
  try {
    // Check if target list is specified
    if (action.listName) {
      console.log('🎯 Target list specified:', action.listName);
      
      // Find the target list
      const targetList = await this.findListByName(action.listName);
      
      if (!targetList) {
        return {
          success: false,
          message: `❌ Liste "${action.listName}" nicht gefunden.`
        };
      }
      
      console.log('🎯 Found target list:', targetList.name);
      
      // Add existing article to the list using updateList method
      const updatedArticleIds = [...targetList.articleIds];
      if (!updatedArticleIds.includes(article.id)) {
        updatedArticleIds.push(article.id);
      }

      // 🎯 CRITICAL: Create item states with explicit active state
      const updatedItemStates = { ...targetList.itemStates };
      updatedItemStates[article.id] = {
        articleId: article.id,
        isChecked: false, // 🎯 FALSE = ACTIVE/NOT STRIKED OUT
        amount: action.extractedQuantity || article.amount || ''
      };

      console.log(`🎯 Setting existing article ${article.id} as ACTIVE (isChecked: false)`);
      console.log('🔍 Item state:', updatedItemStates[article.id]);

      // Use existing updateList method
      const updateResult = await this.dataService.updateList(targetList.id, {
        articleIds: updatedArticleIds,
        itemStates: updatedItemStates
      }).toPromise();
      
      if (updateResult) {
        console.log('✅ Successfully added existing article to list');
        const quantityText = action.extractedQuantity ? ` (${action.extractedQuantity})` : '';
        return {
          success: true,
          message: `✅ "${article.name}"${quantityText} wurde zur Liste "${targetList.name}" hinzugefügt.`,
          listId: targetList.id
        };
      } else {
        console.error('❌ updateList returned false');
        return {
          success: false,
          message: `❌ Fehler beim Hinzufügen von "${article.name}" zur Liste "${targetList.name}".`
        };
      }
      
    } else {
      // No target list specified - ask for list selection
      console.log('🎯 No target list specified, asking for list selection');
      
      const listOptions = await this.getListSelectionOptions();
      
      if (listOptions.length === 0) {
        return {
          success: false,
          message: '❌ Keine Listen gefunden! Erstelle zuerst eine Liste.'
        };
      }

      if (listOptions.length === 1) {
        // Use the only available list directly
        const singleList = listOptions[0];
        const targetList = await this.findListByName(singleList.name);
        
        if (targetList) {
          // Add to the single list using updateList
          const updatedArticleIds = [...targetList.articleIds];
          if (!updatedArticleIds.includes(article.id)) {
            updatedArticleIds.push(article.id);
          }

          const updatedItemStates = { ...targetList.itemStates };
          updatedItemStates[article.id] = {
            articleId: article.id,
            isChecked: false, // Active state
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

/**
 * 🎯 Execute action with new article (FIXED: Actually creates and adds to list)
 */
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
    
    // Now add the new article to the list (same logic as existing article)
    if (action.listName) {
      console.log('🎯 Target list specified:', action.listName);
      
      const targetList = await this.findListByName(action.listName);
      
      if (!targetList) {
        return {
          success: false,
          message: `❌ Liste "${action.listName}" nicht gefunden.`
        };
      }
      
      // Add new article to the list using updateList method
      const updatedArticleIds = [...targetList.articleIds];
      if (!updatedArticleIds.includes(newArticle.id)) {
        updatedArticleIds.push(newArticle.id);
      }

      const updatedItemStates = { ...targetList.itemStates };
      updatedItemStates[newArticle.id] = {
        articleId: newArticle.id,
        isChecked: false, // Active state
        amount: action.extractedQuantity || ''
      };

      const updateResult = await this.dataService.updateList(targetList.id, {
        articleIds: updatedArticleIds,
        itemStates: updatedItemStates
      }).toPromise();
      
      if (updateResult) {
        console.log('✅ Successfully added new article to list');
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
      // No target list specified - ask for list selection
      const listOptions = await this.getListSelectionOptions();
      
      if (listOptions.length === 0) {
        return {
          success: false,
          message: '❌ Keine Listen gefunden! Erstelle zuerst eine Liste.'
        };
      }

      if (listOptions.length === 1) {
        // Use the only available list directly
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

  /**
   * 🎯 Find list by name
   */
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

  // Temporary placeholder methods (should be in ai-response service)
  private suggestDepartment(itemName: string): string {
    return 'miscellaneous'; // Simplified
  }

  private suggestIcon(itemName: string): string {
    return '📦'; // Simplified
  }

  private suggestListColor(listName: string): string {
    return '#1a9edb'; // Simplified
  }
}