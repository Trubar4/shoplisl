// src/app/core/services/ai/multi-item-processor.service.ts
import { Injectable } from '@angular/core';
import { QuantityExtractionService } from './quantity-extraction.service';
import { DisambiguationService } from './disambiguation';
import { suggestDepartment, suggestIcon } from '../../utils/department-mapping.utils';
import { ContextManagementService } from './context-management.service';
import { ListOperationsService } from './list-operations.service';
import { AIMessagingService } from './ai-messaging.service';
import { GroqApiService } from './groq-api.service';
import {
  AIExecutionResult,
  MultiItemPendingAction,
  PendingAction,
  MultiItemParseResult,
  ParsedItem
} from './ai-models';
import { LoggerService } from '../logger.service';

@Injectable({
  providedIn: 'root'
})
export class MultiItemProcessorService {

  constructor(
    private quantityExtraction: QuantityExtractionService,
    private disambiguation: DisambiguationService,
    private contextManager: ContextManagementService,
    private listOps: ListOperationsService,
    private aiResponse: AIMessagingService,
    private groqApi: GroqApiService,
    private logger: LoggerService
  ) {}

  // ========================================
  // MAIN MULTI-ITEM PROCESSING ENTRY POINT
  // ========================================

  async processMultiItemCommand(input: string): Promise<AIExecutionResult> {
    this.logger.debug('ai', 'PROCESSING MULTI-ITEM COMMAND:', input);

    // Step 0: Check if input is complex and should be preprocessed with Groq
    let processedInput = input;

    // Skip Groq if input is already processed (from recipe service)
    const isAlreadyProcessed = /^füge\s+.+\s+hinzu$/i.test(input.trim());

    if (!isAlreadyProcessed && this.groqApi.hasApiKey() && this.groqApi.isComplexInput(input)) {
      this.logger.debug('ai', 'Detected complex input - preprocessing with Groq AI');

      try {
        processedInput = await this.groqApi.standardizeComplexInput(input);
        this.logger.debug('ai', 'Groq preprocessed result:', processedInput);
      } catch (groqError) {
        this.logger.warn('ai', 'Groq preprocessing failed, falling back to local parsing:', groqError);
        // Continue with original input if Groq fails
        processedInput = input;
      }
    } else if (isAlreadyProcessed) {
      this.logger.debug('ai', 'Input already preprocessed (from recipe service), skipping Groq');
    }

    // Step 1: Parse multiple items from input (using preprocessed input if available)
    const multiItemResult = this.quantityExtraction.parseMultipleItems(processedInput);

    if (multiItemResult.command === 'unrecognized' || multiItemResult.items.length === 0) {
      this.logger.debug('ai', 'No multi-items found, fallback to single item processing needed');
      // Return a special flag to indicate fallback is needed
      return {
        success: false,
        message: '❌ Keine Artikel in der Eingabe erkannt.',
        shouldFallbackToSingle: true
      } as any;
    }

    // Step 2: Determine target list strategy
    const targetStrategy = await this.determineTargetListStrategy(multiItemResult);

    if (!targetStrategy.success) {
      return targetStrategy.result!;
    }

    // Step 3: Execute with confirmed target list
    return this.executeMultiItemProcessing(multiItemResult, targetStrategy.targetListId!, targetStrategy.targetListName!);
  }

  // ========================================
  // TARGET LIST DETERMINATION STRATEGY
  // ========================================

  private async determineTargetListStrategy(multiItemResult: MultiItemParseResult): Promise<{
    success: boolean;
    targetListId?: string;
    targetListName?: string;
    result?: AIExecutionResult;
  }> {
    this.logger.debug('ai', 'Determining target list strategy');

    // Strategy 1: Check conversation context
    const contextResult = this.checkConversationContext();
    if (contextResult.found) {
      this.logger.debug('ai', 'Using target list from conversation context:', contextResult.listName);
      return {
        success: true,
        targetListId: contextResult.listId,
        targetListName: contextResult.listName
      };
    }

    // Strategy 2: Check command for explicit list name
    if (multiItemResult.listName) {
      this.logger.debug('ai', 'Using target list from command:', multiItemResult.listName);
      const targetList = await this.listOps.findListByName(multiItemResult.listName);
      
      if (targetList) {
        return {
          success: true,
          targetListId: targetList.id,
          targetListName: targetList.name
        };
      } else {
        return {
          success: false,
          result: {
            success: false,
            message: `❌ Liste "${multiItemResult.listName}" nicht gefunden.`
          }
        };
      }
    }

    // Strategy 3: Ask user to select list
    return this.requestListSelection(multiItemResult);
  }

  private checkConversationContext(): {
    found: boolean;
    listId?: string;
    listName?: string;
  } {
    const existingContext = this.contextManager.getConversationContext();
    
    if (existingContext.waitingForArticles) {
      return {
        found: true,
        listId: existingContext.waitingForArticles.listId,
        listName: existingContext.waitingForArticles.listName
      };
    }

    return { found: false };
  }

