// src/app/core/services/ai/command-processing.service.ts
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  AIExecutionResult,
  PendingAction,
  MultiItemPendingAction,
  DisambiguationOption
} from './ai-models';
import { QuantityExtractionService } from './quantity-extraction.service';
import { CommandParserService } from './command-parser.service';
import { DisambiguationService } from './disambiguation';
import { suggestDepartment, suggestIcon } from '../../utils/department-mapping.utils';
import { AIMessagingService } from './ai-messaging.service';
import { DataService } from '../data.service';
import { GroqApiService } from './groq-api.service';
import { ContextManagementService } from './context-management.service';
import { ShoppingList, Article } from '../../models';
import { ArticleOperationsService } from './article-operations.service';
import { ListOperationsService } from './list-operations.service';
import { MultiItemProcessorService } from './multi-item-processor.service';
import { ActionExecutorService } from './action-executor.service';
import { LoggerService } from '../logger.service';


@Injectable({
  providedIn: 'root'
})
export class CommandProcessingService {

  constructor(
    private quantityExtraction: QuantityExtractionService,
    private commandParser: CommandParserService,
    private disambiguation: DisambiguationService,
    private aiResponse: AIMessagingService,
    private dataService: DataService,
    private groqApi: GroqApiService,
    private contextManager: ContextManagementService,
    private articleOps: ArticleOperationsService,
    private listOps: ListOperationsService,
    private multiItemProcessor: MultiItemProcessorService,
    private actionExecutor: ActionExecutorService,
    private logger: LoggerService
  ) {}

  // ========================================
  // ENHANCED COMMAND PROCESSING
  // ========================================

  async processEnhancedCommand(input: string): Promise<AIExecutionResult> {
    this.logger.debug('ai', 'PROCESSING ENHANCED COMMAND:', input);
    
    // Extract quantity from input
    const quantityExtraction = this.quantityExtraction.extractQuantity(input);
    this.logger.debug('ai', 'Quantity extraction result:', quantityExtraction);
  
    // Parse command intent
    const intent = this.commandParser.parseIntent(input, quantityExtraction.itemName);
    this.logger.debug('ai', 'Parsed intent:', intent);
  
    // Check for unrecognized commands
    if (intent.itemName === 'UNRECOGNIZED_COMMAND' || 
        (intent as any).confidence !== undefined && (intent as any).confidence < 0.5) {
      this.logger.debug('ai', 'Unrecognized or low confidence command, providing guidance');
      return {
        success: false,
        message: `❌ Unbekannter Befehl: "${input}"<br><br>💡 Sage "Hilfe" für verfügbare Befehle`
      };
    }
  
    // Handle create list commands
    if (intent.type === 'create_list') {
      this.logger.debug('ai', 'Processing create list command');
      return await this.handleListCreationWithColor(input, quantityExtraction);
    }
  
    // Handle add item commands
    if (intent.type === 'add_item') {
      this.logger.debug('ai', 'Processing add item command');
      
      // Check conversation context for target list
      const conversationContext = this.contextManager.getConversationContext();
      let targetListName = intent.listName;
      let targetListId: string | undefined;
      
      // If no explicit list in command but we have conversation context, use it
      if (!targetListName && conversationContext.waitingForArticles) {
        targetListName = conversationContext.waitingForArticles.listName;
        targetListId = conversationContext.waitingForArticles.listId;
        this.logger.debug('ai', 'Using target list from conversation context:', { targetListName, targetListId });
      }
      
      const pendingAction: PendingAction = {
        type: intent.type,
        originalInput: input,
        itemName: quantityExtraction.itemName,
        extractedQuantity: quantityExtraction.quantity,
        listName: targetListName,
        suggestedDepartment: suggestDepartment(quantityExtraction.itemName)
      };
  
      // Store conversation list ID in pending action for disambiguation service
      if (targetListId) {
        (pendingAction as any).conversationListId = targetListId;
      }
  
      this.logger.debug('ai', 'Created pending action with conversation context:', pendingAction);
  
      return await this.handleItemActionWithDisambiguation(pendingAction);
    }
  
    // Fallback to basic processing
    return this.processBasicCommand(input);
  }

  // Add back executeActionWithNewArticleToList method
  private async executeActionWithNewArticle(action: PendingAction): Promise<AIExecutionResult> {
    return this.actionExecutor.executeActionWithNewArticle(action);
  }

