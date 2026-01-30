// src/app/core/services/ai/continuation-handling.service.ts
import { Injectable } from '@angular/core';
import { AIExecutionResult, ConversationContext } from './ai-models';
import { ContextManagementService } from './context-management.service';
import { LoggerService } from '../logger.service';

@Injectable({
  providedIn: 'root'
})
export class ContinuationHandlingService {
  private readonly CONTINUATION_KEYWORDS = ['und', 'weiters', 'außerdem', 'zusätzlich', 'noch', 'dann', 'danach'];
  private readonly NEGATIVE_WORDS = ['nein', 'no', 'nicht', 'stop', 'stopp', 'abbrechen', 'fertig', 'genug', 'ende', 'schluss'];
  private readonly MAX_CONTEXT_AGE = 10 * 60 * 1000; // 10 minutes

  constructor(
    private contextManager: ContextManagementService,
    private logger: LoggerService
  ) {}

  // ========================================
  // KEYWORD DETECTION
  // ========================================

  isContinuationKeyword(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    
    return this.CONTINUATION_KEYWORDS.some(keyword => 
      lowerInput.startsWith(keyword + ' ') || 
      lowerInput === keyword
    );
  }

  isNegativeResponse(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    
    return this.NEGATIVE_WORDS.some(word => 
      lowerInput === word || 
      lowerInput.startsWith(word + ' ') ||
      lowerInput.startsWith(word + ',') ||
      lowerInput.startsWith(word + '.')
    );
  }

  isSimpleArticleInput(input: string): boolean {
    const trimmedInput = input.trim().toLowerCase();
    
    // Check for command keywords
    if (trimmedInput.includes('füge') || 
        trimmedInput.includes('erstelle') || 
        trimmedInput.includes('hinzu') || 
        trimmedInput.includes('liste') ||
        trimmedInput.includes('zeige')) {
      return false;
    }
    
    // Check for negative responses
    if (this.isNegativeResponse(trimmedInput)) {
      return false;
    }
    
    // Check for valid simple input
    return trimmedInput.length > 0 && 
           trimmedInput.length < 100 && 
           !trimmedInput.includes('http') &&
           !trimmedInput.includes('www.');
  }

  // ========================================
  // CONTINUATION HANDLING
  // ========================================

  async handleContinuationCommand(
    input: string,
    processEnhancedCommand: (command: string) => Promise<AIExecutionResult>
  ): Promise<AIExecutionResult> {
    this.logger.debug('context', 'HANDLING CONTINUATION COMMAND:', input);
    
    const aiContext = this.contextManager.getConversationContext();
    const lastAction = aiContext.lastAction;
    
    if (lastAction && lastAction.listId) {
      const timeSince = Date.now() - lastAction.timestamp.getTime();
      
      if (timeSince < this.MAX_CONTEXT_AGE) {
        const lowerInput = input.toLowerCase().trim();
        let itemsText = input;
        
        // Extract items after continuation keywords
        for (const keyword of this.CONTINUATION_KEYWORDS) {
          if (lowerInput.startsWith(keyword + ' ')) {
            itemsText = input.substring(keyword.length + 1).trim();
            break;
          } else if (lowerInput === keyword) {
            // Just the keyword - activate continuation mode
            const restoredContext: ConversationContext = {
              lastAction: lastAction,
              waitingForArticles: {
                listId: lastAction.listId,
                listName: lastAction.listName,
                prompt: 'Continuation mode activated'
              }
            };
            
            this.contextManager.setConversationContext(restoredContext);
            
            return {
              success: true,
              message: `Was möchtest du noch zu "${lastAction.listName}" hinzufügen?`,
              conversationContext: restoredContext
            };
          }
        }
        
        if (itemsText.trim()) {
          // Set conversation context before processing
          const activatedContext: ConversationContext = {
            lastAction: lastAction,
            waitingForArticles: {
              listId: lastAction.listId,
              listName: lastAction.listName,
              prompt: 'Continuation mode'
            }
          };
          
          this.contextManager.setConversationContext(activatedContext);
          
          // Process the items with target list context
          const enhancedInput = `Füge ${itemsText} zu ${lastAction.listName} hinzu`;
          this.logger.debug('context', 'Processing enhanced continuation command:', enhancedInput);
          
          return await processEnhancedCommand(enhancedInput);
        }
      }
    }
    
    return {
      success: false,
      message: '💡 Keine kürzliche Liste gefunden zum Fortsetzen.\n\nVerwende Fortsetzungs-Wörter wie "und" oder "weiters" nur nach dem Hinzufügen von Artikeln zu einer Liste.'
    };
  }

