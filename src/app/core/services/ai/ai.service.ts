// src/app/core/services/ai/ai.service.ts
import { Injectable } from '@angular/core';
import {
  AIExecutionResult,
  DisambiguationOption,
  PendingAction,
  MultiItemPendingAction,
  ApiKeyStatus,
  isMultiItemPendingAction
} from './ai-models';
import { QuantityExtractionService } from './quantity-extraction.service';
import { CommandParserService } from './command-parser.service';
import { DisambiguationService } from './disambiguation.service';
import { AIResponseService } from './ai-response.service';
import { CommandProcessingService } from './command-processing.service';
import { RecipeProcessingService } from './recipe-processing.service';
import { ContextManagementService } from './context-management.service';
import { GroqApiService } from './groq-api.service';
import { ContinuationHandlingService } from './continuation-handling.service';
import { SmartSuggestionsService } from './smart-suggestions.service';
import { ConversationContext } from '../../models';

@Injectable({
  providedIn: 'root'
})
export class AIService {
  constructor(
    private quantityExtraction: QuantityExtractionService,
    private commandParser: CommandParserService,
    private disambiguation: DisambiguationService,
    private aiResponse: AIResponseService,
    private commandProcessing: CommandProcessingService,
    private recipeProcessing: RecipeProcessingService,
    private contextManager: ContextManagementService,
    private groqApi: GroqApiService,
    private continuationHandling: ContinuationHandlingService,
    private smartSuggestions: SmartSuggestionsService
  ) {
    this.ensureRequiredMethods();
  }

  // ========================================
  // PUBLIC API - MAIN COMMAND EXECUTION
  // ========================================

