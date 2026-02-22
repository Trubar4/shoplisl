// src/app/core/services/ai/article-operations.service.ts
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { take, timeout } from 'rxjs/operators';
import { DataService } from '../data.service';
import { GroqApiService } from './groq-api.service';
import { SmartSuggestionsService } from './smart-suggestions.service';
import { HistoryService } from '../history.service';
import { AuthService } from '../auth.service';
import { Article, ShoppingList } from '../../models';
import { QuantityExtraction, AIExecutionResult } from './ai-models';
import { LoggerService } from '../logger.service';

@Injectable({
  providedIn: 'root'
})
export class ArticleOperationsService {

  constructor(
    private dataService: DataService,
    private groqApi: GroqApiService,
    private smartSuggestions: SmartSuggestionsService,
    private historyService: HistoryService,
    private authService: AuthService,
    private logger: LoggerService
  ) {}

  // ========================================
  // ARTICLE CREATION WITH SMART SUGGESTIONS
  // ========================================

  async createArticleWithSuggestions(quantityExtraction: QuantityExtraction): Promise<Article | null> {
    this.logger.debug('ai', 'Creating article with smart suggestions:', quantityExtraction);
    
    try {
      const [departmentId, icon] = await Promise.all([
        this.suggestDepartment(quantityExtraction.itemName),
        this.suggestIcon(quantityExtraction.itemName)
      ]);
      
      const articleData = {
        name: quantityExtraction.itemName,
        amount: quantityExtraction.quantity || '',
        departmentId,
        icon
      };
      
      const newArticle = await this.dataService.createArticle(articleData, 'ai').toPromise();
      
      if (!newArticle) {
        throw new Error(`Failed to create article: ${quantityExtraction.itemName}`);
      }
      
      this.logger.info('ai', 'Created article with suggestions:', newArticle);
      return newArticle;
      
    } catch (error) {
      this.logger.error('ai', 'Error creating article:', error);
      return null;
    }
  }

  // ========================================
  // ARTICLE TO LIST OPERATIONS
  // ========================================

  async addArticleToListById(
    articleId: string, 
    listId: string, 
    amount: string = ''
  ): Promise<AIExecutionResult> {
    this.logger.debug('ai', 'Adding article to list by ID:', { articleId, listId, amount });
    
    try {
      const targetList = await this.findListById(listId);
      if (!targetList) {
        return {
          success: false,
          message: `❌ Liste mit ID ${listId} nicht gefunden.`
        };
      }

      const result = await this.addArticleToListInternal(articleId, targetList, amount);
      
      if (result.success) {
        // Get article name for message
        const article = await this.dataService.getArticle(articleId).pipe(take(1)).toPromise();
        const articleName = article?.name || 'Artikel';
        
        return {
          success: true,
          message: `✅ "${articleName}"${amount ? ` (${amount})` : ''} wurde zu "${targetList.name}" hinzugefügt.`,
          listId: targetList.id
        };
      }
      
      return result;
      
    } catch (error) {
      this.logger.error('ai', 'Error adding article to list:', error);
      return {
        success: false,
        message: `❌ Fehler beim Hinzufügen des Artikels zur Liste.`
      };
    }
  }

  async addArticleToListByName(
    articleId: string, 
    listName: string, 
    amount: string = ''
  ): Promise<AIExecutionResult> {
    this.logger.debug('ai', 'Adding article to list by name:', { articleId, listName, amount });
    
    try {
      const targetList = await this.findListByName(listName);
      if (!targetList) {
        return {
          success: false,
          message: `❌ Liste "${listName}" nicht gefunden.`
        };
      }

      const result = await this.addArticleToListInternal(articleId, targetList, amount);
      
      if (result.success) {
        // Get article name for message
        const article = await this.dataService.getArticle(articleId).pipe(take(1)).toPromise();
        const articleName = article?.name || 'Artikel';
        
        return {
          success: true,
          message: `✅ "${articleName}"${amount ? ` (${amount})` : ''} wurde zu "${targetList.name}" hinzugefügt.`,
          listId: targetList.id
        };
      }
      
      return result;
      
    } catch (error) {
      this.logger.error('ai', 'Error adding article to list by name:', error);
      return {
        success: false,
        message: `❌ Fehler beim Hinzufügen des Artikels zur Liste "${listName}".`
      };
    }
  }

