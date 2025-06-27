// src/app/core/services/ai/ai.service.ts - Enhanced with Conversation Context
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  AIExecutionResult,
  DisambiguationOption,
  PendingAction,
  MultiItemPendingAction,
  ApiKeyStatus,
  isMultiItemPendingAction,
  AIServiceError
} from './ai-models';
import { QuantityExtractionService } from './quantity-extraction.service';
import { CommandParserService } from './command-parser.service';
import { DisambiguationService } from './disambiguation.service';
import { AIResponseService } from './ai-response.service';
import { DataService } from '../data';
import { ShoppingList, ConversationContext } from '../../models';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AIService {
  private readonly GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

  // NEW: Conversation context tracking
  private conversationContext: ConversationContext = {};

  constructor(
    private quantityExtraction: QuantityExtractionService,
    private commandParser: CommandParserService,
    private disambiguation: DisambiguationService,
    private aiResponse: AIResponseService,
    private dataService: DataService
  ) {
    this.logApiKeyStatus();
  }

  // ========================================
  // CONVERSATION CONTEXT MANAGEMENT
  // ========================================

  /**
   * Set conversation context after successful actions
   */
  private setConversationContext(context: ConversationContext): void {
    this.conversationContext = { ...context };
    console.log('🗣️ Conversation context updated:', this.conversationContext);
  }

  /**
   * Clear conversation context
   */
  private clearConversationContext(): void {
    this.conversationContext = {};
    console.log('🗣️ Conversation context cleared');
  }

  /**
   * Check if we're waiting for articles to be added
   */
  private isWaitingForArticles(): boolean {
    return !!this.conversationContext.waitingForArticles;
  }

  /**
   * Get current conversation context
   */
  getConversationContext(): ConversationContext {
    return { ...this.conversationContext };
  }

  /**
   * Check if input is a simple article name (not a full command)
   */
  private isSimpleArticleInput(input: string): boolean {
    const trimmedInput = input.trim().toLowerCase();
    
    console.log('🗣️ Checking if simple article input:', trimmedInput);
    
    // Not a simple article if it contains command keywords
    if (trimmedInput.includes('füge') || 
        trimmedInput.includes('erstelle') || 
        trimmedInput.includes('hinzu') || 
        trimmedInput.includes('liste') ||
        trimmedInput.includes('zeige')) {
      console.log('🗣️ Contains command keywords - not simple');
      return false;
    }
    
    // Not simple if it's a negative response
    if (this.isNegativeResponse(trimmedInput)) {
      console.log('🗣️ Is negative response - not simple');
      return false;
    }
    
    // Simple heuristics for article names
    const isSimple = trimmedInput.length > 0 && 
           trimmedInput.length < 100 && 
           !trimmedInput.includes('http') &&
           !trimmedInput.includes('www.');
           
    console.log('🗣️ Is simple article input:', isSimple);
    return isSimple;
  }

  /**
   * Check if input is a negative response
   */
  private isNegativeResponse(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    const negativeWords = ['nein', 'no', 'nicht', 'stop', 'stopp', 'abbrechen', 'fertig', 'genug', 'ende', 'schluss'];
    
    // Check for exact matches or if the input starts with these words
    return negativeWords.some(word => 
      lowerInput === word || 
      lowerInput.startsWith(word + ' ') ||
      lowerInput.startsWith(word + ',') ||
      lowerInput.startsWith(word + '.')
    );
  }

  /**
   * Handle contextual article addition when waiting for articles
   */
  private async handleContextualArticleAddition(input: string): Promise<AIExecutionResult> {
    if (!this.conversationContext.waitingForArticles) {
      return {
        success: false,
        message: '❌ Fehler: Kein Kontext für Artikel-Hinzufügung.'
      };
    }
  
    const { listId, listName } = this.conversationContext.waitingForArticles;
    
    console.log('🗣️ Handling contextual addition:', input);
    console.log('🗣️ Target list:', listName, listId);
    
    // Check if input contains multiple items (comma-separated)
    if (input.includes(',')) {
      console.log('🗣️ Multiple items detected in contextual mode');
      return await this.handleMultipleItemsInContext(input, listId, listName);
    }
    
    // Handle single item with disambiguation
    const quantityExtraction = this.quantityExtraction.extractQuantity(input);
    console.log('🗣️ Single item extraction:', quantityExtraction);
    
    // Check for existing articles for disambiguation
    console.log('🗣️ Checking for disambiguation options for:', quantityExtraction.itemName);
    
    const disambiguationOptions = await this.disambiguation.getDisambiguationOptions(quantityExtraction.itemName);
    console.log('🗣️ Found disambiguation options:', disambiguationOptions.length);
    
    const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');
    
    if (existingOptions.length > 0) {
      console.log('🗣️ Found existing options, showing disambiguation');
      
      // Create a pending action for disambiguation - FIXED: Use existing type
      const pendingAction: PendingAction = {
        type: 'add_item', // CHANGED: Use existing type
        originalInput: input,
        itemName: quantityExtraction.itemName,
        extractedQuantity: quantityExtraction.quantity,
        listName: listName, // This will help us know which list to add to
        suggestedDepartment: this.aiResponse.suggestDepartment(quantityExtraction.itemName)
      };
      
      return {
        success: true,
        message: this.aiResponse.getDisambiguationMessage(quantityExtraction.itemName),
        needsUserInput: true,
        disambiguationOptions,
        pendingAction: pendingAction
      };
    }
    
    // No existing items found - create new article directly
    console.log('🗣️ No existing options, creating new article directly');
    return await this.createArticleInConversationContext(quantityExtraction, listId, listName);
  }

  private async createArticleInConversationContext(quantityExtraction: any, listId: string, listName: string): Promise<AIExecutionResult> {
    try {
      // Create the article
      const articleData = {
        name: quantityExtraction.itemName,
        amount: quantityExtraction.quantity || '',
        departmentId: this.aiResponse.suggestDepartment(quantityExtraction.itemName),
        icon: this.aiResponse.suggestIcon(quantityExtraction.itemName)
      };
      
      console.log('🗣️ Creating article in conversation context:', articleData);
      
      const newArticle = await this.dataService.createArticle(articleData).toPromise();
      
      if (newArticle) {
        const targetList = await this.findListById(listId);
        
        if (targetList) {
          const updatedArticleIds = [...targetList.articleIds];
          if (!updatedArticleIds.includes(newArticle.id)) {
            updatedArticleIds.push(newArticle.id);
          }
  
          const updatedItemStates = { ...targetList.itemStates };
          updatedItemStates[newArticle.id] = {
            articleId: newArticle.id,
            isChecked: false,
            amount: quantityExtraction.quantity || ''
          };
  
          const updateResult = await this.dataService.updateList(targetList.id, {
            articleIds: updatedArticleIds,
            itemStates: updatedItemStates
          }).toPromise();
          
          if (updateResult) {
            // Update context to keep conversation going
            this.setConversationContext({
              lastAction: {
                type: 'article_added',
                listId: targetList.id,
                listName: targetList.name,
                articleName: newArticle.name,
                timestamp: new Date()
              },
              waitingForArticles: {
                listId: targetList.id,
                listName: targetList.name,
                prompt: 'Möchtest du noch weitere Artikel hinzufügen?'
              }
            });
  
            const followUpPrompt = this.aiResponse.getArticleAddedFollowUpPrompt(newArticle.name, targetList.name);
            
            return {
              success: true,
              message: `✅ "${newArticle.name}"${quantityExtraction.quantity ? ` (${quantityExtraction.quantity})` : ''} wurde zu "${targetList.name}" hinzugefügt.`,
              listId: targetList.id,
              conversationContext: this.getConversationContext(),
              followUpPrompt
            };
          }
        }
      }
      
      return {
        success: false,
        message: '❌ Fehler beim Hinzufügen des Artikels.'
      };
      
    } catch (error) {
      console.error('Error creating article in conversation context:', error);
      return {
        success: false,
        message: '❌ Fehler beim Hinzufügen des Artikels.'
      };
    }
  }

  private async handleMultipleItemsInContext(input: string, listId: string, listName: string): Promise<AIExecutionResult> {
    console.log('🗣️ Handling multiple items in context with disambiguation:', input);
    
    const items = input.split(',').map(item => item.trim()).filter(item => item.length > 0);
    console.log('🗣️ Split items:', items);
    
    if (items.length === 0) {
      return {
        success: false,
        message: '❌ Konnte keine Artikel in der Eingabe erkennen.'
      };
    }
    
    const targetList = await this.findListById(listId);
    if (!targetList) {
      return {
        success: false,
        message: '❌ Zielliste nicht gefunden.'
      };
    }
    
    // FIXED: Better quantity extraction for first item
    const firstItemText = items[0];
    const firstQuantityExtraction = this.quantityExtraction.extractQuantity(firstItemText);
    
    console.log('🗣️ First item text:', firstItemText);
    console.log('🗣️ First item extraction:', firstQuantityExtraction);
    
    // Use the cleaned item name for disambiguation check
    const firstItemName = firstQuantityExtraction.itemName;
    console.log('🗣️ Checking disambiguation for cleaned name:', firstItemName);
    
    // Check for existing articles for the first item
    const disambiguationOptions = await this.disambiguation.getDisambiguationOptions(firstItemName);
    const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');
    
    if (existingOptions.length > 0) {
      console.log('🗣️ Found existing options for first item, showing disambiguation');
      
      // FIXED: Store remaining items with proper extraction
      const remainingItems = items.slice(1);
      console.log('🗣️ Storing remaining items for later processing:', remainingItems);
      
      // Create a special pending action for multiple items with disambiguation
      const pendingAction: any = {
        type: 'add_item',
        originalInput: input,
        itemName: firstItemName, // Use cleaned name
        extractedQuantity: firstQuantityExtraction.quantity, // Use extracted quantity
        listName: listName,
        suggestedDepartment: this.aiResponse.suggestDepartment(firstItemName),
        // Special fields for multiple items - FIXED
        isMultipleItems: true,
        remainingItems: remainingItems, // Store ALL remaining items
        conversationListId: listId
      };
      
      console.log('🗣️ Created pending action with remaining items:', pendingAction);
      
      return {
        success: true,
        message: `🎯 Mehrere Artikel erkannt. Zuerst "${firstItemName}":\n\n${this.aiResponse.getDisambiguationMessage(firstItemName)}`,
        needsUserInput: true,
        disambiguationOptions,
        pendingAction: pendingAction
      };
    }
    
    // No disambiguation needed - process all items directly
    let addedItems: string[] = [];
    let updatedArticleIds = [...targetList.articleIds];
    let updatedItemStates = { ...targetList.itemStates };
    
    for (const itemText of items) {
      try {
        console.log('🗣️ Processing item directly (no disambiguation):', itemText);
        
        const quantityExtraction = this.quantityExtraction.extractQuantity(itemText);
        console.log('🗣️ Quantity extraction for item:', quantityExtraction);
        
        const articleData = {
          name: quantityExtraction.itemName,
          amount: quantityExtraction.quantity || '',
          departmentId: this.aiResponse.suggestDepartment(quantityExtraction.itemName),
          icon: this.aiResponse.suggestIcon(quantityExtraction.itemName)
        };
        
        console.log('🗣️ Creating article:', articleData);
        
        const newArticle = await this.dataService.createArticle(articleData).toPromise();
        
        if (newArticle) {
          if (!updatedArticleIds.includes(newArticle.id)) {
            updatedArticleIds.push(newArticle.id);
          }
          
          updatedItemStates[newArticle.id] = {
            articleId: newArticle.id,
            isChecked: false,
            amount: quantityExtraction.quantity || ''
          };
          
          addedItems.push(`"${newArticle.name}"${quantityExtraction.quantity ? ` (${quantityExtraction.quantity})` : ''}`);
          console.log('🗣️ Successfully created:', newArticle.name);
        }
      } catch (error) {
        console.error('🗣️ Error creating article:', itemText, error);
      }
    }
    
    if (addedItems.length > 0) {
      const updateResult = await this.dataService.updateList(targetList.id, {
        articleIds: updatedArticleIds,
        itemStates: updatedItemStates
      }).toPromise();
      
      if (updateResult) {
        // Update context to keep conversation going
        this.setConversationContext({
          lastAction: {
            type: 'article_added',
            listId: targetList.id,
            listName: targetList.name,
            articleName: `${addedItems.length} Artikel`,
            timestamp: new Date()
          },
          waitingForArticles: {
            listId: targetList.id,
            listName: targetList.name,
            prompt: 'Möchtest du noch weitere Artikel hinzufügen?'
          }
        });
  
        const followUpPrompt = this.aiResponse.getArticleAddedFollowUpPrompt('mehrere Artikel', targetList.name);
        
        return {
          success: true,
          message: `✅ ${addedItems.length} Artikel zu "${targetList.name}" hinzugefügt:\n${addedItems.join(', ')}`,
          listId: targetList.id,
          conversationContext: this.getConversationContext(),
          followUpPrompt
        };
      }
    }
    
    return {
      success: false,
      message: `❌ Fehler beim Hinzufügen der Artikel.`
    };
  }

  /**
   * Find list by ID
   */
  private async findListById(listId: string): Promise<ShoppingList | null> {
    try {
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      return lists?.find(list => list.id === listId) || null;
    } catch (error) {
      console.error('Error finding list by ID:', error);
      return null;
    }
  }

  // ========================================
  // API KEY MANAGEMENT
  // ========================================

  /**
   * 🔒 SECURE: Get API key with localStorage priority
   */
  private getSecureApiKey(): string {
    const localStorageKey = localStorage.getItem('groq-api-key');
    const environmentKey = environment?.groqApiKey;
    return localStorageKey || environmentKey || '';
  }

  /**
   * 🔒 SECURE: Set API key in localStorage
   */
  setApiKey(apiKey: string): void {
    if (apiKey && apiKey.trim()) {
      localStorage.setItem('groq-api-key', apiKey.trim());
      console.log('🔑 API key saved to localStorage');
      this.logApiKeyStatus();
    }
  }

  /**
   * 🔒 SECURE: Check if API key is available
   */
  hasApiKey(): boolean {
    return !!this.getSecureApiKey();
  }

  /**
   * 🔒 Get API key status
   */
  getApiKeyStatus(): ApiKeyStatus {
    const finalKey = this.getSecureApiKey();
    const hasKey = !!finalKey;
    const source = localStorage.getItem('groq-api-key') ? 'localStorage' : 
                  environment?.groqApiKey ? 'environment' : 'none';
    
    return {
      configured: hasKey,
      source: source as 'localStorage' | 'environment' | 'none',
      length: hasKey ? finalKey.length : 0
    };
  }

  /**
   * 🔒 SECURE: Log API key status without exposing the key
   */
  private logApiKeyStatus(): void {
    const status = this.getApiKeyStatus();
    console.log('🔑 API Key Status:', status);
  }

  // ========================================
  // MAIN COMMAND EXECUTION (ENHANCED WITH CONVERSATION CONTEXT)
  // ========================================

  /**
   * Execute AI command with conversation context awareness
   */
  async executeCommand(input: string): Promise<AIExecutionResult> {
    console.log('🗣️ CONVERSATION STATE DEBUG:');
    console.log('🗣️ - isWaitingForArticles:', this.isWaitingForArticles());
    console.log('🗣️ - isNegativeResponse:', this.isNegativeResponse(input));
    console.log('🗣️ - isSimpleArticleInput:', this.isSimpleArticleInput(input));
    console.log('🗣️ - conversationContext:', this.conversationContext);
    console.log('🗣️ - input:', input);

    try {
      console.log('🤖 Processing command:', input);
      console.log('🗣️ Current context:', this.conversationContext);
      
      // 🔑 Handle API key setup commands FIRST
      if (input.toLowerCase().includes('api key')) {
        return this.handleApiKeyCommand(input);
      }
      
      // Handle simple commands that clear context
      if (input.toLowerCase().includes('hilfe') || input.toLowerCase().includes('help')) {
        this.clearConversationContext();
        const hasKey = this.hasApiKey();
        return {
          success: true,
          message: this.aiResponse.getEnhancedHelpMessage(hasKey)
        };
      }
      
      if (input.toLowerCase().includes('test')) {
        const hasKey = this.hasApiKey();
        return {
          success: true,
          message: this.aiResponse.getSystemStatusMessage(hasKey)
        };
      }
  
      // Handle show lists command
      if (input.toLowerCase().includes('zeige') && input.toLowerCase().includes('liste')) {
        this.clearConversationContext();
        return await this.handleShowListsCommand();
      }
  
      // NEW: Handle "no" or "nein" when waiting for articles - IMPROVED DETECTION
      if (this.isWaitingForArticles() && this.isNegativeResponse(input)) {
        console.log('🗣️ User declined to add more articles');
        this.clearConversationContext();
        return {
          success: true,
          message: this.aiResponse.getConversationEndedMessage()
        };
      }
  
      // NEW: Handle context-aware simple article addition - IMPROVED DETECTION  
      if (this.isWaitingForArticles() && this.isSimpleArticleInput(input)) {
        console.log('🗣️ Processing simple article in context');
        return await this.handleContextualArticleAddition(input);
      }
  
      // Clear context for new commands
      this.clearConversationContext();
  
      // Rest of your existing executeCommand logic...
      const hasApiKey = this.hasApiKey();
      console.log('🔑 Has API Key:', hasApiKey);
      
      if (hasApiKey) {
        console.log('🎯 Processing with enhanced features');
        return await this.processEnhancedCommand(input);
      } else {
        console.log('🔄 Processing with basic features');
        return await this.processBasicCommand(input);
      }
      
    } catch (error) {
      console.error('AI Service error:', error);
      this.clearConversationContext();
      return {
        success: false,
        message: this.aiResponse.getGenericErrorMessage(error instanceof Error ? error.message : undefined),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ========================================
  // ENHANCED COMMAND PROCESSING
  // ========================================

  /**
   * 🎯 Process command with enhanced features (ENHANCED: Better text number support)
   */
  private async processEnhancedCommand(input: string): Promise<AIExecutionResult> {
    console.log('🎯 PROCESSING ENHANCED COMMAND:', input);
    
    // 🆕 NEW: Check for comma-separated items first
    if (this.quantityExtraction.hasMultipleItems(input)) {
      console.log('🎯 Detected comma-separated items, using multi-item processing');
      return this.processEnhancedCommandWithMultiItems(input);
    }
    
    // 🎯 ENHANCED: Extract quantity from input with text number support
    const quantityExtraction = this.quantityExtraction.extractQuantity(input);
    console.log('🎯 Quantity extraction result:', quantityExtraction);
    console.log('🎯 - Item name:', quantityExtraction.itemName);
    console.log('🎯 - Quantity:', quantityExtraction.quantity);

    // 🎯 ENHANCED: Parse command intent using the clean item name from quantity extraction
    const intent = this.commandParser.parseIntent(input, quantityExtraction.itemName);
    console.log('🎯 Parsed intent:', intent);
    console.log('🎯 - Type:', intent.type);
    console.log('🎯 - Item name:', intent.itemName);
    console.log('🎯 - List name:', intent.listName);

    // Check for unrecognized commands first
    if (intent.itemName === 'UNRECOGNIZED_COMMAND') {
      console.log('🎯 Unrecognized command, providing guidance');
      return {
        success: true,
        message: `Ich verstehe: "${input}"\n\n🤖 Das ist kein bekannter Befehl.\n\n💡 Verfügbare Befehle:\n• "Füge [Artikel] hinzu" - Artikel zur Liste hinzufügen\n• "Füge [Artikel] zu [Liste] hinzu" - Direkt zur spezifizierten Liste\n• "Füge Bananen, Würste, Milch hinzu" - Mehrere Artikel\n• "Erstelle Liste [Name]" - Neue Liste erstellen\n• "Zeige Listen" - Alle Listen anzeigen\n\n🔢 Mengen unterstützt:\n• "Füge drei kg Bananen hinzu"\n• "Füge zwei Liter Milch hinzu"`
      };
    }

    // Handle create list commands
    if (intent.type === 'create_list') {
      console.log('🎯 Processing create list command');
      return await this.handleListCreationWithColor(input, quantityExtraction);
    }

    // 🎯 ENHANCED: Handle add item commands with better debugging
    if (intent.type === 'add_item' && intent.itemName !== 'UNRECOGNIZED_COMMAND') {
      console.log('🎯 Processing add item command');
      console.log('🎯 Final item name:', quantityExtraction.itemName);
      console.log('🎯 Final quantity:', quantityExtraction.quantity);
      console.log('🎯 Target list:', intent.listName);
      
      // 🎯 ENHANCED: Create enhanced action with proper quantity
      const pendingAction: PendingAction = {
        type: intent.type,
        originalInput: input,
        itemName: quantityExtraction.itemName, // Use cleaned item name from quantity extraction
        extractedQuantity: quantityExtraction.quantity, // Use converted quantity (text numbers → digits)
        listName: intent.listName,
        suggestedDepartment: this.aiResponse.suggestDepartment(quantityExtraction.itemName)
      };

      console.log('🎯 Created pending action:', pendingAction);

      return await this.handleItemActionWithDisambiguation(pendingAction);
    }

    // Fallback to basic processing
    console.log('🎯 Fallback to basic processing');
    return this.processBasicCommand(input);
  }

  /**
   * 🎯 ENHANCED: Process command with multi-item support
   */
  private async processEnhancedCommandWithMultiItems(input: string): Promise<AIExecutionResult> {
    console.log('🎯 PROCESSING ENHANCED COMMAND WITH MULTI-ITEMS:', input);
    
    // Parse as multi-item command
    const multiItemResult = this.quantityExtraction.parseMultipleItems(input);
    
    if (multiItemResult.command === 'unrecognized') {
      // Fall back to single item processing
      console.log('🎯 NOT A MULTI-ITEM COMMAND, USING SINGLE ITEM PROCESSING');
      return this.processEnhancedCommand(input);
    }

    // Handle multi-item commands
    if (multiItemResult.items.length === 0) {
      return {
        success: false,
        message: this.aiResponse.getParsingErrorMessage(input, multiItemResult.parseErrors)
      };
    }

    // Report any parse errors but continue with successfully parsed items
    if (multiItemResult.parseErrors.length > 0) {
      console.warn('🎯 PARSE ERRORS:', multiItemResult.parseErrors);
    }

    console.log('🎯 PROCESSING MULTI-ITEM COMMAND:', {
      command: multiItemResult.command,
      itemCount: multiItemResult.items.length,
      listName: multiItemResult.listName,
      items: multiItemResult.items
    });

    // Create multi-item pending action
    const multiAction: MultiItemPendingAction = {
      type: multiItemResult.command === 'create_list_with_items' ? 'create_list_with_multiple_items' : 'add_multiple_items',
      originalInput: input,
      itemName: '', // Not used for multi-items
      items: multiItemResult.items,
      listName: multiItemResult.listName,
      currentItemIndex: 0,
      processedItems: [],
      suggestedDepartment: this.aiResponse.suggestDepartment(multiItemResult.items[0]?.itemName || '')
    };

    // Start processing items sequentially
    return this.disambiguation.processMultiItemSequentially(multiAction);
  }

  // ========================================
  // BASIC COMMAND PROCESSING
  // ========================================

  /**
   * 🔧 Process commands with basic functionality (ENHANCED: Better text number support)
   */
  private async processBasicCommand(input: string): Promise<AIExecutionResult> {
    console.log('🤖 PROCESSING BASIC COMMAND:', input);
    
    const lowerInput = input.toLowerCase();
    const originalInput = input.trim();
    
    // 🎯 ENHANCED: Extract quantity and item name with text number support
    const quantityExtraction = this.quantityExtraction.extractQuantity(originalInput);
    console.log('🔍 QUANTITY EXTRACTION RESULT:', quantityExtraction);
    console.log('🔍 - Item name:', quantityExtraction.itemName);
    console.log('🔍 - Quantity:', quantityExtraction.quantity);
    
    // Handle list creation with color support
    if (lowerInput.includes('erstelle') && lowerInput.includes('liste')) {
      return await this.handleListCreationWithColor(originalInput, quantityExtraction);
    }
    
    // Handle item addition
    if (lowerInput.includes('füge') && lowerInput.includes('hinzu')) {
      return await this.handleItemAdditionBasic(originalInput, quantityExtraction);
    }
    
    // For unrecognized commands, provide helpful feedback
    return {
      success: true,
      message: `Ich verstehe: "${originalInput}"\n\n🤖 Das ist kein bekannter Befehl.\n\n💡 Verfügbare Befehle:\n• "Füge [Artikel] hinzu" - Artikel zur Liste hinzufügen\n• "Füge [Artikel] zu [Liste] hinzu" - Direkt zur spezifizierten Liste\n⚖️ "Füge [Artikel] Menge [Anzahl] [Einheit] hinzu"\n• "Erstelle Liste [Name]" - Neue Liste erstellen\n🎨 "Erstelle Liste [Name] in [Farbe]" - Bunte Liste\n• "Zeige Listen" - Alle Listen anzeigen\n• "Hilfe" - Ausführliche Hilfe\n\n📋 Beispiele:\n• "Füge Schokolade Menge 2 Stück hinzu"\n• "Füge 500ml Milch zu Spar hinzu"\n• "Füge drei kg Bananen hinzu"\n• "Füge zwei Liter Milch zu REWE hinzu"\n\n${this.aiResponse.getNoApiKeyGuidance()}`
    };
  }

  // ========================================
  // DISAMBIGUATION HANDLING
  // ========================================

  /**
   * 🎯 ENHANCED: Handle disambiguation choice (supports both single and multi-item)
   */
  async handleDisambiguationChoice(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('🎯 Handling disambiguation choice with conversation context');
    console.log('🎯 Pending action:', pendingAction);
    console.log('🎯 Selected option:', selectedOption);
    console.log('🎯 Current conversation context:', this.conversationContext);
    
    // PRIORITY: Check if we're in conversation mode first
    const isInConversation = this.isWaitingForArticles();
    const conversationListId = this.conversationContext.waitingForArticles?.listId;
    const conversationListName = this.conversationContext.waitingForArticles?.listName;
    
    console.log('🎯 Is in conversation:', isInConversation);
    console.log('🎯 Conversation list:', conversationListName, conversationListId);
    
    // CONVERSATION MODE: Handle disambiguation within conversation context
    if (isInConversation && conversationListId && conversationListName) {
      console.log('🎯 Processing disambiguation in CONVERSATION MODE');
      
      try {
        let articleToAdd;
        
        if (selectedOption.type === 'existing' && selectedOption.article) {
          // Use existing article
          articleToAdd = selectedOption.article;
          console.log('🎯 Using existing article in conversation:', articleToAdd.name);
        } else {
          // Create new article
          const articleData = {
            name: pendingAction.itemName,
            amount: pendingAction.extractedQuantity || '',
            departmentId: this.aiResponse.suggestDepartment(pendingAction.itemName),
            icon: this.aiResponse.suggestIcon(pendingAction.itemName)
          };
          
          console.log('🎯 Creating new article in conversation:', articleData);
          articleToAdd = await this.dataService.createArticle(articleData).toPromise();
        }
        
        if (articleToAdd) {
          // Add to conversation list
          const targetList = await this.findListById(conversationListId);
          
          if (targetList) {
            let updatedArticleIds = [...targetList.articleIds];
            let updatedItemStates = { ...targetList.itemStates };
            
            // Add the disambiguated article
            if (!updatedArticleIds.includes(articleToAdd.id)) {
              updatedArticleIds.push(articleToAdd.id);
            }
    
            updatedItemStates[articleToAdd.id] = {
              articleId: articleToAdd.id,
              isChecked: false,
              amount: pendingAction.extractedQuantity || ''
            };
    
            let addedItems = [`"${articleToAdd.name}"${pendingAction.extractedQuantity ? ` (${pendingAction.extractedQuantity})` : ''}`];
            
            // NEW: Check if there are remaining items to process
            const remainingItems = (pendingAction as any).remainingItems;
            const isMultipleItems = (pendingAction as any).isMultipleItems;
            
            console.log('🎯 Checking for remaining items:', remainingItems);
            console.log('🎯 Is multiple items:', isMultipleItems);
            
            if (isMultipleItems && Array.isArray(remainingItems) && remainingItems.length > 0) {
              console.log('🎯 Processing remaining items:', remainingItems);
              
              // Process remaining items
              for (const itemText of remainingItems) {
                try {
                  console.log('🎯 Processing remaining item:', itemText);
                  
                  const quantityExtraction = this.quantityExtraction.extractQuantity(itemText);
                  console.log('🎯 Quantity extraction for remaining item:', quantityExtraction);
                  
                  const articleData = {
                    name: quantityExtraction.itemName,
                    amount: quantityExtraction.quantity || '',
                    departmentId: this.aiResponse.suggestDepartment(quantityExtraction.itemName),
                    icon: this.aiResponse.suggestIcon(quantityExtraction.itemName)
                  };
                  
                  console.log('🎯 Creating remaining article:', articleData);
                  
                  const newArticle = await this.dataService.createArticle(articleData).toPromise();
                  
                  if (newArticle) {
                    if (!updatedArticleIds.includes(newArticle.id)) {
                      updatedArticleIds.push(newArticle.id);
                    }
                    
                    updatedItemStates[newArticle.id] = {
                      articleId: newArticle.id,
                      isChecked: false,
                      amount: quantityExtraction.quantity || ''
                    };
                    
                    addedItems.push(`"${newArticle.name}"${quantityExtraction.quantity ? ` (${quantityExtraction.quantity})` : ''}`);
                    console.log('🎯 Successfully created remaining item:', newArticle.name);
                  }
                } catch (error) {
                  console.error('🎯 Error creating remaining article:', itemText, error);
                }
              }
            }
    
            // Update the list with all articles (original + remaining)
            const updateResult = await this.dataService.updateList(targetList.id, {
              articleIds: updatedArticleIds,
              itemStates: updatedItemStates
            }).toPromise();
            
            if (updateResult) {
              console.log('🎯 Successfully added all articles to conversation list');
              
              // CRITICAL: Maintain conversation context to stay in chat
              this.setConversationContext({
                lastAction: {
                  type: 'article_added',
                  listId: targetList.id,
                  listName: targetList.name,
                  articleName: addedItems.length > 1 ? `${addedItems.length} Artikel` : articleToAdd.name,
                  timestamp: new Date()
                },
                waitingForArticles: {
                  listId: targetList.id,
                  listName: targetList.name,
                  prompt: 'Möchtest du noch weitere Artikel hinzufügen?'
                }
              });
    
              // Create appropriate message based on number of items
              let message: string;
              if (addedItems.length === 1) {
                message = `✅ ${addedItems[0]} wurde zu "${targetList.name}" hinzugefügt.`;
              } else {
                message = `✅ ${addedItems.length} Artikel zu "${targetList.name}" hinzugefügt:\n${addedItems.join(', ')}`;
              }
    
              const followUpPrompt = this.aiResponse.getArticleAddedFollowUpPrompt(
                addedItems.length > 1 ? 'mehrere Artikel' : articleToAdd.name, 
                targetList.name
              );
              
              console.log('🎯 Returning conversation result with follow-up');
              console.log('🎯 Message:', message);
              console.log('🎯 Added items:', addedItems);
              
              return {
                success: true,
                message: message,
                listId: targetList.id,
                conversationContext: this.getConversationContext(),
                followUpPrompt // This is CRITICAL to keep conversation going
              };
            }
          }
        }
        
        return {
          success: false,
          message: '❌ Fehler beim Hinzufügen des Artikels.'
        };
        
      } catch (error) {
        console.error('🎯 Error in conversation disambiguation:', error);
        return {
          success: false,
          message: '❌ Fehler beim Verarbeiten der Auswahl.'
        };
      }
    }
    
    // NON-CONVERSATION MODE: Use regular disambiguation handling
    console.log('🎯 Using REGULAR disambiguation handling (not in conversation)');
    
    // Clear conversation context since we're doing a regular action
    this.clearConversationContext();
    
    // Use the existing disambiguation service for non-conversation mode
    return this.disambiguation.handleDisambiguationChoice(pendingAction, selectedOption);
  }

  // ========================================
  // SPECIFIC COMMAND HANDLERS
  // ========================================

  /**
   * 🔑 Handle API key setup via chat command
   */
  private handleApiKeyCommand(input: string): AIExecutionResult {
    const lowerInput = input.toLowerCase();
    
    // Pattern: "set api key: gsk_..." or "api key gsk_..."
    const keyPattern = /(?:set\s+)?api\s+key[:\s]+([a-zA-Z0-9_-]+)/i;
    const match = input.match(keyPattern);
    
    if (match && match[1]) {
      const apiKey = match[1].trim();
      
      // Validate key format (Groq keys start with 'gsk_')
      if (apiKey.startsWith('gsk_') && apiKey.length > 20) {
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
    
    // No key provided - show instructions
    const hasKey = this.hasApiKey();
    return {
      success: true,
      message: this.aiResponse.getApiKeyInstructions(hasKey)
    };
  }

  /**
   * 📋 Handle show lists command
   */
  private async handleShowListsCommand(): Promise<AIExecutionResult> {
    console.log('📋 HANDLING SHOW LISTS COMMAND');
    
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
      message += '• "Erstelle Liste [Name]"';
      
      return {
        success: true,
        message: message
      };
      
    } catch (error) {
      console.error('📋 SHOW LISTS ERROR:', error);
      return {
        success: false,
        message: '❌ Fehler beim Laden der Listen.'
      };
    }
  }

  /**
   * 🎨 Handle list creation with color support and conversation context
   */
  private async handleListCreationWithColor(input: string, quantityExtraction: any): Promise<AIExecutionResult> {
    console.log('🎨 HANDLING LIST CREATION WITH COLOR:', input);
    console.log('🎨 Quantity extraction:', quantityExtraction);
    
    // Extract color first
    const colorExtraction = this.commandParser.extractColor(input);
    console.log('🎨 COLOR EXTRACTION:', colorExtraction);
    
    // Parse list creation from original input to preserve case
    const cleanInput = colorExtraction.cleanInput;
    
    // FIXED: Better pattern matching for list creation
    // Pattern: "erstelle liste [name]" or "erstelle liste [name] mit [item]"
    const createMatch = cleanInput.match(/erstelle\s+liste\s+(.+?)(?:\s+mit\s+(.+))?$/i);
    
    if (!createMatch) {
      return {
        success: false,
        message: '❌ Unverständlicher Liste-Befehl.\n\n💡 Beispiele:\n• "Erstelle Liste Spar"\n• "Erstelle Liste REWE in rot"\n• "Erstelle Liste ADEG mit Milch in blau"'
      };
    }
    
    const listName = createMatch[1].trim();
    const itemName = createMatch[2]?.trim();
    
    console.log('🎨 PARSED LIST CREATION:', { 
      originalInput: input,
      cleanInput: cleanInput,
      listName: listName, 
      itemName: itemName, 
      color: colorExtraction.colorHex 
    });
    
    // CRITICAL FIX: Don't create an article if no explicit item was specified
    if (!itemName) {
      console.log('🎨 Creating list WITHOUT initial article');
      
      try {
        const listColor = colorExtraction.colorHex || this.aiResponse.suggestListColor(listName);
        
        const listToCreate = {
          name: listName,
          color: listColor,
          icon: '🛒',
          articleIds: [], // EMPTY - no initial articles
          itemStates: {}  // EMPTY - no initial states
        };
        
        console.log('🎨 CREATING LIST:', listToCreate);
        
        const newList = await this.dataService.createList(listToCreate).toPromise();
        
        if (newList) {
          // Set conversation context for follow-up
          this.setConversationContext({
            lastAction: {
              type: 'list_created',
              listId: newList.id,
              listName: newList.name,
              timestamp: new Date()
            },
            waitingForArticles: {
              listId: newList.id,
              listName: newList.name,
              prompt: 'Möchtest du Artikel zu dieser Liste hinzufügen?'
            }
          });
  
          const baseMessage = `✅ Liste "${listName}"${colorExtraction.colorName ? ` in ${colorExtraction.colorName}` : ''} wurde erstellt.`;
          const followUpPrompt = this.aiResponse.getListCreatedFollowUpPrompt(listName, false);
          
          return {
            success: true,
            message: baseMessage,
            listId: newList.id,
            conversationContext: this.getConversationContext(),
            followUpPrompt
          };
        }
      } catch (error) {
        console.error('🎨 LIST CREATION ERROR:', error);
        return {
          success: false,
          message: '❌ Fehler beim Erstellen der Liste.'
        };
      }
    } else {
      // Create list WITH initial article
      console.log('🎨 Creating list WITH initial article:', itemName);
      
      try {
        const articleIds: string[] = [];
        const itemStates: any = {};
        
        // Create the initial article using the explicitly specified item name
        const articleToCreate = {
          name: itemName, // Use the parsed item name, NOT the quantity extraction
          amount: quantityExtraction.quantity || '',
          departmentId: this.aiResponse.suggestDepartment(itemName),
          icon: this.aiResponse.suggestIcon(itemName)
        };
        
        console.log('🎨 CREATING INITIAL ARTICLE:', articleToCreate);
        
        const newArticle = await this.dataService.createArticle(articleToCreate).toPromise();
        
        if (newArticle) {
          articleIds.push(newArticle.id);
          itemStates[newArticle.id] = { 
            articleId: newArticle.id, 
            isChecked: false,
            amount: quantityExtraction.quantity || '',
            addedAt: new Date().toISOString()
          };
        }
        
        const listColor = colorExtraction.colorHex || this.aiResponse.suggestListColor(listName);
        
        const listToCreate = {
          name: listName,
          color: listColor,
          icon: '🛒',
          articleIds,
          itemStates
        };
        
        console.log('🎨 CREATING LIST WITH ARTICLE:', listToCreate);
        
        const newList = await this.dataService.createList(listToCreate).toPromise();
        
        if (newList) {
          // Set conversation context for follow-up
          this.setConversationContext({
            lastAction: {
              type: 'list_created',
              listId: newList.id,
              listName: newList.name,
              articleName: newArticle?.name,
              timestamp: new Date()
            },
            waitingForArticles: {
              listId: newList.id,
              listName: newList.name,
              prompt: 'Möchtest du weitere Artikel hinzufügen?'
            }
          });
  
          const baseMessage = this.aiResponse.getListCreatedMessage(
            listName, 
            itemName, 
            quantityExtraction.quantity, 
            colorExtraction.colorName
          );
          const followUpPrompt = this.aiResponse.getListCreatedFollowUpPrompt(listName, true);
          
          return {
            success: true,
            message: baseMessage,
            listId: newList.id,
            conversationContext: this.getConversationContext(),
            followUpPrompt
          };
        }
      } catch (error) {
        console.error('🎨 LIST CREATION ERROR:', error);
        return {
          success: false,
          message: '❌ Fehler beim Erstellen der Liste.'
        };
      }
    }
    
    return {
      success: false,
      message: '❌ Unerwarteter Fehler beim Erstellen der Liste.'
    };
  }

  /**
   * 🎯 Handle item action with smart disambiguation (ENHANCED: Better error handling)
   */
  private async handleItemActionWithDisambiguation(action: PendingAction): Promise<AIExecutionResult> {
    console.log('🎯 Handling item action with disambiguation:', action);

    // Get disambiguation options
    const disambiguationOptions = await this.disambiguation.getDisambiguationOptions(action.itemName);
    console.log('🎯 Disambiguation options for item:', action.itemName);
    console.log('🎯 Number of disambiguation options:', disambiguationOptions.length);

    // ALWAYS show disambiguation if there are existing similar items
    const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');
    
    if (existingOptions.length > 0) {
      console.log('🎯 Found existing options, showing disambiguation');
      
      return {
        success: true,
        message: this.aiResponse.getDisambiguationMessage(action.itemName),
        needsUserInput: true,
        disambiguationOptions,
        pendingAction: action
      };
    }

    // No existing items found - create new article directly
    console.log('🎯 No existing options, creating new article');
    return await this.executeActionWithNewArticle(action);
  }

  /**
   * 🔍 Handle basic item addition (ENHANCED: Better debugging and text number support)
   */
  private async handleItemAdditionBasic(input: string, quantityExtraction: any): Promise<AIExecutionResult> {
    console.log('🔍 HANDLING BASIC ITEM ADDITION:', input);
    console.log('🔍 Quantity extraction:', quantityExtraction);
    
    const lowerInput = input.toLowerCase();
    
    // 🎯 ENHANCED: Parse add patterns from original input to preserve case
    const addMatch = lowerInput.match(/füge\s+(.+?)\s+(?:zu\s+(.+?)\s+)?hinzu/);
    
    if (!addMatch) {
      return {
        success: false,
        message: `❌ Unverständlicher Hinzufügen-Befehl: "${input}"\n\n💡 Beispiele:\n• "Füge Bananen hinzu"\n• "Füge drei kg Bananen zu Spar hinzu"`
      };
    }
    
    // Extract list name from original input to preserve case
    const originalAddMatch = input.match(/füge\s+(.+?)\s+(?:zu\s+(.+?)\s+)?hinzu/i);
    const listName = originalAddMatch?.[2]?.trim();
    const finalItemName = quantityExtraction.itemName;
    
    console.log('🔍 ITEM ADDITION PARSED:', {
      input,
      finalItemName,
      quantity: quantityExtraction.quantity,
      listName
    });
    
    // Create pending action for further processing
    const pendingAction: PendingAction = {
      type: listName ? 'add_item' : 'select_list',
      originalInput: input,
      itemName: finalItemName,
      extractedQuantity: quantityExtraction.quantity, // This should now include converted text numbers
      listName: listName,
      suggestedDepartment: this.aiResponse.suggestDepartment(finalItemName)
    };

    console.log('🔍 Created pending action:', pendingAction);

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
        return this.executeActionWithNewArticleToList(pendingAction, listOptions[0].name);
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
    return this.executeActionWithNewArticleToList(pendingAction, listName);
  }

  // ========================================
  // ACTION EXECUTION HELPERS (ENHANCED WITH CONVERSATION CONTEXT)
  // ========================================

/**
 * 🎯 Execute action with new article (ENHANCED: Use updateList instead of addArticleToList)
 */
private async executeActionWithNewArticle(action: PendingAction): Promise<AIExecutionResult> {
  console.log('🎯 Executing action with new article:', action.itemName);
  console.log('🎯 Action details:', action);
  
  try {
    if (action.type === 'create_list') {
      console.log('🎯 Creating new article for list creation');
      
      const articleData = {
        name: action.itemName,
        amount: action.extractedQuantity || '',
        departmentId: action.suggestedDepartment || 'miscellaneous',
        icon: this.aiResponse.suggestIcon(action.itemName)
      };
      
      console.log('🎯 Article data:', articleData);
      
      const newArticle = await this.dataService.createArticle(articleData).toPromise();

      if (!newArticle) {
        throw new Error('Failed to create article');
      }

      console.log('🎯 Created article:', newArticle);

      const listData = {
        name: action.listName!,
        color: this.aiResponse.suggestListColor(action.listName!),
        icon: '🛒',
        articleIds: [newArticle.id],
        itemStates: { 
          [newArticle.id]: { 
            articleId: newArticle.id, 
            isChecked: false, // false = active
            amount: action.extractedQuantity || ''
          } 
        }
      };

      console.log('🎯 List data:', listData);

      const newList = await this.dataService.createList(listData).toPromise();

      console.log('🎯 Created list:', newList);

      // NEW: Set conversation context
      if (newList) {
        this.setConversationContext({
          lastAction: {
            type: 'list_created',
            listId: newList.id,
            listName: newList.name,
            articleName: newArticle.name,
            timestamp: new Date()
          },
          waitingForArticles: {
            listId: newList.id,
            listName: newList.name,
            prompt: 'Möchtest du weitere Artikel hinzufügen?'
          }
        });

        const baseMessage = this.aiResponse.getListCreatedMessage(action.listName!, newArticle.name, action.extractedQuantity);
        const followUpPrompt = this.aiResponse.getListCreatedFollowUpPrompt(action.listName!, true);

        return {
          success: true,
          message: baseMessage,
          listId: newList.id,
          conversationContext: this.getConversationContext(),
          followUpPrompt
        };
      }

      return {
        success: true,
        message: this.aiResponse.getListCreatedMessage(action.listName!, newArticle.name, action.extractedQuantity),
        listId: newList ? (newList as any).id : undefined
      };
    } else {
      // Handle add item without list specified
      const listOptions = await this.disambiguation.getListSelectionOptions();
      
      if (listOptions.length === 0) {
        return {
          success: false,
          message: this.aiResponse.getNoListsFoundMessage()
        };
      }

      if (listOptions.length === 1) {
        return this.executeActionWithNewArticleToList(action, listOptions[0].name);
      }

      // Ask for list selection
      action.type = 'select_list';
      action.articleToAdd = {
        name: action.itemName,
        amount: action.extractedQuantity || '',
        departmentId: action.suggestedDepartment || 'miscellaneous',
        icon: this.aiResponse.suggestIcon(action.itemName)
      };

      return {
        success: true,
        message: this.aiResponse.getListSelectionMessage(action.itemName, action.extractedQuantity),
        needsUserInput: true,
        disambiguationOptions: this.disambiguation.convertListsToDisambiguationOptions(listOptions),
        pendingAction: action
      };
    }
  } catch (error) {
    console.error('🎯 Error creating new article:', error);
    return {
      success: false,
      message: '❌ Fehler beim Erstellen des neuen Artikels.'
    };
  }
}

/**
 * 🎯 Execute action with new article to specific list with conversation context
 */

private async executeActionWithNewArticleToList(action: PendingAction, listName: string): Promise<AIExecutionResult> {
  console.log('🎯 Executing action with new article to list:', listName);
  console.log('🎯 Action details:', action);
  
  try {
    console.log('🎯 Creating new article...');
    
    const articleData = {
      name: action.itemName,
      amount: action.extractedQuantity || '',
      departmentId: this.aiResponse.suggestDepartment(action.itemName),
      icon: this.aiResponse.suggestIcon(action.itemName)
    };
    
    console.log('🎯 Article data to create:', articleData);

    const newArticle = await this.dataService.createArticle(articleData).toPromise();

    if (newArticle) {
      console.log('✅ Created article:', newArticle);
      
      console.log('🎯 Finding target list...');
      const targetList = await this.findListByName(listName);

      if (targetList) {
        console.log('✅ Found target list:', targetList.name);
        console.log('🎯 Adding article to list using updateList method...');
        
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
          console.log('✅ Successfully added article to list using updateList');
          
          // NEW: Set conversation context for follow-up (even for existing lists)
          this.setConversationContext({
            lastAction: {
              type: 'article_added',
              listId: targetList.id,
              listName: targetList.name,
              articleName: newArticle.name,
              timestamp: new Date()
            },
            waitingForArticles: {
              listId: targetList.id,
              listName: targetList.name,
              prompt: 'Möchtest du noch weitere Artikel hinzufügen?'
            }
          });

          const baseMessage = this.aiResponse.getItemAddedMessage(newArticle.name, action.extractedQuantity, targetList.name);
          
          // NEW: Add follow-up prompt for existing lists too
          const followUpPrompt = this.aiResponse.getArticleAddedFollowUpPrompt(newArticle.name, targetList.name);
          
          return {
            success: true,
            message: baseMessage,
            listId: targetList.id,
            conversationContext: this.getConversationContext(),
            followUpPrompt // NEW: This keeps conversation going for existing lists too
          };
        } else {
          console.error('❌ updateList returned false');
          return {
            success: false,
            message: `❌ Fehler beim Hinzufügen von "${newArticle.name}" zur Liste "${targetList.name}".`
          };
        }
      } else {
        console.error('❌ Target list not found:', listName);
        return {
          success: false,
          message: `❌ Liste "${listName}" nicht gefunden.`
        };
      }
    } else {
      console.error('❌ Failed to create article');
      return {
        success: false,
        message: `❌ Fehler beim Erstellen des Artikels "${action.itemName}".`
      };
    }
  } catch (error) {
    console.error('🔍 Error adding to list:', error);
    return {
      success: false,
      message: '❌ Fehler beim Hinzufügen des Artikels.'
    };
  }
}

  /**
   * 🎯 Find list by name (ENHANCED: Better case-insensitive matching)
   */
  private async findListByName(listName: string): Promise<ShoppingList | null> {
    try {
      console.log('🔍 Finding list by name:', listName);
      
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      if (!lists) {
        console.log('🔍 No lists found');
        return null;
      }
      
      console.log('🔍 Available lists:', lists.map(l => l.name));
      
      const normalizedQuery = listName.toLowerCase().trim();
      
      // Exact match first (case-insensitive)
      let match = lists.find(list => 
        list.name.toLowerCase() === normalizedQuery
      );
      
      if (match) {
        console.log('🔍 Found exact match:', match.name);
        return match;
      }
      
      // Partial match
      match = lists.find(list => 
        list.name.toLowerCase().includes(normalizedQuery) ||
        normalizedQuery.includes(list.name.toLowerCase())
      );
      
      if (match) {
        console.log('🔍 Found partial match:', match.name);
      } else {
        console.log('🔍 No match found for:', listName);
      }
      
      return match || null;
    } catch (error) {
      console.error('Error finding list by name:', error);
      return null;
    }
  }
}