  async executeCommand(input: string): Promise<AIExecutionResult> {
    console.log('🗣️ EXECUTING COMMAND:', input);
    console.log('🗣️ Current context:', this.getConversationContext());

    try {
      // Check for recipe commands
      if (this.recipeProcessing.isRecipeCommand(input)) {
        console.log('🎯 Recipe command detected');
        return await this.recipeProcessing.processRecipeCommand(
          input,
          (cmd) => this.commandProcessing.processEnhancedCommandWithMultiItems(cmd)
        );
      }

     // Check for + prefix commands (add article shorthand)
      if (input.trim().startsWith('+')) {
        console.log('🎯 Plus-prefix command detected');
        const itemText = input.trim().substring(1).trim();
        
        if (itemText.length > 0) {
          // CRITICAL FIX: Check for multiple items first
          if (itemText.includes(',')) {
            console.log('🎯 Plus command with multiple items detected');
            const enhancedCommand = `Füge ${itemText} hinzu`;
            return await this.commandProcessing.processEnhancedCommandWithMultiItems(enhancedCommand);
          } else {
            // Single item - but we want list selection FIRST
            console.log('🎯 Plus command with single item - checking lists first');
            
            // Get list options first
            const listOptions = await this.disambiguation.getListSelectionOptions();
            
            if (listOptions.length === 0) {
              return {
                success: false,
                message: this.aiResponse.getNoListsFoundMessage()
              };
            }
            
            if (listOptions.length === 1) {
              // Only one list - proceed with normal flow
              const enhancedCommand = `Füge ${itemText} zu ${listOptions[0].name} hinzu`;
              console.log('🎯 Using only available list:', enhancedCommand);
              
              if (this.hasApiKey()) {
                return await this.commandProcessing.processEnhancedCommand(enhancedCommand);
              } else {
                return await this.commandProcessing.processBasicCommand(enhancedCommand);
              }
            } else {
              // Multiple lists - ask for selection FIRST
              const quantityExtraction = this.quantityExtraction.extractQuantity(itemText);
              
              const listSelectionAction: PendingAction = {
                type: 'select_list',
                originalInput: `+${itemText}`,
                itemName: quantityExtraction.itemName,
                extractedQuantity: quantityExtraction.quantity,
                listName: undefined,
                suggestedDepartment: this.disambiguation.suggestDepartment(quantityExtraction.itemName),
                articleToAdd: {
                  name: quantityExtraction.itemName,
                  amount: quantityExtraction.quantity || '',
                  departmentId: this.disambiguation.suggestDepartment(quantityExtraction.itemName),
                  icon: this.disambiguation.suggestIcon(quantityExtraction.itemName)
                }
              };
              
              return {
                success: true,
                message: `🎯 Zu welcher Liste soll "${quantityExtraction.itemName}"${quantityExtraction.quantity ? ` (${quantityExtraction.quantity})` : ''} hinzugefügt werden?`,
                needsUserInput: true,
                disambiguationOptions: this.disambiguation.convertListsToDisambiguationOptions(listOptions),
                pendingAction: listSelectionAction
              };
            }
          }
        } else {
          return {
            success: false,
            message: '❌ Kein Artikel nach "+" angegeben.\n\n💡 Beispiel: "+Brot" fügt Brot zu einer Liste hinzu.'
          };
        }
      }

      // Check for multi-item input
      if (this.quantityExtraction.hasMultipleItems(input)) {
        console.log('🎯 Multi-item detected');
        return await this.commandProcessing.processEnhancedCommandWithMultiItems(input);
      }
      
      // Check for continuation keywords
      if (this.continuationHandling.isContinuationKeyword(input)) {
        console.log('🗣️ Continuation keyword detected');
        return await this.continuationHandling.handleContinuationCommand(
          input,
          (cmd) => this.commandProcessing.processEnhancedCommand(cmd)
        );
      }
      
      // Handle API key commands
      if (input.toLowerCase().includes('api key')) {
        return this.handleApiKeyCommand(input);
      }
      
      // Handle help commands
      if (input.toLowerCase().includes('hilfe') || input.toLowerCase().includes('help')) {
        this.clearConversationContext();
        return {
          success: true,
          message: this.aiResponse.getEnhancedHelpMessage(this.hasApiKey())
        };
      }
      
      // Handle system test commands
      if (input.toLowerCase().includes('test')) {
        return {
          success: true,
          message: this.aiResponse.getSystemStatusMessage(this.hasApiKey())
        };
      }
  
      // Handle show lists command
      if (input.toLowerCase().includes('zeige') && input.toLowerCase().includes('liste')) {
        this.clearConversationContext();
        return await this.commandProcessing.handleShowListsCommand();
      }
  
      // Handle negative responses in conversation
      if (this.contextManager.isWaitingForArticles() && 
          this.continuationHandling.isNegativeResponse(input)) {
        return this.continuationHandling.handleNegativeResponse();
      }
  
      // Handle contextual article addition
      if (this.continuationHandling.shouldProcessAsContextual(input)) {
        console.log('🗣️ Processing simple article in context');
        return await this.continuationHandling.handleContextualArticleAddition(
          input,
          (extraction, listId, listName) => 
            this.commandProcessing.createArticleInConversationContext(extraction, listId, listName),
          (cmd) => this.commandProcessing.processEnhancedCommandWithMultiItems(cmd),
          (input) => this.quantityExtraction.extractQuantity(input)
        );
      }
  
      // Process new commands
      this.clearConversationContext();
      
      if (this.hasApiKey()) {
        return await this.commandProcessing.processEnhancedCommand(input);
      } else {
        return await this.commandProcessing.processBasicCommand(input);
      }
      
    } catch (error) {
      console.error('AI Service error:', error);
      this.clearConversationContext();
      return {
        success: false,
        message: `❌ Ein Fehler ist aufgetreten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public get quantityExtractionService(): QuantityExtractionService {
    return this.quantityExtraction;
  }
  
  public get aiResponseService(): AIResponseService {
    return this.aiResponse;
  }

  // ========================================
  // PUBLIC API - DISAMBIGUATION
  // ========================================

  async handleDisambiguationChoice(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('🎯 Handling disambiguation choice with conversation context');
    console.log('🎯 Pending action:', pendingAction);
    console.log('🎯 Selected option:', selectedOption);
    
    // Handle disambiguation choice
    const result = await this.disambiguation.handleDisambiguationChoice(pendingAction, selectedOption);
    
    // Restore and enhance context after successful addition
    if (result.success && result.listId && result.message.includes('hinzugefügt')) {
      const messageMatch = result.message.match(/"([^"]+)" wurde (?:erstellt und )?zur Liste "([^"]+)" hinzugefügt/);
      const articleName = messageMatch?.[1] || pendingAction.itemName;
      const listName = messageMatch?.[2] || pendingAction.listName || 'Unbekannt';
      
      this.contextManager.updateContextForArticleAdded(result.listId, listName, articleName);
      
      result.conversationContext = this.getConversationContext();
      result.followUpPrompt = 'Du kannst direkt weitere Artikel zur letzt gewählten Liste hinzufügen (zB "Käse, Tomaten"). Wenn du damit fertig bist, kannst du rechts unten den ✅-Button klicken.';
    }
    
    return result;
  }

  async getDisambiguationOptions(itemName: string): Promise<DisambiguationOption[]> {
    return this.disambiguation.getDisambiguationOptions(itemName);
  }

  // ========================================
  // PUBLIC API - CONTEXT MANAGEMENT
  // ========================================

  setConversationContext(context: ConversationContext): void {
    this.contextManager.setConversationContext(context);
  }
  
  getConversationContext(): ConversationContext {
    return this.contextManager.getConversationContext();
  }
  
  clearConversationContext(): void {
    this.contextManager.clearConversationContext();
  }

  // ========================================
  // PUBLIC API - API KEY MANAGEMENT
  // ========================================

  setApiKey(apiKey: string): void {
    this.groqApi.setApiKey(apiKey);
  }

  hasApiKey(): boolean {
    return this.groqApi.hasApiKey();
  }

  getApiKeyStatus(): ApiKeyStatus {
    return this.groqApi.getApiKeyStatus();
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

  private handleApiKeyCommand(input: string): AIExecutionResult {
    const keyPattern = /(?:set\s+)?api\s+key[:\s]+([a-zA-Z0-9_-]+)/i;
    const match = input.match(keyPattern);
    
    if (match && match[1]) {
      const apiKey = match[1].trim();
      
      if (this.groqApi.validateApiKey(apiKey)) {
        this.setApiKey(apiKey);
        return {
          success: true,
          message: this.aiResponse.getApiKeySuccessMessage()
        };
      } else {
        return {
          success: false,
          message: this.aiResponse.getApiKeyErrorMessage()
        };
      }
    }
    
    const hasKey = this.hasApiKey();
    return {
      success: true,
      message: this.aiResponse.getApiKeyInstructions(hasKey)
    };
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  private ensureRequiredMethods(): void {
    // Ensure quantityExtraction has required methods
    if (!this.quantityExtraction.hasMultipleItems) {
      this.quantityExtraction.hasMultipleItems = (input: string) => {
        return input.includes(',') && input.split(',').length > 1;
      };
    }

    if (!this.quantityExtraction.parseMultipleItems) {
      this.quantityExtraction.parseMultipleItems = (input: string) => {
        const items = input.split(',').map(item => {
          const extraction = this.quantityExtraction.extractQuantity(item.trim());
          return {
            itemName: extraction.itemName,
            quantity: extraction.quantity,
            originalText: item.trim(),
            confidence: 'high' as const
          };
        });
        
        return {
          command: 'add_items' as const,
          items: items,
          listName: undefined,
          originalInput: input,
          parseErrors: []
        };
      };
    }
    
    // Ensure commandParser has required methods
    if (!this.commandParser.parseIntent) {
      this.commandParser.parseIntent = (input: string, cleanItemName?: string) => {
        const lowerInput = input.toLowerCase();
        const itemName = cleanItemName || '';
        
        if (lowerInput.includes('erstelle') && lowerInput.includes('liste')) {
          const listMatch = input.match(/erstelle\s+liste\s+(.+?)(?:\s+mit|$)/i);
          return {
            type: 'create_list' as const,
            listName: listMatch?.[1]?.trim(),
            itemName: itemName,
            originalInput: input,
            confidence: 0.9
          };
        }
        
        if (lowerInput.includes('füge') && lowerInput.includes('hinzu')) {
          const listMatch = input.match(/zu\s+(.+?)\s+hinzu/i);
          return {
            type: 'add_item' as const,
            listName: listMatch?.[1]?.trim(),
            itemName: itemName,
            originalInput: input,
            confidence: 0.8
          };
        }
        
        return {
          type: 'add_item' as const,
          listName: undefined,
          itemName: itemName || input,
          originalInput: input,
          confidence: 0.3
        };
      };
    }
    
    if (!this.commandParser.extractColor) {
      this.commandParser.extractColor = (input: string) => {
        const colorMatch = input.match(/in\s+(rot|blau|grün|gelb|orange|lila|schwarz|weiß)/i);
        const colorMap: Record<string, string> = {
          'rot': '#f44336',
          'blau': '#2196f3',
          'grün': '#4caf50',
          'gelb': '#ffeb3b',
          'orange': '#ff9800',
          'lila': '#9c27b0',
          'schwarz': '#424242',
          'weiß': '#ffffff'
        };
        
        if (colorMatch) {
          return {
            colorName: colorMatch[1],
            colorHex: colorMap[colorMatch[1].toLowerCase()],
            cleanInput: input.replace(colorMatch[0], '').trim()
          };
        }
        
        return {
          cleanInput: input
        };
      };
    }
  }

}