  private async addArticleToListInternal(
    articleId: string, 
    targetList: ShoppingList, 
    amount: string = ''
  ): Promise<AIExecutionResult> {
    try {
      // Try optimized method first
      const addSuccess = await this.dataService.addArticleToList(targetList.id, articleId, 'ai').toPromise();
      
      if (addSuccess) {
        // Set amount if specified
        if (amount) {
          await this.dataService.updateListItemAmount(targetList.id, articleId, amount).toPromise();
        }
        return { success: true, message: 'Success' };
      }
      
      // Fallback to manual update
      this.logger.warn('ai', '[AI-ArticleOps] Direct addArticleToList failed, using manual update fallback', {
        articleId,
        listId: targetList.id,
        listName: targetList.name
      });

      const updatedArticleIds = [...targetList.articleIds];
      if (!updatedArticleIds.includes(articleId)) {
        updatedArticleIds.push(articleId);
      }

      // BUGFIX: Fetch article to get name for itemState
      // Without this, articleName would be undefined causing "ghost" itemStates
      const article = await this.dataService.getArticle(articleId).pipe(take(1)).toPromise();
      const articleName = article?.name;

      this.logger.info('ai', '[AI-ArticleOps] Fallback: fetched article for itemState', {
        articleId,
        articleName: articleName || '(NOT FOUND - WILL CREATE GHOST ITEMSTATE!)',
        articleExists: !!article
      });

      // Use HistoryService to create proper itemState with 'added' history event
      const currentUser = this.authService.getCurrentUserValue();
      const existingState = targetList.itemStates[articleId];
      const updatedItemStates = { ...targetList.itemStates };
      updatedItemStates[articleId] = this.historyService.createUpdatedItemState(
        existingState,
        articleId,
        'added',
        amount || existingState?.amount || '',
        currentUser?.id,
        currentUser?.name,
        articleName  // Pass articleName to fix the bug
      );

      const updateResult = await this.dataService.updateList(targetList.id, {
        articleIds: updatedArticleIds,
        itemStates: updatedItemStates
      }).toPromise();
      
      if (updateResult) {
        return { success: true, message: 'Success via manual update' };
      } else {
        return {
          success: false,
          message: `❌ Fehler beim Hinzufügen zur Liste "${targetList.name}".`
        };
      }
      
    } catch (error) {
      this.logger.error('ai', 'Error in addArticleToListInternal:', error);
      return {
        success: false,
        message: `❌ Fehler beim Hinzufügen zur Liste: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  // ========================================
  // CREATE AND ADD TO LIST COMBO OPERATIONS
  // ========================================

  async createAndAddToListById(
    quantityExtraction: QuantityExtraction,
    listId: string
  ): Promise<AIExecutionResult> {
    this.logger.debug('ai', 'Creating and adding to list by ID:', { quantityExtraction, listId });
    
    try {
      // Create article
      const newArticle = await this.createArticleWithSuggestions(quantityExtraction);
      if (!newArticle) {
        return {
          success: false,
          message: `❌ Fehler beim Erstellen des Artikels "${quantityExtraction.itemName}".`
        };
      }
      
      // Add to list
      const addResult = await this.addArticleToListById(
        newArticle.id, 
        listId, 
        quantityExtraction.quantity
      );
      
      if (addResult.success) {
        return {
          success: true,
          message: `✅ "${newArticle.name}"${quantityExtraction.quantity ? ` (${quantityExtraction.quantity})` : ''} wurde erstellt und zur Liste hinzugefügt.`,
          listId: listId
        };
      }
      
      return addResult;
      
    } catch (error) {
      this.logger.error('ai', 'Error creating and adding to list:', error);
      return {
        success: false,
        message: `❌ Fehler beim Erstellen und Hinzufügen von "${quantityExtraction.itemName}".`
      };
    }
  }

  async createAndAddToListByName(
    quantityExtraction: QuantityExtraction,
    listName: string
  ): Promise<AIExecutionResult> {
    this.logger.debug('ai', 'Creating and adding to list by name:', { quantityExtraction, listName });
    
    try {
      // Find list first
      const targetList = await this.findListByName(listName);
      if (!targetList) {
        return {
          success: false,
          message: `❌ Liste "${listName}" nicht gefunden.`
        };
      }
      
      // Create and add
      return this.createAndAddToListById(quantityExtraction, targetList.id);
      
    } catch (error) {
      this.logger.error('ai', 'Error creating and adding to list by name:', error);
      return {
        success: false,
        message: `❌ Fehler beim Erstellen und Hinzufügen von "${quantityExtraction.itemName}" zu "${listName}".`
      };
    }
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  async findListByName(listName: string): Promise<ShoppingList | null> {
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
      this.logger.error('ai', 'Error finding list by name:', error);
      return null;
    }
  }

  async findListById(listId: string): Promise<ShoppingList | null> {
    try {
      const lists = await this.dataService.getLists().pipe(
        take(1), 
        timeout(5000)
      ).toPromise();
      
      return lists?.find(list => list.id === listId) || null;
      
    } catch (error) {
      this.logger.error('ai', 'Error finding list by ID:', error);
      return null;
    }
  }

  // ========================================
  // SMART SUGGESTIONS
  // ========================================

  async suggestDepartment(itemName: string): Promise<string> {
    this.logger.debug('ai', 'suggestDepartment called for:', itemName);
    
    // Valid department IDs
    const validDepartments = [
      'fruit-vegetables', 'dairy-products', 'fridge-meat', 'bread', 
      'beverages-alcohol', 'frozen-goods', 'tins-jars', 'noodles-rice', 
      'spices-oils', 'sweet-salty', 'breakfast', 'pastries', 
      'sausage-cheese-counter', 'household-goods', 'cleaning-agents', 
      'body-care', 'drugstore', 'medicine', 'miscellaneous', 
      'international', 'season'
    ];
  
    try {
      // Try AI suggestions first
      this.logger.debug('ai', 'Trying AI suggestions...');
      const suggestions = await this.smartSuggestions.getSmartSuggestions(itemName);
      this.logger.debug('ai', 'AI suggestions response:', suggestions);
      
      if (suggestions?.departmentId) {
        this.logger.debug('ai', 'AI suggested department:', suggestions.departmentId);
        if (validDepartments.includes(suggestions.departmentId)) {
          this.logger.info('ai', '🤖 Valid AI department accepted:', suggestions.departmentId);
          return suggestions.departmentId;
        } else {
          this.logger.warn('ai', 'Invalid AI department rejected:', suggestions.departmentId);
        }
      }
    } catch (error) {
      this.logger.debug('ai', '❌ AI suggestions failed:', error);
    }
    
    // Fallback to manual suggestions
    this.logger.debug('ai', 'Trying manual fallback...');
    const fallbackDepartment = await this.smartSuggestions.suggestDepartment(itemName);
    this.logger.debug('ai', 'Manual fallback result:', fallbackDepartment);
    
    const finalDepartment = (fallbackDepartment && validDepartments.includes(fallbackDepartment)) 
      ? fallbackDepartment 
      : 'miscellaneous';
      
    this.logger.debug('ai', 'Final department decision:', finalDepartment);
    return finalDepartment;
  }
  
  async suggestIcon(itemName: string): Promise<string> {
    try {
      // Try AI suggestions first
      const suggestions = await this.smartSuggestions.getSmartSuggestions(itemName);
      if (suggestions?.icon) {
        this.logger.info('ai', '🤖 AI icon:', suggestions.icon);
        return suggestions.icon;
      }
    } catch (error) {
      this.logger.debug('ai', '❌ AI suggestions failed, using fallback');
    }
    
    // Fallback to manual suggestions
    return this.smartSuggestions.suggestIcon(itemName);
  }

}