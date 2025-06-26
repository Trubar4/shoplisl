// src/app/core/services/ai/ai.service.ts - Enhanced with Text Numbers Support
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
import { ShoppingList } from '../../models';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AIService {
  private readonly GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
  // MAIN COMMAND EXECUTION
  // ========================================

  /**
   * Execute AI command and perform actual data operations
   */
  async executeCommand(input: string): Promise<AIExecutionResult> {
    try {
      console.log('🤖 Processing command:', input);
      
      // 🔑 Handle API key setup commands FIRST
      if (input.toLowerCase().includes('api key')) {
        return this.handleApiKeyCommand(input);
      }
      
      // Handle simple test commands
      if (input.toLowerCase().includes('hilfe') || input.toLowerCase().includes('help')) {
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
        return await this.handleShowListsCommand();
      }

      // 🎯 Check if API key is configured for advanced features
      const hasApiKey = this.hasApiKey();
      console.log('🔑 Has API Key:', hasApiKey);
      
      // 🎯 ENHANCED: Process command with multi-item support (if API key available)
      if (hasApiKey) {
        console.log('🎯 Processing with enhanced features');
        return await this.processEnhancedCommand(input);
      } else {
        console.log('🔄 Processing with basic features');
        return await this.processBasicCommand(input);
      }
      
    } catch (error) {
      console.error('AI Service error:', error);
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
    console.log('🎯 Handling disambiguation choice:', { pendingAction, selectedOption });
    
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
   * 🎨 Handle list creation with color support (ENHANCED: Better case preservation)
   */
  private async handleListCreationWithColor(input: string, quantityExtraction: any): Promise<AIExecutionResult> {
    console.log('🎨 HANDLING LIST CREATION WITH COLOR:', input);
    console.log('🎨 Quantity extraction:', quantityExtraction);
    
    // Extract color first
    const colorExtraction = this.commandParser.extractColor(input);
    console.log('🎨 COLOR EXTRACTION:', colorExtraction);
    
    // 🎯 ENHANCED: Parse list creation from original input to preserve case
    const cleanInput = colorExtraction.cleanInput;
    
    // Pattern: "erstelle liste [name] mit [item]" or "erstelle liste [name]" - case insensitive match but extract from original
    const createMatch = cleanInput.match(/erstelle\s+liste\s+(.+?)(?:\s+mit\s+(.+))?$/i);
    
    if (!createMatch) {
      return {
        success: false,
        message: '❌ Unverständlicher Liste-Befehl.\n\n💡 Beispiele:\n• "Erstelle Liste Spar"\n• "Erstelle Liste REWE in rot"\n• "Erstelle Liste ADEG mit Milch in blau"'
      };
    }
    
    const listName = createMatch[1].trim();
    const itemName = createMatch[2]?.trim();
    
    console.log('🎨 PARSED LIST CREATION:', { listName, itemName, color: colorExtraction.colorHex });
    
    try {
      const articleIds: string[] = [];
      const itemStates: any = {};
      
      // Create article if specified
      if (itemName) {
        const articleToCreate = {
          name: quantityExtraction.itemName || itemName,
          amount: quantityExtraction.quantity || '',
          departmentId: this.aiResponse.suggestDepartment(itemName),
          icon: this.aiResponse.suggestIcon(itemName)
        };
        
        console.log('🎨 CREATING ARTICLE:', articleToCreate);
        
        const newArticle = await this.dataService.createArticle(articleToCreate).toPromise();
        
        if (newArticle) {
          articleIds.push(newArticle.id);
          // 🎯 ENHANCED: Ensure new articles are active
          itemStates[newArticle.id] = { 
            articleId: newArticle.id, 
            isChecked: false, // false = active
            amount: quantityExtraction.quantity || '',
            addedAt: new Date().toISOString()
          };
        }
      }
      
      // Use extracted color or suggest based on name
      const listColor = colorExtraction.colorHex || this.aiResponse.suggestListColor(listName);
      
      const listToCreate = {
        name: listName,
        color: listColor,
        icon: '🛒',
        articleIds,
        itemStates
      };
      
      console.log('🎨 CREATING LIST:', listToCreate);
      
      const newList = await this.dataService.createList(listToCreate).toPromise();
      
      if (newList) {
        return {
          success: true,
          message: this.aiResponse.getListCreatedMessage(
            listName, 
            quantityExtraction.itemName || itemName, 
            quantityExtraction.quantity, 
            colorExtraction.colorName
          ),
          listId: newList.id
        };
      }
    } catch (error) {
      console.error('🎨 LIST CREATION ERROR:', error);
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
  // ACTION EXECUTION HELPERS (ENHANCED)
  // ========================================

/**
 * 🎯 Execute action with new article (FIXED: Use updateList instead of addArticleToList)
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

      return {
        success: true,
        message: this.aiResponse.getListCreatedMessage(action.listName!, newArticle.name, action.extractedQuantity),
        listId: newList?.id
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
 * 🎯 Execute action with new article to specific list (FIXED: Use updateList instead of addArticleToList)
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
        
        // 🎯 FIXED: Use updateList method instead of addArticleToList
        const updatedArticleIds = [...targetList.articleIds];
        if (!updatedArticleIds.includes(newArticle.id)) {
          updatedArticleIds.push(newArticle.id);
        }

        // 🎯 CRITICAL: Create item states with explicit active state
        const updatedItemStates = { ...targetList.itemStates };
        updatedItemStates[newArticle.id] = {
          articleId: newArticle.id,
          isChecked: false, // 🎯 FALSE = ACTIVE/NOT STRIKED OUT
          amount: action.extractedQuantity || ''
        };

        console.log(`🎯 Setting article ${newArticle.id} as ACTIVE (isChecked: false)`);
        console.log('🔍 Item state:', updatedItemStates[newArticle.id]);
        console.log('🔍 All updated item states:', updatedItemStates);

        // Use existing updateList method
        const updateResult = await this.dataService.updateList(targetList.id, {
          articleIds: updatedArticleIds,
          itemStates: updatedItemStates
        }).toPromise();
        
        if (updateResult) {
          console.log('✅ Successfully added article to list using updateList');
          return {
            success: true,
            message: this.aiResponse.getItemAddedMessage(newArticle.name, action.extractedQuantity, targetList.name),
            listId: targetList.id
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