  // ========================================
  // CONTEXTUAL ADDITIONS
  // ========================================

  async handleContextualArticleAddition(
    input: string,
    processArticleCallback: (
      quantityExtraction: any,
      listId: string,
      listName: string
    ) => Promise<AIExecutionResult>,
    processMultiItemsCallback: (command: string) => Promise<AIExecutionResult>,
    extractQuantityCallback: (input: string) => any
  ): Promise<AIExecutionResult> {
    const context = this.contextManager.getWaitingForArticlesContext();
    
    if (!context) {
      return {
        success: false,
        message: '❌ Fehler: Kein Kontext für Artikel-Hinzufügung.'
      };
    }
  
    const { listId, listName } = context;
    
    this.logger.debug('context', 'Handling contextual addition:', input);
    this.logger.debug('context', 'Target list:', { listName, listId });
    
    // Check for multiple items
    if (input.includes(',')) {
      this.logger.debug('context', 'Multiple items detected in contextual mode');
      const enhancedInput = `Füge ${input} zu ${listName} hinzu`;
      
      // Preserve context before processing
      const contextToPreserve = this.contextManager.preserveContext();
      const result = await processMultiItemsCallback(enhancedInput);
      
      // Restore context if it was lost
      if (result.success && !result.conversationContext) {
        this.logger.debug('context', 'Preserving conversation context after disambiguation');
        result.conversationContext = contextToPreserve;
        result.followUpPrompt = `Möchtest du noch weitere Artikel zu "${listName}" hinzufügen?`;
      }
      
      return result;
    }
    
    // Handle single item
    const quantityExtraction = extractQuantityCallback(input);
    this.logger.debug('context', 'Single item extraction:', quantityExtraction);
    
    // Validate extracted item name
    if (!quantityExtraction.itemName || quantityExtraction.itemName.trim().length < 2) {
      this.logger.error('context', 'Invalid item name extracted:', quantityExtraction);
      return {
        success: false,
        message: `❌ Ungültiger Artikelname: "${input}". Bitte versuche es erneut.`
      };
    }
    
    return await processArticleCallback(quantityExtraction, listId, listName);
  }

  // ========================================
  // NEGATIVE RESPONSE HANDLING
  // ========================================

  handleNegativeResponse(): AIExecutionResult {
    this.logger.debug('context', 'User declined to add more articles');
    this.contextManager.clearConversationContext();
    
    return {
      success: true,
      message: '👍 Fertig! Du kannst jederzeit neue Befehle eingeben.'
    };
  }

  // ========================================
  // CONTEXT HELPERS
  // ========================================

  extractContinuationItems(input: string): string | null {
    const lowerInput = input.toLowerCase().trim();
    
    for (const keyword of this.CONTINUATION_KEYWORDS) {
      if (lowerInput.startsWith(keyword + ' ')) {
        return input.substring(keyword.length + 1).trim();
      }
    }
    
    return null;
  }

  isWithinContextWindow(): boolean {
    return this.contextManager.isContextValid(this.MAX_CONTEXT_AGE);
  }

  shouldProcessAsContextual(input: string): boolean {
    return this.contextManager.isWaitingForArticles() && 
           this.isSimpleArticleInput(input) && 
           !this.isNegativeResponse(input);
  }
}