  // Add back createArticleInConversationContext method  
  async createArticleInConversationContext(
    quantityExtraction: any, 
    listId: string, 
    listName: string
  ): Promise<AIExecutionResult> {
    this.logger.info('ai', 'Creating article in conversation context:', {
      itemName: quantityExtraction.itemName,
      quantity: quantityExtraction.quantity,
      listId,
      listName
    });
    
    // Check for disambiguation first
    const disambiguationOptions = await this.disambiguation.getDisambiguationOptions(quantityExtraction.itemName);
    const existingOptions = disambiguationOptions.filter((opt: DisambiguationOption) => opt.type === 'existing');

    
    if (existingOptions.length > 0) {
      this.logger.info('ai', 'Found existing articles, showing disambiguation');
      
      const pendingAction: PendingAction = {
        type: 'add_item',
        originalInput: quantityExtraction.itemName,
        itemName: quantityExtraction.itemName,
        extractedQuantity: quantityExtraction.quantity,
        listName: listName,
        suggestedDepartment: suggestDepartment(quantityExtraction.itemName),
        conversationListId: listId
      } as any;
      
      const enhancedOptions = [
        ...disambiguationOptions,
        {
          id: 'skip_item',
          displayName: `"${quantityExtraction.itemName}" überspringen`,
          type: 'skip' as const,
          confidence: 1.0,
          icon: '⏭️'
        }
      ];
      
      return {
        success: true,
        message: this.aiResponse.getDisambiguationMessage(quantityExtraction.itemName),
        needsUserInput: true,
        disambiguationOptions: enhancedOptions,
        pendingAction: pendingAction
      };
    }
    
    // No disambiguation needed - create and add
    const result = await this.articleOps.createAndAddToListById(quantityExtraction, listId);
    
    if (result.success) {
      // Maintain conversation context
      this.contextManager.updateContextForArticleAdded(listId, listName, quantityExtraction.itemName);
      
      return {
        success: true,
        message: result.message,
        listId: listId,
        conversationContext: this.contextManager.getConversationContext(),
        followUpPrompt: this.aiResponse.getArticleAddedFollowUpPrompt(quantityExtraction.itemName, listName)
      };
    }
    
    return result;
  }

  // ========================================
  // BASIC COMMAND PROCESSING
  // ========================================

  async processBasicCommand(input: string): Promise<AIExecutionResult> {
    this.logger.debug('ai', 'PROCESSING BASIC COMMAND:', input);
    
    const lowerInput = input.toLowerCase();
    const originalInput = input.trim();
    
    // Extract quantity and item name
    const quantityExtraction = this.quantityExtraction.extractQuantity(originalInput);
    
    // Handle list creation
    if (lowerInput.includes('erstelle') && lowerInput.includes('liste')) {
      return await this.handleListCreationWithColor(originalInput, quantityExtraction);
    }
    
    // Handle item addition
    if (lowerInput.includes('füge') && lowerInput.includes('hinzu')) {
      return await this.handleItemAdditionBasic(originalInput, quantityExtraction);
    }
    
    // Unrecognized command response
    return {
      success: false,
      message: `❌ Unbekannter Befehl: "${originalInput}"<br><br>💡 Sage "Hilfe" für verfügbare Befehle${!this.groqApi.hasApiKey() ? '<br>🔑 Groq API Key nicht gesetzt' : ''}`
    };
  }

  // ========================================
  // MULTI-ITEM PROCESSING
  // ========================================

  async processEnhancedCommandWithMultiItems(input: string): Promise<AIExecutionResult> {
    this.logger.debug('ai', 'PROCESSING ENHANCED COMMAND WITH MULTI-ITEMS (LIST-FIRST):', input);
    
    const result = await this.multiItemProcessor.processMultiItemCommand(input);
    
    // Handle fallback to single item processing
    if ((result as any).shouldFallbackToSingle) {
      this.logger.debug('ai', 'Falling back to single item processing');
      return this.processEnhancedCommand(input);
    }
    
    // Handle single list selection
    if ((result as any).singleListId) {
      // Extract the list info and continue processing
      const listId = (result as any).singleListId;
      const listName = (result as any).singleListName;
      
      // Re-parse the input and process with the single list
      const multiItemResult = this.quantityExtraction.parseMultipleItems(input);
      return this.multiItemProcessor.executeMultiItemProcessing(multiItemResult, listId, listName);
    }
    
    return result;
  }

