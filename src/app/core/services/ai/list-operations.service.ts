// src/app/core/services/ai/list-operations.service.ts
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { take, timeout } from 'rxjs/operators';
import { DataService } from '../data.service';
import { AIMessagingService } from './ai-messaging.service';
import { CommandParserService } from './command-parser.service';
import { ContextManagementService } from './context-management.service';
import { HistoryService } from '../history.service';
import { AuthService } from '../auth.service';
import { ShoppingList } from '../../models';
import { AIExecutionResult, QuantityExtraction, ColorExtraction } from './ai-models';
import { LoggerService } from '../logger.service';

@Injectable({
  providedIn: 'root'
})
export class ListOperationsService {

  constructor(
    private dataService: DataService,
    private aiResponse: AIMessagingService,
    private commandParser: CommandParserService,
    private contextManager: ContextManagementService,
    private historyService: HistoryService,
    private authService: AuthService,
    private logger: LoggerService
  ) {}

  // ========================================
  // LIST CREATION WITH ENHANCED FEATURES
  // ========================================

  async createListWithColor(
    listName: string, 
    colorExtraction: ColorExtraction,
    firstItem?: { itemName: string; quantity: string }
  ): Promise<AIExecutionResult> {
    this.logger.debug('ai', 'Creating list with color:', { listName, colorExtraction, firstItem });
    
    try {
      const listColor = colorExtraction.colorHex || this.aiResponse.suggestListColor(listName);
      
      const listToCreate = {
        name: listName,
        color: listColor,
        icon: '🛒',
        articleIds: [] as string[],
        itemStates: {} as any
      };
      
      // Create first article if specified
      if (firstItem) {
        const articleData = {
          name: firstItem.itemName,
          amount: firstItem.quantity || '',
          departmentId: this.aiResponse.suggestDepartment(firstItem.itemName),
          icon: this.aiResponse.suggestIcon(firstItem.itemName)
        };
        
        const newArticle = await this.dataService.createArticle(articleData).toPromise();
        
        if (newArticle) {
          listToCreate.articleIds.push(newArticle.id);
          const currentUser = this.authService.getCurrentUserValue();
          listToCreate.itemStates[newArticle.id] = this.historyService.createUpdatedItemState(
            undefined,
            newArticle.id,
            'added',
            firstItem.quantity || '',
            currentUser?.id,
            currentUser?.name,
            newArticle.name
          );
        }
      }
      
      const newList = await this.dataService.createList(listToCreate).toPromise();
      
      if (newList) {
        this.contextManager.updateContextForListCreated(newList.id, newList.name);
        
        const message = firstItem 
          ? `✅ Liste "${newList.name}" wurde mit "${firstItem.itemName}" erstellt.`
          : `✅ Liste "${newList.name}" wurde erstellt.`;
        
        return {
          success: true,
          message: message,
          listId: newList.id,
          conversationContext: this.contextManager.getConversationContext(),
          followUpPrompt: this.aiResponse.getListCreatedFollowUpPrompt(newList.name)
        };
      }
      
    } catch (error) {
      this.logger.error('ai', 'LIST CREATION ERROR:', error);
      return {
        success: false,
        message: '❌ Fehler beim Erstellen der Liste.'
      };
    }
    
    return {
      success: false,
      message: '❌ Unerwarteter Fehler beim Erstellen der Liste.'
    };
  }

  // ========================================
  // LIST CREATION FROM COMMAND INPUT
  // ========================================

  async createListFromCommand(input: string, quantityExtraction: QuantityExtraction): Promise<AIExecutionResult> {
    this.logger.debug('ai', 'Creating list from command:', input);
    
    // Extract color first
    const colorExtraction = this.commandParser.extractColor(input);
    this.logger.debug('ai', 'COLOR EXTRACTION:', colorExtraction);
    
    const cleanInput = colorExtraction.cleanInput;
    
    // Parse list creation patterns
    const createMatch = cleanInput.match(/erstelle\s+liste\s+(.+?)(?:\s+mit\s+(.+))?$/i);
    
    if (!createMatch) {
      return {
        success: false,
        message: '❌ Unverständlicher Liste-Befehl.\n\n💡 Beispiele:\n• "Erstelle Liste Spar"\n• "Erstelle Liste REWE in rot"'
      };
    }
    
    const listName = createMatch[1].trim();
    const itemName = createMatch[2]?.trim();
    
    // Prepare first item if specified
    let firstItem: { itemName: string; quantity: string } | undefined;
    if (itemName) {
      firstItem = {
        itemName: itemName,
        quantity: quantityExtraction.quantity || ''
      };
    }
    
    return this.createListWithColor(listName, colorExtraction, firstItem);
  }

  // ========================================
  // LIST DISPLAY AND INFORMATION
  // ========================================

  async showAllLists(): Promise<AIExecutionResult> {
    try {
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      
      if (!lists || lists.length === 0) {
        return {
          success: true,
          message: this.aiResponse.getNoListsFoundMessage()
        };
      }
      
      let message = '📋 Deine Listen:\n\n';
      
      for (const list of lists) {
        const itemCount = list.articleIds?.length || 0;
        const itemText = itemCount === 1 ? 'Artikel' : 'Artikel';
        message += `• ${list.name} (${itemCount} ${itemText})\n`;
      }
      
      message += '\n💡 Befehle:\n';
      message += '• "Füge [Artikel] zu [Liste] hinzu"\n';
      message += '• "Erstelle Liste [Name]"\n';
      message += '• "Rezept: [Zutatenliste]" (mit API Key)\n';
      message += '• "und [Artikel]" - Fortsetzung nach Artikel-Hinzufügung';
      
      return {
        success: true,
        message: message
      };
      
    } catch (error) {
      this.logger.error('ai', 'SHOW LISTS ERROR:', error);
      return {
        success: false,
        message: '❌ Fehler beim Laden der Listen.'
      };
    }
  }

