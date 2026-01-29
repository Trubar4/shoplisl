// src/app/core/services/ai/action-executor.service.ts
import { Injectable } from '@angular/core';
import { ArticleOperationsService } from './article-operations.service';
import { ListOperationsService } from './list-operations.service';
import { DisambiguationService } from './disambiguation';
import { AIMessagingService } from './ai-messaging.service';
import { ContextManagementService } from './context-management.service';
import { DataService } from '../data.service';
import { HistoryService } from '../history.service';
import { AuthService } from '../auth.service';
import { PendingAction, AIExecutionResult } from './ai-models';
import { LoggerService } from '../logger.service';

@Injectable({
  providedIn: 'root'
})
export class ActionExecutorService {

  constructor(
    private articleOps: ArticleOperationsService,
    private listOps: ListOperationsService,
    private disambiguation: DisambiguationService,
    private aiResponse: AIMessagingService,
    private contextManager: ContextManagementService,
    private dataService: DataService,
    private historyService: HistoryService,
    private authService: AuthService,
    private logger: LoggerService
  ) {}

  // ========================================
  // MAIN ACTION EXECUTION ENTRY POINT
  // ========================================

  async executeActionWithNewArticle(action: PendingAction): Promise<AIExecutionResult> {
    this.logger.debug('ai', Executing action with new article:', action.itemName);
    
    try {
      // Route to appropriate handler based on action type
      switch (action.type) {
        case 'create_list':
          return this.executeCreateListWithArticle(action);
          
        case 'add_item':
          return this.executeAddItemAction(action);
          
        default:
          return this.executeGenericAction(action);
      }
      
    } catch (error) {
      this.logger.error('ai', Error executing action with new article:', error);
      return {
        success: false,
        message: '❌ Fehler beim Erstellen des neuen Artikels.'
      };
    }
  }

  // ========================================
  // CREATE LIST WITH FIRST ARTICLE
  // ========================================

  private async executeCreateListWithArticle(action: PendingAction): Promise<AIExecutionResult> {
    this.logger.debug('ai', Creating list with first article:', action.listName);
    
    if (!action.listName) {
      return {
        success: false,
        message: '❌ Listenname fehlt für die Erstellung.'
      };
    }

    try {
      // Create the article first
      const newArticle = await this.articleOps.createArticleWithSuggestions({
        itemName: action.itemName,
        quantity: action.extractedQuantity || ''
      });

      if (!newArticle) {
        throw new Error('Failed to create article');
      }

      // Create list with the article
      const currentUser = this.authService.getCurrentUserValue();
      const listData = {
        name: action.listName,
        color: this.aiResponse.suggestListColor(action.listName),
        icon: '🛒',
        articleIds: [newArticle.id],
        itemStates: {
          [newArticle.id]: this.historyService.createUpdatedItemState(
            undefined,
            newArticle.id,
            'added',
            action.extractedQuantity || '',
            currentUser?.id,
            currentUser?.name,
            newArticle.name
          )
        }
      };

      const newList = await this.dataService.createList(listData).toPromise();

      if (newList) {
        this.contextManager.updateContextForListCreated(newList.id, newList.name);

        return {
          success: true,
          message: `✅ Liste "${newList.name}" wurde mit "${newArticle.name}" erstellt.`,
          listId: newList.id,
          conversationContext: this.contextManager.getConversationContext(),
          followUpPrompt: this.aiResponse.getListCreatedFollowUpPrompt(newList.name)
        };
      }

      throw new Error('Failed to create list');

    } catch (error) {
      this.logger.error('ai', Error creating list with article:', error);
      return {
        success: false,
        message: `❌ Fehler beim Erstellen der Liste "${action.listName}" mit "${action.itemName}".`
      };
    }
  }

  // ========================================
  // ADD ITEM TO EXISTING OR SELECTED LIST
  // ========================================

  private async executeAddItemAction(action: PendingAction): Promise<AIExecutionResult> {
    this.logger.debug('ai', Executing add item action');
    
    // Check if we have a target list specified
    if (action.listName || (action as any).conversationListId) {
      return this.executeAddItemToSpecificList(action);
    }
    
    // No specific list - need to select one
    return this.executeAddItemWithListSelection(action);
  }

  private async executeAddItemToSpecificList(action: PendingAction): Promise<AIExecutionResult> {
    this.logger.debug('ai', Adding item to specific list:', action.listName);
    
    try {
      let targetListId = (action as any).conversationListId;
      let targetListName = action.listName;
      
      // Find the target list
      let targetList: any = null;
      
      if (targetListId) {
        targetList = await this.listOps.findListById(targetListId);
        if (targetList) {
          targetListName = targetList.name;
        }
      }
      
      if (!targetList && targetListName) {
        targetList = await this.listOps.findListByName(targetListName);
        if (targetList) {
          targetListId = targetList.id;
        }
      }
      
      if (!targetList) {
        return {
          success: false,
          message: `❌ Liste "${targetListName || targetListId}" nicht gefunden.`
        };
      }
      
      // Create and add the article
      const result = await this.articleOps.createAndAddToListById(
        {
          itemName: action.itemName,
          quantity: action.extractedQuantity || ''
        },
        targetList.id
      );
      
      if (result.success) {
        // Update conversation context
        this.contextManager.updateContextForArticleAdded(
          targetList.id,
          targetList.name,
          action.itemName
        );
        
        return {
          success: true,
          message: result.message,
          listId: targetList.id,
          conversationContext: this.contextManager.getConversationContext(),
          followUpPrompt: this.aiResponse.getArticleAddedFollowUpPrompt(action.itemName, targetList.name)
        };
      }
      
      return result;
      
    } catch (error) {
      this.logger.error('ai', Error adding item to specific list:', error);
      return {
        success: false,
        message: `❌ Fehler beim Hinzufügen von "${action.itemName}" zur Liste.`
      };
    }
  }

  private async executeAddItemWithListSelection(action: PendingAction): Promise<AIExecutionResult> {
    this.logger.debug('ai', Adding item with list selection required');
    
    try {
      // Get available lists
      const listOptions = await this.listOps.getListSelectionOptions();
      
      if (listOptions.length === 0) {
        return {
          success: false,
          message: this.aiResponse.getNoListsFoundMessage()
        };
      }

      if (listOptions.length === 1) {
        // Use the only available list directly
        const singleList = listOptions[0];
        return this.executeAddItemToSpecificList({
          ...action,
          listName: singleList.name
        });
      }

      // Multiple lists - ask user to choose
      const listSelectionAction: PendingAction = {
        type: 'select_list',
        originalInput: action.originalInput,
        itemName: action.itemName,
        extractedQuantity: action.extractedQuantity,
        listName: undefined,
        suggestedDepartment: action.suggestedDepartment,
        articleToAdd: {
          name: action.itemName,
          amount: action.extractedQuantity || '',
          departmentId: action.suggestedDepartment || 'miscellaneous',
          icon: this.aiResponse.suggestIcon(action.itemName)
        }
      };

      return {
        success: true,
        message: this.aiResponse.getListSelectionMessage(action.itemName, action.extractedQuantity),
        needsUserInput: true,
        disambiguationOptions: this.disambiguation.convertListsToDisambiguationOptions(listOptions),
        pendingAction: listSelectionAction
      };
      
    } catch (error) {
      this.logger.error('ai', Error in list selection flow:', error);
      return {
        success: false,
        message: `❌ Fehler beim Auswählen der Liste für "${action.itemName}".`
      };
    }
  }

  // ========================================
  // GENERIC ACTION HANDLER
  // ========================================

  private async executeGenericAction(action: PendingAction): Promise<AIExecutionResult> {
    this.logger.debug('ai', Executing generic action:', action.type);
    
    // Handle unknown action types by treating them as add_item
    return this.executeAddItemAction({
      ...action,
      type: 'add_item'
    });
  }

  // ========================================
  // VALIDATION AND UTILITIES
  // ========================================

  validateAction(action: PendingAction): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required fields
    if (!action.itemName || action.itemName.trim() === '') {
      errors.push('Artikelname ist erforderlich');
    }
    
    if (!action.type) {
      errors.push('Aktionstyp ist erforderlich');
    }
    
    // Type-specific validation
    if (action.type === 'create_list' && !action.listName) {
      errors.push('Listenname ist für Listenerstellung erforderlich');
    }
    
    // Warnings
    if (!action.extractedQuantity) {
      warnings.push('Keine Menge angegeben');
    }
    
    if (!action.suggestedDepartment) {
      warnings.push('Keine Abteilung vorgeschlagen');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  getActionSummary(action: PendingAction): string {
    const quantity = action.extractedQuantity ? ` (${action.extractedQuantity})` : '';
    const list = action.listName ? ` zu "${action.listName}"` : '';
    
    switch (action.type) {
      case 'create_list':
        return `Liste "${action.listName}" mit "${action.itemName}"${quantity} erstellen`;
      case 'add_item':
        return `"${action.itemName}"${quantity}${list} hinzufügen`;
      default:
        return `Aktion "${action.type}" für "${action.itemName}"${quantity} ausführen`;
    }
  }

  // ========================================
  // ERROR RECOVERY
  // ========================================

  createRetryAction(originalAction: PendingAction, errorContext: string): PendingAction {
    return {
      ...originalAction,
      type: 'retry_action',
      originalInput: originalAction.originalInput + ` (Wiederholung: ${errorContext})`,
      retryContext: errorContext
    } as any;
  }

  async suggestAlternativeAction(failedAction: PendingAction): Promise<AIExecutionResult> {
    this.logger.debug('ai', Suggesting alternative action for failed action:', failedAction);
    
    try {
      // If list creation failed, suggest adding to existing list
      if (failedAction.type === 'create_list') {
        const listOptions = await this.listOps.getListSelectionOptions();
        
        if (listOptions.length > 0) {
          return {
            success: true,
            message: `❌ Listenerstellung fehlgeschlagen.\n\n💡 Möchtest du "${failedAction.itemName}" zu einer bestehenden Liste hinzufügen?`,
            needsUserInput: true,
            disambiguationOptions: this.disambiguation.convertListsToDisambiguationOptions(listOptions),
            pendingAction: {
              ...failedAction,
              type: 'add_item',
              listName: undefined
            }
          };
        }
      }
      
      // Generic fallback suggestion
      return {
        success: false,
        message: `❌ Aktion fehlgeschlagen.\n\n💡 Versuche es mit:\n• "Füge ${failedAction.itemName} hinzu"\n• "Erstelle Liste [Name]"\n• "Hilfe" für weitere Optionen`
      };
      
    } catch (error) {
      return {
        success: false,
        message: '❌ Unerwarteter Fehler. Versuche es erneut oder sage "Hilfe".'
      };
    }
  }
}