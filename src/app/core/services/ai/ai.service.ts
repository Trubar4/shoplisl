// src/app/core/services/ai/ai.service.ts - Complete with Recipe Features
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

  // ENHANCED: Conversation context tracking with continuation support
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
  // PUBLIC ACCESSOR METHODS
  // ========================================

  /**
   * Public access to disambiguation service
   */
  public async getDisambiguationOptions(itemName: string): Promise<DisambiguationOption[]> {
    return this.disambiguation.getDisambiguationOptions(itemName);
  }

  /**
   * Public access to department suggestion
   */
  public suggestDepartment(itemName: string): string {
    return this.aiResponse.suggestDepartment(itemName);
  }

  /**
   * Public access to icon suggestion
   */
  public suggestIcon(itemName: string): string {
    return this.aiResponse.suggestIcon(itemName);
  }

  /**
   * Public access to quantity extraction
   */
  public extractQuantity(input: string): any {
    return this.quantityExtraction.extractQuantity(input);
  }

  // ========================================
  // CONVERSATION CONTEXT MANAGEMENT
  // ========================================

  setConversationContext(context: ConversationContext): void {
    console.log('🤖 AI Service setting conversation context:', context);
    this.conversationContext = context;
  }
  
  getConversationContext(): ConversationContext {
    return this.conversationContext || {};
  }
  
  clearConversationContext(): void {
    console.log('🤖 AI Service clearing conversation context');
    this.conversationContext = {};
  }

  /**
   * Check if we're waiting for articles to be added
   */
  private isWaitingForArticles(): boolean {
    return !!this.conversationContext.waitingForArticles;
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

  // ========================================
  // RECIPE PROCESSING METHODS
  // ========================================

  /**
   * Detect if input is a recipe command
   */
  private isRecipeCommand(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    
    // Check for recipe keywords at the start
    const recipeKeywords = [
      'rezept:', 'rezept ', 'zutaten:', 'zutaten ',
      'ingredienzien:', 'ingredienzien ', 'ingredients:',
      'einkaufsliste aus rezept'
    ];
    
    return recipeKeywords.some(keyword => lowerInput.startsWith(keyword));
  }

  /**
   * Extract recipe ingredients after keyword
   */
  private extractRecipeContent(input: string): string {
    const lowerInput = input.toLowerCase();
    
    // Find where the actual recipe content starts
    const keywords = ['rezept:', 'rezept ', 'zutaten:', 'zutaten ', 'ingredienzien:', 'ingredienzien ', 'ingredients:'];
    
    for (const keyword of keywords) {
      const index = lowerInput.indexOf(keyword);
      if (index !== -1) {
        return input.substring(index + keyword.length).trim();
      }
    }
    
    return input.trim();
  }

  /**
   * Clean and standardize messy recipe text using Grok
   */
  private async standardizeRecipeIngredients(rawRecipeText: string, targetList?: string): Promise<string> {
    console.log('🍳 Standardizing recipe ingredients:', rawRecipeText.substring(0, 100));
    
    const cleanedText = this.cleanRawRecipeText(rawRecipeText);
    
    const prompt = `Du bist ein Experte für deutsche Rezepte. Analysiere diese Zutatenliste und konvertiere sie zu Einkaufsliste-Befehlen.

EINGABE (kann unordentlich sein):
${cleanedText}

REGELN:
1. Ignoriere Überschriften wie "Für den Teig:", "Zubereitung:", "Portionen:" etc.
2. Ignoriere Zubereitungsschritte und Anweisungen
3. Extrahiere nur echte Zutaten mit Mengen
4. Konvertiere zu Format: "Füge [Artikel] [Menge] hinzu"
5. Verwende deutsche Maßeinheiten (g, kg, ml, l, EL, TL, Prise, Stück)
6. Vereinfache komplexe Beschreibungen zu Grundzutaten

BEISPIELE:
"500 g Weizenmehl Type 405" → "Füge Mehl 500g hinzu"
"2 mittelgroße Eier" → "Füge Eier 2 Stück hinzu"
"1 Prise Salz" → "Füge Salz 1 Prise hinzu"
"250ml Vollmilch 3,5%" → "Füge Milch 250ml hinzu"
"2 EL Olivenöl extra virgin" → "Füge Olivenöl 2 EL hinzu"
"1 kleine Zwiebel, gewürfelt" → "Füge Zwiebel 1 Stück hinzu"

AUSGABE:
Gib nur die "Füge ... hinzu" Befehle zurück, einen pro Zeile.
Keine Erklärungen, keine Überschriften, keine leeren Zeilen.`;

    try {
      const response = await this.callGroqAPI(prompt);
      console.log('🍳 Grok standardization result:', response);
      return response.trim();
    } catch (error) {
      console.error('🍳 Error standardizing recipe:', error);
      throw new Error('Fehler beim Verarbeiten des Rezepts');
    }
  }

  /**
   * Clean raw recipe text before sending to Grok
   */
  private cleanRawRecipeText(rawText: string): string {
    return rawText
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove common symbols that interfere
      .replace(/[•◦▪▫]/g, '') // bullet points
      .replace(/[-–—]{2,}/g, '') // multiple dashes
      .replace(/[*]{2,}/g, '') // multiple asterisks
      // Normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive line breaks but keep structure
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Call Groq API
   */
  private async callGroqAPI(prompt: string): Promise<string> {
    const apiKey = this.getSecureApiKey();
    
    if (!apiKey) {
      throw new Error('Groq API Key ist erforderlich für Rezept-Features');
    }

    const response = await fetch(this.GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Low temperature for consistent formatting
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API Fehler: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Process recipe command and convert to shopping list items
   */
  private async processRecipeCommand(input: string): Promise<AIExecutionResult> {
    console.log('🍳 Processing recipe command:', input.substring(0, 50));
    
    try {
      // Extract recipe content after keyword
      const recipeContent = this.extractRecipeContent(input);
      
      if (!recipeContent || recipeContent.length < 10) {
        return {
          success: false,
          message: '❌ Keine Zutatenliste gefunden.\n\n💡 Beispiel:\n"Rezept: 500g Mehl\\n2 Eier\\n250ml Milch"'
        };
      }
      
      // Check if we have an API key
      if (!this.hasApiKey()) {
        return {
          success: false,
          message: '🔑 Groq API Key erforderlich für Rezept-Features.\n\nSage: "set api key: gsk_YOUR_KEY"'
        };
      }
      
      // Standardize ingredients using Grok
      const standardizedCommands = await this.standardizeRecipeIngredients(recipeContent);
      
      if (!standardizedCommands) {
        return {
          success: false,
          message: '❌ Keine Zutaten im Rezept erkannt.\n\nBitte überprüfe das Format.'
        };
      }
      
      // Split into individual commands
      const commands = standardizedCommands
        .split('\n')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0 && cmd.includes('Füge') && cmd.includes('hinzu'));
      
      if (commands.length === 0) {
        return {
          success: false,
          message: '❌ Keine gültigen Zutaten gefunden.\n\nBitte versuche es mit einem anderen Format.'
        };
      }
      
      console.log('🍳 Extracted commands:', commands);
      
      // Combine all commands into multi-item format
      const multiItemCommand = commands.join(', ')
        .replace(/Füge /g, '')
        .replace(/ hinzu/g, '');
      
      const finalCommand = `Füge ${multiItemCommand} hinzu`;
      
      console.log('🍳 Final multi-item command:', finalCommand);
      
      // Process through existing multi-item system
      return await this.processEnhancedCommandWithMultiItems(finalCommand);
      
    } catch (error) {
      console.error('🍳 Recipe processing error:', error);
      return {
        success: false,
        message: `❌ Fehler beim Verarbeiten des Rezepts: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}\n\n💡 Versuche es mit einer einfacheren Zutatenliste.`
      };
    }
  }

  // ========================================
  // NEW: CONTINUATION KEYWORD HANDLING
  // ========================================

  /**
   * Check if input contains continuation keywords
   */
  private isContinuationKeyword(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    const continuationKeywords = ['und', 'weiters', 'außerdem', 'zusätzlich', 'noch', 'dann', 'danach'];
    
    return continuationKeywords.some(keyword => 
      lowerInput.startsWith(keyword + ' ') || 
      lowerInput === keyword
    );
  }

  /**
   * Handle continuation commands with context awareness
   */
  private async handleContinuationCommand(input: string): Promise<AIExecutionResult> {
    console.log('🔄 Handling continuation command:', input);
    
    // Check for existing conversation context first
    if (this.conversationContext.waitingForArticles) {
      console.log('🔄 Already in conversation mode - processing as contextual addition');
      return await this.handleContextualContinuation(input);
    }
    
    // Check for recent list action to continue with
    if (this.conversationContext.lastAction) {
      const timeSince = Date.now() - this.conversationContext.lastAction.timestamp.getTime();
      const maxAge = 10 * 60 * 1000; // 10 minutes
      
      if (timeSince < maxAge && this.conversationContext.lastAction.listId) {
        console.log('🔄 Found recent list action - activating continuation mode');
        return await this.activateContinuationMode(input);
      }
    }
    
    // No valid context for continuation
    return {
      success: false,
      message: '💡 Keine kürzliche Liste gefunden zum Fortsetzen.\n\n' +
               'Verwende Fortsetzungs-Wörter wie "und" oder "weiters" nur nach dem Hinzufügen von Artikeln zu einer Liste.\n\n' +
               'Beispiel:\n' +
               '1. "Füge Milch zu Spar hinzu"\n' +
               '2. "Und Brot" (fügt Brot zur selben Liste hinzu)\n' +
               '3. "Weiters Käse" (fügt Käse zur selben Liste hinzu)'
    };
  }

  /**
   * Handle continuation in existing conversation context
   */
  private async handleContextualContinuation(input: string): Promise<AIExecutionResult> {
    if (!this.conversationContext.waitingForArticles) {
      return {
        success: false,
        message: '❌ Kein aktiver Unterhaltungskontext gefunden.'
      };
    }

    const { listId, listName } = this.conversationContext.waitingForArticles;
    
    // Extract items after continuation keyword
    const itemsText = this.extractItemsFromContinuation(input);
    
    if (!itemsText.trim()) {
      // Just the continuation keyword - prompt for what to add
      return {
        success: true,
        message: `Was möchtest du noch zu "${listName}" hinzufügen?`,
        conversationContext: this.getConversationContext()
      };
    }
    
    // Process the items in conversation context
    console.log('🔄 Processing continuation items:', itemsText);
    return await this.handleContextualArticleAddition(itemsText);
  }

  /**
   * Activate continuation mode from recent list action
   */
  private async activateContinuationMode(input: string): Promise<AIExecutionResult> {
    if (!this.conversationContext.lastAction?.listId) {
      return {
        success: false,
        message: '❌ Keine gültige Liste zum Fortsetzen gefunden.'
      };
    }

    const { listId, listName } = this.conversationContext.lastAction;
    
    // Extract items after continuation keyword
    const itemsText = this.extractItemsFromContinuation(input);
    
    if (!itemsText.trim()) {
      // Set conversation context and prompt
      this.setConversationContext({
        lastAction: this.conversationContext.lastAction,
        waitingForArticles: {
          listId: listId,
          listName: listName,
          prompt: 'Continuation mode activated'
        }
      });
      
      return {
        success: true,
        message: `Fortsetzungsmodus aktiviert für "${listName}".\n\nWas möchtest du hinzufügen?`,
        conversationContext: this.getConversationContext(),
        followUpPrompt: `Was soll noch zu "${listName}" hinzugefügt werden?`
      };
    }
    
    // Set conversation context and process items
    this.setConversationContext({
      lastAction: this.conversationContext.lastAction,
      waitingForArticles: {
        listId: listId,
        listName: listName,
        prompt: 'Continuation mode'
      }
    });
    
    console.log('🔄 Processing continuation with items:', itemsText);
    return await this.handleContextualArticleAddition(itemsText);
  }

  /**
   * Extract items text from continuation command
   */
  private extractItemsFromContinuation(input: string): string {
    const lowerInput = input.toLowerCase().trim();
    const continuationKeywords = ['und', 'weiters', 'außerdem', 'zusätzlich', 'noch', 'dann', 'danach'];
    
    for (const keyword of continuationKeywords) {
      if (lowerInput.startsWith(keyword + ' ')) {
        return input.substring(keyword.length + 1).trim();
      } else if (lowerInput === keyword) {
        return ''; // Just the keyword, no items
      }
    }
    
    return input; // Fallback
  }

  // ========================================
  // ENHANCED CONTEXTUAL ARTICLE ADDITION
  // ========================================

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
      
      // 🍳 ADD SKIP OPTION for contextual addition
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
      
      // Create a pending action for disambiguation
      const pendingAction: PendingAction = {
        type: 'add_item',
        originalInput: input,
        itemName: quantityExtraction.itemName,
        extractedQuantity: quantityExtraction.quantity,
        listName: listName,
        suggestedDepartment: this.aiResponse.suggestDepartment(quantityExtraction.itemName)
      };
      
      return {
        success: true,
        message: this.aiResponse.getDisambiguationMessage(quantityExtraction.itemName),
        needsUserInput: true,
        disambiguationOptions: enhancedOptions,
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
    console.log('🗣️ Handling multiple items in context with proper disambiguation:', input);
    
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
    
    // Process each item individually with proper disambiguation
    return await this.processMultipleItemsSequentially(items, targetList, 0, []);
  }

  /**
   * Process multiple items sequentially with disambiguation
   */
  private async processMultipleItemsSequentially(
    items: string[], 
    targetList: any, 
    currentIndex: number, 
    processedItems: any[]
  ): Promise<AIExecutionResult> {
    
    if (currentIndex >= items.length) {
      // All items processed - update list and return success
      return await this.finalizeMultipleItemsAddition(targetList, processedItems);
    }
    
    const currentItemText = items[currentIndex];
    const quantityExtraction = this.quantityExtraction.extractQuantity(currentItemText);
    
    console.log('🗣️ Processing item', currentIndex + 1, 'of', items.length, ':', quantityExtraction.itemName);
    
    // Check for disambiguation for current item
    const disambiguationOptions = await this.disambiguation.getDisambiguationOptions(quantityExtraction.itemName);
    const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');
    
    if (existingOptions.length > 0) {
      console.log('🗣️ Found existing options for item', currentIndex + 1, ', showing disambiguation');
      
      // 🍳 ADD SKIP OPTION for multi-item processing
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
      
      // Create pending action for current item with remaining items info
      const pendingAction: any = {
        type: 'add_item',
        originalInput: items.join(', '),
        itemName: quantityExtraction.itemName,
        extractedQuantity: quantityExtraction.quantity,
        listName: targetList.name,
        suggestedDepartment: this.aiResponse.suggestDepartment(quantityExtraction.itemName),
        // Multi-item context
        isMultiItemSequential: true,
        allItems: items,
        currentItemIndex: currentIndex,
        processedItems: processedItems,
        conversationListId: targetList.id
      };
      
      return {
        success: true,
        message: `🎯 Artikel ${currentIndex + 1}/${items.length}: "${quantityExtraction.itemName}"\n\n${this.aiResponse.getDisambiguationMessage(quantityExtraction.itemName)}`,
        needsUserInput: true,
        disambiguationOptions: enhancedOptions,
        pendingAction: pendingAction
      };
    }
    
    // No disambiguation needed - create article and continue
    try {
      const articleData = {
        name: quantityExtraction.itemName,
        amount: quantityExtraction.quantity || '',
        departmentId: this.aiResponse.suggestDepartment(quantityExtraction.itemName),
        icon: this.aiResponse.suggestIcon(quantityExtraction.itemName)
      };
      
      const newArticle = await this.dataService.createArticle(articleData).toPromise();
      
      if (newArticle) {
        processedItems.push({
          article: newArticle,
          quantity: quantityExtraction.quantity,
          originalText: currentItemText
        });
        
        console.log('🗣️ Created article for item', currentIndex + 1, ':', newArticle.name);
        
        // Continue with next item
        return await this.processMultipleItemsSequentially(items, targetList, currentIndex + 1, processedItems);
      } else {
        throw new Error('Failed to create article');
      }
    } catch (error: any) {
      console.error('🗣️ Error creating article for item', currentIndex + 1, ':', error);
      
      // Continue with next item even if one fails
      return await this.processMultipleItemsSequentially(items, targetList, currentIndex + 1, processedItems);
    }
  }

  /**
   * Finalize multiple items addition to list
   */
  private async finalizeMultipleItemsAddition(targetList: any, processedItems: any[]): Promise<AIExecutionResult> {
    if (processedItems.length === 0) {
      return {
        success: false,
        message: '❌ Keine Artikel konnten hinzugefügt werden.'
      };
    }
    
    try {
      let updatedArticleIds = [...targetList.articleIds];
      let updatedItemStates = { ...targetList.itemStates };
      
      // Add all processed items to the list
      for (const item of processedItems) {
        if (!updatedArticleIds.includes(item.article.id)) {
          updatedArticleIds.push(item.article.id);
        }
        
        updatedItemStates[item.article.id] = {
          articleId: item.article.id,
          isChecked: false,
          amount: item.quantity || ''
        };
      }
      
      const updateResult = await this.dataService.updateList(targetList.id, {
        articleIds: updatedArticleIds,
        itemStates: updatedItemStates
      }).toPromise();
      
      if (updateResult) {
        // CRITICAL: Set conversation context to continue conversation
        this.setConversationContext({
          lastAction: {
            type: 'article_added',
            listId: targetList.id,
            listName: targetList.name,
            articleName: `${processedItems.length} Artikel`,
            timestamp: new Date()
          },
          waitingForArticles: {
            listId: targetList.id,
            listName: targetList.name,
            prompt: 'Möchtest du noch weitere Artikel hinzufügen?'
          }
        });

        const addedItems = processedItems.map(item => 
          `"${item.article.name}"${item.quantity ? ` (${item.quantity})` : ''}`
        );
        
        const followUpPrompt = this.aiResponse.getArticleAddedFollowUpPrompt('mehrere Artikel', targetList.name);
        
        return {
          success: true,
          message: `✅ ${processedItems.length} Artikel zu "${targetList.name}" hinzugefügt:\n${addedItems.join(', ')}`,
          listId: targetList.id,
          conversationContext: this.getConversationContext(),
          followUpPrompt
        };
      }
      
      return {
        success: false,
        message: '❌ Fehler beim Aktualisieren der Liste.'
      };
      
    } catch (error: any) {
      console.error('🗣️ Error finalizing multiple items addition:', error);
      return {
        success: false,
        message: '❌ Fehler beim Hinzufügen der Artikel zur Liste.'
      };
    }
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
   * SECURE: Get API key with localStorage priority
   */
  private getSecureApiKey(): string {
    const localStorageKey = localStorage.getItem('groq-api-key');
    const environmentKey = environment?.groqApiKey;
    return localStorageKey || environmentKey || '';
  }

  /**
   * SECURE: Set API key in localStorage
   */
  setApiKey(apiKey: string): void {
    if (apiKey && apiKey.trim()) {
      localStorage.setItem('groq-api-key', apiKey.trim());
      console.log('🔑 API key saved to localStorage');
      this.logApiKeyStatus();
    }
  }

  /**
   * SECURE: Check if API key is available
   */
  hasApiKey(): boolean {
    return !!this.getSecureApiKey();
  }

  /**
   * Get API key status
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
   * SECURE: Log API key status without exposing the key
   */
  private logApiKeyStatus(): void {
    const status = this.getApiKeyStatus();
    console.log('🔑 API Key Status:', status);
  }

  // ========================================
  // MAIN COMMAND EXECUTION (ENHANCED WITH CONVERSATION CONTEXT)
  // ========================================

  /**
   * Execute AI command with conversation context awareness and continuation support
   */
  async executeCommand(input: string): Promise<AIExecutionResult> {
    console.log('🗣️ CONVERSATION STATE DEBUG:');
    console.log('🗣️ - isWaitingForArticles:', this.isWaitingForArticles());
    console.log('🗣️ - isNegativeResponse:', this.isNegativeResponse(input));
    console.log('🗣️ - isSimpleArticleInput:', this.isSimpleArticleInput(input));
    console.log('🗣️ - isContinuationKeyword:', this.isContinuationKeyword(input));
    console.log('🗣️ - isRecipeCommand:', this.isRecipeCommand(input));
    console.log('🗣️ - conversationContext:', this.conversationContext);
    console.log('🗣️ - input:', input);

    try {
      console.log('🤖 Processing command:', input);
      console.log('🗣️ Current context:', this.conversationContext);
      
      // NEW: Check for recipe commands FIRST
      if (this.isRecipeCommand(input)) {
        console.log('🍳 Recipe command detected');
        return await this.processRecipeCommand(input);
      }
      
      // NEW: Check for continuation keywords FIRST
      if (this.isContinuationKeyword(input)) {
        console.log('🗣️ Continuation keyword detected');
        return await this.handleContinuationCommand(input);
      }
      
      // Handle API key setup commands FIRST
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
  
      // Handle "no" or "nein" when waiting for articles - IMPROVED DETECTION
      if (this.isWaitingForArticles() && this.isNegativeResponse(input)) {
        console.log('🗣️ User declined to add more articles');
        this.clearConversationContext();
        return {
          success: true,
          message: this.aiResponse.getConversationEndedMessage()
        };
      }
  
      // Handle context-aware simple article addition - IMPROVED DETECTION  
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
   * Process command with enhanced features
   */
  private async processEnhancedCommand(input: string): Promise<AIExecutionResult> {
    console.log('🎯 PROCESSING ENHANCED COMMAND:', input);
    
    // Check for comma-separated items first
    if (this.quantityExtraction.hasMultipleItems(input)) {
      console.log('🎯 Detected comma-separated items, using multi-item processing');
      return this.processEnhancedCommandWithMultiItems(input);
    }
    
    // Extract quantity from input with text number support
    const quantityExtraction = this.quantityExtraction.extractQuantity(input);
    console.log('🎯 Quantity extraction result:', quantityExtraction);
    console.log('🎯 - Item name:', quantityExtraction.itemName);
    console.log('🎯 - Quantity:', quantityExtraction.quantity);

    // Parse command intent using the clean item name from quantity extraction
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
        message: `Ich verstehe: "${input}"\n\n🤖 Das ist kein bekannter Befehl.\n\n💡 Verfügbare Befehle:\n• "Füge [Artikel] hinzu"\n• "Füge [Artikel] zu [Liste] hinzu"\n• "Füge Bananen, Würste, Milch hinzu"\n• "Erstelle Liste [Name]"\n• "Zeige Listen"\n• "Rezept: [Zutatenliste]"\n\n🔄 Fortsetzung:\n• "und [Artikel]" - Nach Artikel-Hinzufügung\n• "weiters [Artikel]" - Österreichische Variante`
      };
    }

    // Handle create list commands
    if (intent.type === 'create_list') {
      console.log('🎯 Processing create list command');
      return await this.handleListCreationWithColor(input, quantityExtraction);
    }

    // Handle add item commands with better debugging
    if (intent.type === 'add_item' && intent.itemName !== 'UNRECOGNIZED_COMMAND') {
      console.log('🎯 Processing add item command');
      console.log('🎯 Final item name:', quantityExtraction.itemName);
      console.log('🎯 Final quantity:', quantityExtraction.quantity);
      console.log('🎯 Target list:', intent.listName);
      
      // Create enhanced action with proper quantity
      const pendingAction: PendingAction = {
        type: intent.type,
        originalInput: input,
        itemName: quantityExtraction.itemName,
        extractedQuantity: quantityExtraction.quantity,
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
   * Process command with multi-item support
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
   * Process commands with basic functionality
   */
  private async processBasicCommand(input: string): Promise<AIExecutionResult> {
    console.log('🤖 PROCESSING BASIC COMMAND:', input);
    
    const lowerInput = input.toLowerCase();
    const originalInput = input.trim();
    
    // Extract quantity and item name with text number support
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
      message: `Ich verstehe: "${originalInput}"\n\n🤖 Das ist kein bekannter Befehl.\n\n💡 Verfügbare Befehle:\n• "Füge [Artikel] hinzu"\n• "Füge [Artikel] zu [Liste] hinzu"\n• "Erstelle Liste [Name]"\n• "Zeige Listen"\n• "Rezept: [Zutatenliste]" (mit API Key)\n\n🔄 Fortsetzung:\n• "und [Artikel]" - Nach Artikel-Hinzufügung\n• "weiters [Artikel]" - Österreichische Variante\n\n${this.aiResponse.getNoApiKeyGuidance()}`
    };
  }

  // ========================================
  // DISAMBIGUATION HANDLING
  // ========================================

  /**
   * Handle disambiguation choice (supports both single and multi-item)
   */
  async handleDisambiguationChoice(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('🎯 Handling disambiguation choice with conversation context');
    console.log('🎯 Pending action:', pendingAction);
    console.log('🎯 Selected option:', selectedOption);
    console.log('🎯 Current conversation context:', this.conversationContext);
    
    // Handle SKIP option specially
    if (selectedOption.type === 'skip') {
      return await this.handleSkipOption(pendingAction, selectedOption);
    }
    
    // Handle sequential multi-item disambiguation (for "und Brot, Gurken, Mais")
    if ((pendingAction as any).isMultiItemSequential) {
      return await this.handleSequentialMultiItemDisambiguation(pendingAction as any, selectedOption);
    }
    
    // Check if we're in conversation mode
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
          articleToAdd = selectedOption.article;
          console.log('🎯 Using existing article in conversation:', articleToAdd.name);
        } else {
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
          const targetList = await this.findListById(conversationListId);
          
          if (targetList) {
            let updatedArticleIds = [...targetList.articleIds];
            let updatedItemStates = { ...targetList.itemStates };
            
            if (!updatedArticleIds.includes(articleToAdd.id)) {
              updatedArticleIds.push(articleToAdd.id);
            }
    
            updatedItemStates[articleToAdd.id] = {
              articleId: articleToAdd.id,
              isChecked: false,
              amount: pendingAction.extractedQuantity || ''
            };
    
            const updateResult = await this.dataService.updateList(targetList.id, {
              articleIds: updatedArticleIds,
              itemStates: updatedItemStates
            }).toPromise();
            
            if (updateResult) {
              // CRITICAL: Maintain conversation context
              this.setConversationContext({
                lastAction: {
                  type: 'article_added',
                  listId: targetList.id,
                  listName: targetList.name,
                  articleName: articleToAdd.name,
                  timestamp: new Date()
                },
                waitingForArticles: {
                  listId: targetList.id,
                  listName: targetList.name,
                  prompt: 'Möchtest du noch weitere Artikel hinzufügen?'
                }
              });
    
              const message = `✅ "${articleToAdd.name}" wurde zu "${targetList.name}" hinzugefügt.`;
              const followUpPrompt = this.aiResponse.getArticleAddedFollowUpPrompt(articleToAdd.name, targetList.name);
              
              return {
                success: true,
                message: message,
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
        
      } catch (error: any) {
        console.error('🎯 Error in conversation disambiguation:', error);
        return {
          success: false,
          message: '❌ Fehler beim Verarbeiten der Auswahl.'
        };
      }
    }
    
    // NON-CONVERSATION MODE: Use regular disambiguation handling
    console.log('🎯 Using REGULAR disambiguation handling with conversation setup');
    
    const result = await this.disambiguation.handleDisambiguationChoice(pendingAction, selectedOption);
    
    // CRITICAL FIX: Set conversation context after successful article addition
    if (result.success && result.listId && result.message.includes('hinzugefügt')) {
      const messageMatch = result.message.match(/"([^"]+)" wurde zu "([^"]+)" hinzugefügt/);
      const articleName = messageMatch ? messageMatch[1] : pendingAction.itemName;
      const listName = messageMatch ? messageMatch[2] : (pendingAction.listName || 'Unknown');
      
      this.setConversationContext({
        lastAction: {
          type: 'article_added',
          listId: result.listId,
          listName: listName,
          articleName: articleName,
          timestamp: new Date()
        },
        waitingForArticles: {
          listId: result.listId,
          listName: listName,
          prompt: 'Möchtest du noch weitere Artikel hinzufügen?'
        }
      });
      
      result.conversationContext = this.getConversationContext();
      result.followUpPrompt = 'Möchtest du noch weitere Artikel hinzufügen? Du kannst auch "und [Artikel]" oder "weiters [Artikel]" sagen.';
    }
    
    return result;
  }

  // ADD this new method to handle skip options:
  private async handleSkipOption(pendingAction: any, selectedOption: DisambiguationOption): Promise<AIExecutionResult> {
    console.log('⏭️ Handling skip option for:', pendingAction.itemName);
    
    // Handle different types of pending actions for skip
    if (pendingAction.isMultiItemSequential) {
      return await this.handleSkipInSequentialMultiItem(pendingAction);
    } else if ('items' in pendingAction && 'currentItemIndex' in pendingAction) {
      return await this.handleSkipInMultiItem(pendingAction);
    } else {
      // Single item skip - just show completion message and maintain conversation
      const context = this.getConversationContext();
      return {
        success: true,
        message: `⏭️ "${pendingAction.itemName}" übersprungen (bereits vorhanden).\n\nDu kannst weitere Artikel hinzufügen.`,
        conversationContext: context.waitingForArticles ? context : undefined,
        followUpPrompt: context.waitingForArticles ? 'Möchtest du noch weitere Artikel hinzufügen?' : undefined
      };
    }
  }

  private async handleSkipInSequentialMultiItem(pendingAction: any): Promise<AIExecutionResult> {
    const { allItems, currentItemIndex, processedItems, conversationListId } = pendingAction;
    
    // Add skipped item to processed items
    const updatedProcessedItems = [...processedItems, {
      originalText: allItems[currentItemIndex],
      skipped: true,
      reason: 'already_have'
    }];
    
    // Continue with next item
    try {
      const targetList = await this.findListById(conversationListId);
      if (!targetList) {
        return {
          success: false,
          message: '❌ Zielliste nicht gefunden.'
        };
      }
      
      return await this.processMultipleItemsSequentially(
        allItems, 
        targetList, 
        currentItemIndex + 1, 
        updatedProcessedItems
      );
    } catch (error) {
      console.error('⏭️ Error handling skip in sequential processing:', error);
      return {
        success: false,
        message: '❌ Fehler beim Fortsetzen der Verarbeitung.'
      };
    }
  }

  private async handleSkipInMultiItem(pendingAction: any): Promise<AIExecutionResult> {
    // Mark current item as skipped and continue
    pendingAction.processedItems = pendingAction.processedItems || [];
    pendingAction.processedItems.push({
      item: { itemName: pendingAction.itemName },
      skipped: true,
      reason: 'already_have'
    });
    
    // Move to next item
    pendingAction.currentItemIndex++;
    
    // Continue processing through AI service multi-item flow
    try {
      return await this.disambiguation.processMultiItemSequentially(pendingAction);
    } catch (error) {
      console.error('⏭️ Error handling skip in multi-item:', error);
      return {
        success: false,
        message: '❌ Fehler beim Fortsetzen der Verarbeitung.'
      };
    }
  }

  // ADD this new method to handle sequential multi-item disambiguation:
  private async handleSequentialMultiItemDisambiguation(pendingAction: any, selectedOption: DisambiguationOption): Promise<AIExecutionResult> {
    console.log('🗣️ Handling sequential multi-item disambiguation');
    
    const { allItems, currentItemIndex, processedItems, conversationListId } = pendingAction;
    const targetList = await this.findListById(conversationListId);
    
    if (!targetList) {
      return {
        success: false,
        message: '❌ Zielliste nicht gefunden.'
      };
    }
    
    try {
      let articleToAdd;
      
      if (selectedOption.type === 'existing' && selectedOption.article) {
        articleToAdd = selectedOption.article;
      } else {
        const articleData = {
          name: pendingAction.itemName,
          amount: pendingAction.extractedQuantity || '',
          departmentId: this.aiResponse.suggestDepartment(pendingAction.itemName),
          icon: this.aiResponse.suggestIcon(pendingAction.itemName)
        };
        
        articleToAdd = await this.dataService.createArticle(articleData).toPromise();
      }
      
      if (articleToAdd) {
        const updatedProcessedItems = [...processedItems, {
          article: articleToAdd,
          quantity: pendingAction.extractedQuantity,
          originalText: allItems[currentItemIndex]
        }];
        
        // Continue with next item
        return await this.processMultipleItemsSequentially(
          allItems, 
          targetList, 
          currentItemIndex + 1, 
          updatedProcessedItems
        );
      }
      
      return {
        success: false,
        message: '❌ Fehler beim Erstellen des Artikels.'
      };
      
    } catch (error: any) {
      console.error('🗣️ Error in sequential disambiguation:', error);
      return {
        success: false,
        message: '❌ Fehler beim Verarbeiten der Auswahl.'
      };
    }
  }

  // ========================================
  // SPECIFIC COMMAND HANDLERS
  // ========================================

  /**
   * Handle API key setup via chat command
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
   * Handle show lists command
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
      message += '• "Erstelle Liste [Name]"\n';
      message += '• "Rezept: [Zutatenliste]" (mit API Key)\n';
      message += '• "und [Artikel]" - Fortsetzung nach Artikel-Hinzufügung';
      
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
   * Handle list creation with color support and conversation context
   */
  private async handleListCreationWithColor(input: string, quantityExtraction: any): Promise<AIExecutionResult> {
    console.log('🎨 HANDLING LIST CREATION WITH COLOR:', input);
    console.log('🎨 Quantity extraction:', quantityExtraction);
    
    // Extract color first
    const colorExtraction = this.commandParser.extractColor(input);
    console.log('🎨 COLOR EXTRACTION:', colorExtraction);
    
    // Parse list creation from original input to preserve case
    const cleanInput = colorExtraction.cleanInput;
    
    // Better pattern matching for list creation
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
    
    // Don't create an article if no explicit item was specified
    if (!itemName) {
      console.log('🎨 Creating list WITHOUT initial article');
      
      try {
        const listColor = colorExtraction.colorHex || this.aiResponse.suggestListColor(listName);
        
        const listToCreate = {
          name: listName,
          color: listColor,
          icon: '🛒',
          articleIds: [],
          itemStates: {}
        };
        
        console.log('🎨 CREATING LIST:', listToCreate);
        
        const newList = await this.dataService.createList(listToCreate).toPromise();
        
        if (newList) {
          console.log('✅ List created successfully, setting conversation context');

          this.setConversationContext({
            lastAction: {
              type: 'list_created',
              listId: newList.id,
              listName: newList.name,
              articleName: '',
              timestamp: new Date()
            },
            waitingForArticles: {
              listId: newList.id,
              listName: newList.name,
              prompt: 'Möchtest du Artikel hinzufügen?'
            }
          });
          
          const followUpPrompt = 'Möchtest du jetzt Artikel hinzufügen?';
          
          return {
            success: true,
            message: `✅ Liste "${newList.name}" wurde erstellt.`,
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
          name: itemName,
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
              articleName: '',
              timestamp: new Date()
            },
            waitingForArticles: {
              listId: newList.id,
              listName: newList.name,
              prompt: 'Möchtest du Artikel hinzufügen?'
            }
          });

          const followUpPrompt = 'Möchtest du jetzt weitere Artikel hinzufügen?';

          return {
            success: true,
            message: `✅ Liste "${newList.name}" wurde mit "${itemName}" erstellt.`,
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
   * Enhanced item action with smart disambiguation and skip support
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
      
      // 🍳 ADD SKIP OPTION for recipe processing or multi-item commands
      const isFromRecipe = action.originalInput.toLowerCase().includes('rezept') || 
                          action.originalInput.includes(',') ||
                          (action as any).isMultiItemSequential;
      
      let enhancedOptions = [...disambiguationOptions];
      
      if (isFromRecipe) {
        enhancedOptions.push({
          id: 'skip_item',
          displayName: `"${action.itemName}" überspringen`,
          type: 'skip' as const,
          confidence: 1.0,
          icon: '⏭️'
        });
        console.log('🍳 Added skip option for recipe/multi-item processing');
      }
      
      return {
        success: true,
        message: this.aiResponse.getDisambiguationMessage(action.itemName),
        needsUserInput: true,
        disambiguationOptions: enhancedOptions,
        pendingAction: action
      };
    }

    // No existing items found - create new article directly
    console.log('🎯 No existing options, creating new article');
    return await this.executeActionWithNewArticle(action);
  }

  /**
   * Handle basic item addition
   */
  private async handleItemAdditionBasic(input: string, quantityExtraction: any): Promise<AIExecutionResult> {
    console.log('🔍 HANDLING BASIC ITEM ADDITION:', input);
    console.log('🔍 Quantity extraction:', quantityExtraction);
    
    const lowerInput = input.toLowerCase();
    
    // Parse add patterns from original input to preserve case
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
      extractedQuantity: quantityExtraction.quantity,
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
   * Execute action with new article
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
              isChecked: false,
              amount: action.extractedQuantity || ''
            } 
          }
        };

        console.log('🎯 List data:', listData);

        const newList = await this.dataService.createList(listData).toPromise();

        console.log('🎯 Created list:', newList);

        // Set conversation context
        if (newList) {
          this.setConversationContext({
            lastAction: {
              type: 'list_created',
              listId: newList.id,
              listName: newList.name,
              articleName: '',
              timestamp: new Date()
            },
            waitingForArticles: {
              listId: newList.id,
              listName: newList.name,
              prompt: 'Möchtest du Artikel hinzufügen?'
            }
          });

          const followUpPrompt = 'Möchtest du jetzt weitere Artikel hinzufügen?';

          return {
            success: true,
            message: `✅ Liste "${newList.name}" wurde mit "${newArticle.name}" erstellt.`,
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
   * Execute action with new article to specific list with conversation context
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
            console.log('✅ Successfully added article to list');
            
            // CRITICAL: Set conversation context for follow-up
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
          
            const followUpPrompt = 'Möchtest du noch weitere Artikel hinzufügen? Du kannst auch "und [Artikel]" oder "weiters [Artikel]" sagen.';
            
            return {
              success: true,
              message: `✅ "${newArticle.name}" wurde zu "${targetList.name}" hinzugefügt.`,
              listId: targetList.id,
              conversationContext: this.getConversationContext(),
              followUpPrompt
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
   * Find list by name (case-insensitive matching)
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

  // ========================================
  // NEW: CONTINUATION HELPER METHODS
  // ========================================

  /**
   * Get continuation help message
   */
  getContinuationHelp(): string {
    return '🔄 **Fortsetzungs-Funktionen:**\n\n' +
           '**Verfügbare Schlüsselwörter:**\n' +
           '• "und [Artikel]" - Fügt zur zuletzt verwendeten Liste hinzu\n' +
           '• "weiters [Artikel]" - Österreichische Variante\n' +
           '• "außerdem [Artikel]" - Alternative\n' +
           '• "zusätzlich [Artikel]" - Weitere Alternative\n' +
           '• "noch [Artikel]" - Kurze Variante\n\n' +
           '**Beispiel-Ablauf:**\n' +
           '1. "Füge Milch zu Spar hinzu"\n' +
           '2. "Und Brot"\n' +
           '3. "Weiters 2kg Bananen"\n' +
           '4. "Noch Käse"\n\n' +
           '**Hinweise:**\n' +
           '• Funktioniert nur nach dem Hinzufügen von Artikeln\n' +
           '• Zeitlimit: 10 Minuten nach letzter Aktion\n' +
           '• Mengen werden unterstützt: "und 2kg Bananen"\n' +
           '• Mehrere Artikel: "und Brot, Käse, Milch"';
  }

  /**
   * Check if in continuation mode
   */
  isInContinuationMode(): boolean {
    return !!(this.conversationContext.lastAction && 
              Date.now() - this.conversationContext.lastAction.timestamp.getTime() < 10 * 60 * 1000);
  }

  /**
   * Get continuation status
   */
  getContinuationStatus(): string {
    if (!this.conversationContext.lastAction) {
      return 'Keine letzte Aktion verfügbar';
    }
    
    const timeSince = Date.now() - this.conversationContext.lastAction.timestamp.getTime();
    const minutes = Math.floor(timeSince / 60000);
    
    if (minutes > 10) {
      return 'Fortsetzung abgelaufen (>10min)';
    }
    
    return `Letzte Aktion: "${this.conversationContext.lastAction.listName}" vor ${minutes}min`;
  }
}