  // ========================================
  // LIST VALIDATION AND HELPERS
  // ========================================

  async validateListExists(listName: string): Promise<{
    exists: boolean;
    list?: ShoppingList;
    error?: string;
  }> {
    try {
      const list = await this.findListByName(listName);
      
      return {
        exists: !!list,
        list: list || undefined
      };
      
    } catch (error) {
      return {
        exists: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getListSelectionOptions(): Promise<Array<{
    id: string;
    name: string;
    color: string;
    icon: string;
    itemCount: number;
  }>> {
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
      this.logger.error('ai', 'Error getting list selection options:', error);
      return [];
    }
  }

  // ========================================
  // LIST FINDING UTILITIES
  // ========================================

  async findListByName(listName: string): Promise<ShoppingList | null> {
    try {
      const lists = await this.dataService.getLists().pipe(
        take(1), 
        timeout(5000)
      ).toPromise();
      
      if (!lists) return null;
      
      const normalizedQuery = listName.toLowerCase().trim();
      
      // Exact match first (case-insensitive)
      let match = lists.find(list => 
        list.name.toLowerCase() === normalizedQuery
      );
      
      if (match) {
        this.logger.debug('ai', 'Found exact match:', match.name);
        return match;
      }
      
      // Partial match
      match = lists.find(list => 
        list.name.toLowerCase().includes(normalizedQuery) ||
        normalizedQuery.includes(list.name.toLowerCase())
      );
      
      if (match) {
        this.logger.debug('ai', 'Found partial match:', match.name);
      } else {
        this.logger.debug('ai', 'No match found for:', listName);
      }
      
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

  async findListByIdOrName(identifier: string): Promise<ShoppingList | null> {
    // Try by ID first (if it looks like an ID)
    if (identifier.length > 10 && !identifier.includes(' ')) {
      const listById = await this.findListById(identifier);
      if (listById) return listById;
    }
    
    // Try by name
    return this.findListByName(identifier);
  }

  // ========================================
  // LIST STATISTICS AND INFO
  // ========================================

  async getListStats(listId: string): Promise<{
    totalItems: number;
    checkedItems: number;
    uncheckedItems: number;
    departments: string[];
  } | null> {
    try {
      const list = await this.findListById(listId);
      if (!list) return null;

      const totalItems = list.articleIds?.length || 0;
      let checkedItems = 0;
      const departments = new Set<string>();

      // Get articles for department info
      const articles = await this.dataService.getArticles().pipe(take(1)).toPromise();
      const articleMap = new Map(articles?.map(a => [a.id, a]) || []);

      for (const articleId of list.articleIds || []) {
        const itemState = list.itemStates?.[articleId];
        if (itemState?.isChecked) {
          checkedItems++;
        }

        const article = articleMap.get(articleId);
        if (article?.departmentId) {
          departments.add(article.departmentId);
        }
      }

      return {
        totalItems,
        checkedItems,
        uncheckedItems: totalItems - checkedItems,
        departments: Array.from(departments)
      };

    } catch (error) {
      this.logger.error('ai', 'Error getting list stats:', error);
      return null;
    }
  }

  // ========================================
  // LIST MANAGEMENT UTILITIES
  // ========================================

  async duplicateList(originalListId: string, newName: string): Promise<AIExecutionResult> {
    try {
      const originalList = await this.findListById(originalListId);
      if (!originalList) {
        return {
          success: false,
          message: '❌ Original-Liste nicht gefunden.'
        };
      }

      const newListData = {
        name: newName,
        color: originalList.color || this.aiResponse.suggestListColor(newName),
        icon: originalList.icon || '🛒',
        articleIds: [...(originalList.articleIds || [])],
        itemStates: { ...originalList.itemStates }
      };

      // Reset all items to unchecked in the new list
      Object.keys(newListData.itemStates).forEach(articleId => {
        if (newListData.itemStates[articleId]) {
          newListData.itemStates[articleId].isChecked = false;
        }
      });

      const newList = await this.dataService.createList(newListData).toPromise();

      if (newList) {
        return {
          success: true,
          message: `✅ Liste "${newName}" wurde als Kopie von "${originalList.name}" erstellt.`,
          listId: newList.id
        };
      }

      return {
        success: false,
        message: '❌ Fehler beim Erstellen der Liste-Kopie.'
      };

    } catch (error) {
      this.logger.error('ai', 'Error duplicating list:', error);
      return {
        success: false,
        message: '❌ Fehler beim Duplizieren der Liste.'
      };
    }
  }

  async clearAllItemsFromList(listId: string): Promise<AIExecutionResult> {
    try {
      const result = await this.dataService.clearAllItemsFromList(listId).toPromise();
      
      if (result) {
        return {
          success: true,
          message: '✅ Alle Artikel wurden von der Liste entfernt.'
        };
      }

      return {
        success: false,
        message: '❌ Fehler beim Leeren der Liste.'
      };

    } catch (error) {
      this.logger.error('ai', 'Error clearing list:', error);
      return {
        success: false,
        message: '❌ Fehler beim Leeren der Liste.'
      };
    }
  }

  // ========================================
  // COLOR AND THEME UTILITIES
  // ========================================

  parseColorFromInput(input: string): ColorExtraction {
    return this.commandParser.extractColor(input);
  }

  suggestColorForListName(listName: string): string {
    return this.aiResponse.suggestListColor(listName);
  }

  getAvailableColors(): string[] {
    return this.aiResponse.getAvailableColors();
  }
}