  // ========================================
  // LIST OPERATIONS
  // ========================================

  private async handleListCreationWithColor(input: string, quantityExtraction: any): Promise<AIExecutionResult> {
    return this.listOps.createListFromCommand(input, quantityExtraction);
  }

  async handleShowListsCommand(): Promise<AIExecutionResult> {
    return this.listOps.showAllLists();
  }

  // ========================================
  // ITEM OPERATIONS
  // ========================================

  private async handleItemActionWithDisambiguation(action: PendingAction): Promise<AIExecutionResult> {
    this.logger.debug('ai', 'Handling item action with disambiguation:', action);

    // Get disambiguation options
    const disambiguationOptions = await this.disambiguation.getDisambiguationOptions(action.itemName);
    this.logger.debug('ai', 'Disambiguation options:', disambiguationOptions.length);

    const existingOptions = disambiguationOptions.filter((opt: DisambiguationOption) => opt.type === 'existing');
    
    if (existingOptions.length > 0) {
      this.logger.debug('ai', 'Found existing options, showing disambiguation');
      
      const enhancedOptions = [
        ...disambiguationOptions,
        {
          id: 'skip_item',
          displayName: `"${action.itemName}" überspringen`,
          type: 'skip' as const,
          confidence: 1.0,
          icon: '⏭️'
        }
      ];
      
      return {
        success: true,
        message: this.aiResponse.getDisambiguationMessage(action.itemName),
        needsUserInput: true,
        disambiguationOptions: enhancedOptions,
        pendingAction: action
      };
    }

    // No existing items found - create new article directly
    this.logger.debug('ai', 'No existing options, creating new article');
    return await this.executeActionWithNewArticle(action);
  }

  private async handleItemAdditionBasic(input: string, quantityExtraction: any): Promise<AIExecutionResult> {
    this.logger.debug('ai', 'HANDLING BASIC ITEM ADDITION:', input);
    
    const lowerInput = input.toLowerCase();
    
    // Parse add patterns
    const addMatch = lowerInput.match(/füge\s+(.+?)\s+(?:zu\s+(.+?)\s+)?hinzu/);
    
    if (!addMatch) {
      return {
        success: false,
        message: `❌ Unverständlicher Hinzufügen-Befehl: "${input}"\n\n💡 Beispiele:\n• "Füge Bananen hinzu"\n• "Füge drei kg Bananen zu Spar hinzu"`
      };
    }
    
    // Extract list name from original input
    const originalAddMatch = input.match(/füge\s+(.+?)\s+(?:zu\s+(.+?)\s+)?hinzu/i);
    const listName = originalAddMatch?.[2]?.trim();
    const finalItemName = quantityExtraction.itemName;
    
    // Create pending action
    const pendingAction: PendingAction = {
      type: listName ? 'add_item' : 'select_list',
      originalInput: input,
      itemName: finalItemName,
      extractedQuantity: quantityExtraction.quantity,
      listName: listName,
      suggestedDepartment: suggestDepartment(quantityExtraction.itemName)
    };

    if (!listName) {
      // Ask for list selection
      const listOptions = await this.disambiguation.getListSelectionOptions();
      
      if (listOptions.length === 0) {
        return {
          success: false,
          message: this.aiResponse.getNoListsFoundMessage()
        };
      }

      if (listOptions.length === 1) {
        // Use the only available list directly
        return this.actionExecutor.executeActionWithNewArticle({
          ...pendingAction,
          listName: listOptions[0].name
        });
      }

      // Multiple lists - ask user to choose
      pendingAction.type = 'select_list';
      pendingAction.articleToAdd = {
        name: finalItemName,
        amount: quantityExtraction.quantity || '',
        departmentId: this.aiResponse.suggestDepartment(finalItemName),
        icon: this.aiResponse.suggestIcon(finalItemName)
      };

      return {
        success: true,
        message: this.aiResponse.getListSelectionMessage(finalItemName, quantityExtraction.quantity),
        needsUserInput: true,
        disambiguationOptions: this.disambiguation.convertListsToDisambiguationOptions(listOptions),
        pendingAction: pendingAction
      };
    }

    // List was specified - proceed with addition
    return this.actionExecutor.executeActionWithNewArticle({
      ...pendingAction,
      listName: listName
    });
  }

}