  private async requestListSelection(multiItemResult: MultiItemParseResult): Promise<{
    success: boolean;
    result: AIExecutionResult;
  }> {
    this.logger.debug('ai', 'No target list identified - asking user to select');
    
    const listOptions = await this.listOps.getListSelectionOptions();
    
    if (listOptions.length === 0) {
      return {
        success: false,
        result: {
          success: false,
          message: this.aiResponse.getNoListsFoundMessage()
        }
      };
    }

    if (listOptions.length === 1) {
      // Use the only available list - return success with special handling
      return {
        success: true,
        result: {
          success: true,
          message: `🎯 Verwende die einzige verfügbare Liste: "${listOptions[0].name}"`,
          singleListId: listOptions[0].id,
          singleListName: listOptions[0].name
        } as any
      };
    }

    // Multiple lists - ask for selection
    const listSelectionAction: PendingAction = {
      type: 'select_list_for_multi_items',
      originalInput: multiItemResult.originalInput || '',
      itemName: `${multiItemResult.items.length} Artikel`,
      extractedQuantity: '',
      listName: undefined,
      suggestedDepartment: 'miscellaneous',
      multiItemData: {
        items: multiItemResult.items,
        command: multiItemResult.command,
        originalInput: multiItemResult.originalInput || ''
      }
    } as any;

    return {
      success: false,
      result: {
        success: true,
        message: `Bitte wähle eine Liste.`,
        needsUserInput: true,
        disambiguationOptions: this.disambiguation.convertListsToDisambiguationOptions(listOptions),
        pendingAction: listSelectionAction
      }
    };
  }

  // ========================================
  // MULTI-ITEM EXECUTION WITH CONFIRMED LIST
  // ========================================

  public async executeMultiItemProcessing(
    multiItemResult: MultiItemParseResult,
    targetListId: string,
    targetListName: string
  ): Promise<AIExecutionResult> {
    this.logger.debug('ai', 'Executing multi-item processing with confirmed target list:', {
      targetListName,
      itemCount: multiItemResult.items.length
    });

    // Create the multi-action for sequential processing
    const multiAction: MultiItemPendingAction = {
      type: multiItemResult.command === 'create_list_with_items' ? 'create_list_with_multiple_items' : 'add_multiple_items',
      originalInput: multiItemResult.originalInput || '',
      itemName: multiItemResult.items[0]?.itemName || '',
      extractedQuantity: multiItemResult.items[0]?.quantity || '',
      items: multiItemResult.items,
      listName: targetListName,
      currentItemIndex: 0,
      processedItems: [],
      suggestedDepartment: suggestDepartment(multiItemResult.items[0]?.itemName || ''),
      conversationListId: targetListId,
      confirmedTargetListId: targetListId,
      confirmedTargetListName: targetListName
    } as any;

    // Start sequential processing
    return this.disambiguation.processMultiItemSequentially(multiAction);
  }

  // ========================================
  // VALIDATION AND UTILITIES
  // ========================================

  validateMultiItemInput(input: string): {
    isValid: boolean;
    itemCount: number;
    errors: string[];
  } {
    const multiItemResult = this.quantityExtraction.parseMultipleItems(input);
    
    const errors: string[] = [];
    
    if (multiItemResult.command === 'unrecognized') {
      errors.push('Befehl nicht erkannt');
    }
    
    if (multiItemResult.items.length === 0) {
      errors.push('Keine Artikel gefunden');
    }
    
    if (multiItemResult.items.length > 20) {
      errors.push('Zu viele Artikel (Maximum: 20)');
    }

    return {
      isValid: errors.length === 0,
      itemCount: multiItemResult.items.length,
      errors
    };
  }

  getMultiItemSummary(multiItemResult: MultiItemParseResult): string {
    const itemSummary = multiItemResult.items
      .map((item: ParsedItem) => `"${item.itemName}"${item.quantity ? ` (${item.quantity})` : ''}`)
      .join(', ');
    
    return `${multiItemResult.items.length} Artikel erkannt: ${itemSummary}`;
  }

  // ========================================
  // ERROR HANDLING AND RECOVERY
  // ========================================

  handleMultiItemError(error: Error, context: {
    input: string;
    currentItemIndex?: number;
    totalItems?: number;
  }): AIExecutionResult {
    this.logger.error('ai', 'Multi-item processing error:', { error, context });
    
    let message = '❌ Fehler bei der Verarbeitung mehrerer Artikel.';
    
    if (context.currentItemIndex !== undefined && context.totalItems !== undefined) {
      message += `\n\nFehler bei Artikel ${context.currentItemIndex + 1} von ${context.totalItems}.`;
    }
    
    message += '\n\n💡 Versuche es mit einzelnen Artikeln oder vereinfache die Eingabe.';
    
    return {
      success: false,
      message: message
    };
  }

  createRecoveryAction(
    originalInput: string,
    failedAtIndex: number,
    processedItems: any[]
  ): PendingAction {
    return {
      type: 'recover_multi_item',
      originalInput: originalInput,
      itemName: `Wiederherstellung ab Artikel ${failedAtIndex + 1}`,
      extractedQuantity: '',
      listName: undefined,
      suggestedDepartment: 'miscellaneous',
      recoveryData: {
        originalInput,
        failedAtIndex,
        processedItems
      }
    } as any;
  }
}