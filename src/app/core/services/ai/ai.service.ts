// src/app/core/services/ai/ai.service.ts - FIXED VERSION
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
import { SmartSuggestionsService } from './smart-suggestions.service';


@Injectable({
  providedIn: 'root'
})
export class AIService {
  private readonly GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
  private conversationContext: ConversationContext = {};

  constructor(
    private quantityExtraction: QuantityExtractionService,
    private commandParser: CommandParserService,
    private disambiguation: DisambiguationService,
    public aiResponse: AIResponseService,
    private dataService: DataService,
    private smartSuggestions: SmartSuggestionsService
  ) {
    this.logApiKeyStatus();
    this.ensureRequiredMethods();
  }

  // ========================================
  // ENSURE REQUIRED METHODS - FIXED
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
        const colorMap: any = {
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

    // Ensure aiResponse has required methods
    this.ensureAIResponseMethods();
  }

  private ensureAIResponseMethods(): void {
    if (!this.aiResponse.getDisambiguationMessage) {
      this.aiResponse.getDisambiguationMessage = (itemName: string) => {
        return `Für "${itemName}" habe ich ähnliche Artikel gefunden. Welchen möchtest du verwenden?`;
      };
    }
    
    if (!this.aiResponse.getNoListsFoundMessage) {
      this.aiResponse.getNoListsFoundMessage = () => {
        return '❌ Keine Listen gefunden! Erstelle zuerst eine Liste mit "Erstelle Liste [Name]"';
      };
    }
    
    if (!this.aiResponse.getListSelectionMessage) {
      this.aiResponse.getListSelectionMessage = (itemName: string, quantity?: string) => {
        const quantityText = quantity ? ` (${quantity})` : '';
        return `Zu welcher Liste soll "${itemName}${quantityText}" hinzugefügt werden?`;
      };
    }
    
    if (!this.aiResponse.getEnhancedHelpMessage) {
      this.aiResponse.getEnhancedHelpMessage = (hasApiKey: boolean) => {
        if (hasApiKey) {
          return '🤖 <strong>ShopLisl AI Assistent</strong><br><br>' +
            '✅ <strong>Verfügbare Befehle:</strong><br>' +
            '• "Füge [Artikel] hinzu"<br>' +
            '• "Erstelle Liste [Name]"<br>' +
            '• "Rezept: [Zutatenliste]"<br>' +
            '• "und [Artikel]" - Fortsetzung<br>' +
            '• "Zeige Listen"<br><br>' +
            '<strong>🔄 Beispiele:</strong><br>' +
            '• "Füge Milch hinzu"<br>' +
            '• "Erstelle Liste Spar"<br>' +
            '• "Rezept: 500g Mehl, 2 Eier"';
        } else {
          return '🤖 <strong>ShopLisl AI Assistent</strong><br><br>' +
            '⚙️ <strong>Basis-Funktionen:</strong><br>' +
            '• "Füge [Artikel] hinzu"<br>' +
            '• "Erstelle Liste [Name]"<br>' +
            '• "Zeige Listen"<br><br>' +
            '💡 <strong>Für erweiterte Features:</strong><br>' +
            '"set api key: gsk_YOUR_KEY"<br><br>' +
            '<strong>🔄 Beispiele:</strong><br>' +
            '• "Füge Milch hinzu"<br>' +
            '• "Erstelle Liste Spar"';
        }
      };
    }

    if (!this.aiResponse.getSystemStatusMessage) {
      this.aiResponse.getSystemStatusMessage = (hasApiKey: boolean) => {
        return `🔧 <strong>System Status:</strong><br><br>` +
          `• API Key: ${hasApiKey ? '✅ Konfiguriert' : '❌ Nicht gesetzt'}<br>` +
          `• Enhanced Features: ${hasApiKey ? '✅ Verfügbar' : '❌ Deaktiviert'}<br>` +
          `• Recipe Processing: ${hasApiKey ? '✅ Verfügbar' : '❌ Deaktiviert'}`;
      };
    }

    if (!this.aiResponse.getApiKeySuccessMessage) {
      this.aiResponse.getApiKeySuccessMessage = () => {
        return '✅ <strong>API Key erfolgreich gespeichert!</strong><br><br>' +
          '🎯 <strong>Erweiterte Features aktiviert:</strong><br>' +
          '• Intelligente Rezept-Verarbeitung<br>' +
          '• Verbesserte Artikel-Erkennung<br>' +
          '• Automatische Mengen-Extraktion<br><br>' +
          '💡 Teste jetzt: "Rezept: 500g Mehl, 2 Eier, 250ml Milch"';
      };
    }

    if (!this.aiResponse.getApiKeyErrorMessage) {
      this.aiResponse.getApiKeyErrorMessage = () => {
        return '❌ <strong>Ungültiger API Key!</strong><br><br>' +
          '💡 <strong>Gültiges Format:</strong><br>' +
          '• Muss mit "gsk_" beginnen<br>' +
          '• Mindestens 20 Zeichen lang<br><br>' +
          '🔗 Hole dir einen kostenlosen Key von: https://console.groq.com';
      };
    }

    if (!this.aiResponse.getApiKeyInstructions) {
      this.aiResponse.getApiKeyInstructions = (hasKey: boolean) => {
        if (hasKey) {
          return '🔑 <strong>API Key Status: Konfiguriert</strong><br><br>' +
            '✅ Erweiterte Features sind verfügbar<br><br>' +
            '💡 <strong>Neuen Key setzen:</strong><br>' +
            '"set api key: gsk_YOUR_NEW_KEY"';
        } else {
          return '🔑 <strong>Groq API Key Setup</strong><br><br>' +
            '💡 <strong>Key setzen:</strong><br>' +
            '"set api key: gsk_YOUR_KEY"<br><br>' +
            '🔗 <strong>Kostenlosen Key holen:</strong><br>' +
            'https://console.groq.com<br><br>' +
            '🎯 <strong>Aktiviert:</strong><br>' +
            '• Intelligente Rezept-Verarbeitung<br>' +
            '• Verbesserte Multi-Item Erkennung';
        }
      };
    }

    if (!this.aiResponse.getArticleAddedFollowUpPrompt) {
      this.aiResponse.getArticleAddedFollowUpPrompt = (articleName: string, listName: string) => {
        return `Möchtest du noch weitere Artikel zu "${listName}" hinzufügen?`;
      };
    }

    if (!this.aiResponse.suggestListColor) {
      this.aiResponse.suggestListColor = (listName: string) => {
        const colors = ['#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#d32f2f', '#00796b'];
        return colors[Math.floor(Math.random() * colors.length)];
      };
    }

    if (!this.aiResponse.suggestDepartment) {
      this.aiResponse.suggestDepartment = (itemName: string) => {
        const lowerName = itemName.toLowerCase();
        if (lowerName.includes('milch') || lowerName.includes('käse') || lowerName.includes('joghurt')) {
          return 'dairy';
        }
        if (lowerName.includes('brot') || lowerName.includes('nudeln') || lowerName.includes('reis')) {
          return 'bread_cereals';
        }
        if (lowerName.includes('fleisch') || lowerName.includes('wurst')) {
          return 'meat_fish';
        }
        return 'miscellaneous';
      };
    }

    if (!this.aiResponse.suggestIcon) {
      this.aiResponse.suggestIcon = (itemName: string) => {
        const lowerName = itemName.toLowerCase();
        if (lowerName.includes('milch')) return '🥛';
        if (lowerName.includes('brot')) return '🍞';
        if (lowerName.includes('ei')) return '🥚';
        if (lowerName.includes('fleisch')) return '🥩';
        if (lowerName.includes('käse')) return '🧀';
        return '📦';
      };
    }
  }

  // ========================================
  // CONTEXT MANAGEMENT - FIXED
  // ========================================

  setConversationContext(context: ConversationContext): void {
    console.log('🤖 AI Service setting conversation context:', context);
    this.conversationContext = { ...context };
  }
  
  getConversationContext(): ConversationContext {
    return { ...this.conversationContext };
  }
  
  clearConversationContext(): void {
    console.log('🤖 AI Service clearing conversation context');
    this.conversationContext = {};
  }

  // ========================================
  // ENHANCED COMMAND EXECUTION - FIXED
  // ========================================

  async executeCommand(input: string): Promise<AIExecutionResult> {
    console.log('🗣️ EXECUTING COMMAND:', input);
    console.log('🗣️ Current context:', this.conversationContext);
    console.log('🤖 DEBUG: isRecipeCommand?', this.isRecipeCommand(input));

    try {
      // FIXED: Recipe command detection and processing
      if (this.isRecipeCommand(input)) {
        console.log('🍳 Recipe command detected');
        return await this.processRecipeCommand(input);
      }
      
      // FIXED: Continuation keywords
      if (this.isContinuationKeyword(input)) {
        console.log('🗣️ Continuation keyword detected');
        return await this.handleContinuationCommand(input);
      }
      
      // Handle help/system commands
      if (input.toLowerCase().includes('api key')) {
        return this.handleApiKeyCommand(input);
      }
      
      if (input.toLowerCase().includes('hilfe') || input.toLowerCase().includes('help')) {
        this.clearConversationContext();
        return {
          success: true,
          message: this.aiResponse.getEnhancedHelpMessage(this.hasApiKey())
        };
      }
          
      if (input.toLowerCase().includes('test')) {
        return {
          success: true,
          message: this.aiResponse.getSystemStatusMessage(this.hasApiKey())
        };
      }
  
      if (input.toLowerCase().includes('zeige') && input.toLowerCase().includes('liste')) {
        this.clearConversationContext();
        return await this.handleShowListsCommand();
      }
  
      // FIXED: Handle negative responses in conversation
      if (this.isWaitingForArticles() && this.isNegativeResponse(input)) {
        console.log('🗣️ User declined to add more articles');
        this.clearConversationContext();
        return {
          success: true,
          message: '👍 Fertig! Du kannst jederzeit neue Befehle eingeben.'
        };
      }
  
      // FIXED: Handle contextual article addition
      if (this.isWaitingForArticles() && this.isSimpleArticleInput(input)) {
        console.log('🗣️ Processing simple article in context');
        return await this.handleContextualArticleAddition(input);
      }
  
      // Process new commands
      this.clearConversationContext();
      
      const hasApiKey = this.hasApiKey();
      
      if (hasApiKey) {
        return await this.processEnhancedCommand(input);
      } else {
        return await this.processBasicCommand(input);
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

  // ========================================
  // CONTINUATION COMMAND HANDLING - FIXED IMPLEMENTATION
  // ========================================

  private async handleContinuationCommand(input: string): Promise<AIExecutionResult> {
    console.log('🔄 HANDLING CONTINUATION COMMAND:', input);
    
    // Check context for last action
    const aiContext = this.getConversationContext();
    let lastAction = aiContext.lastAction;
    
    if (lastAction && lastAction.listId) {
      const timeSince = Date.now() - lastAction.timestamp.getTime();
      const maxAge = 10 * 60 * 1000; // 10 minutes
      
      if (timeSince < maxAge) {
        const lowerInput = input.toLowerCase().trim();
        let itemsText = input;
        
        // Extract items after continuation keywords
        const continuationKeywords = ['und', 'weiters', 'außerdem', 'zusätzlich', 'noch'];
        for (const keyword of continuationKeywords) {
          if (lowerInput.startsWith(keyword + ' ')) {
            itemsText = input.substring(keyword.length + 1).trim();
            break;
          } else if (lowerInput === keyword) {
            // FIXED: Set proper conversation context
            const restoredContext: ConversationContext = {
              lastAction: lastAction,
              waitingForArticles: {
                listId: lastAction.listId,
                listName: lastAction.listName,
                prompt: 'Continuation mode activated'
              }
            };
            
            this.setConversationContext(restoredContext);
            
            return {
              success: true,
              message: `Was möchtest du noch zu "${lastAction.listName}" hinzufügen?`,
              conversationContext: restoredContext
            };
          }
        }
        
        if (itemsText.trim()) {
          // FIXED: Set conversation context before processing
          const activatedContext: ConversationContext = {
            lastAction: lastAction,
            waitingForArticles: {
              listId: lastAction.listId,
              listName: lastAction.listName,
              prompt: 'Continuation mode'
            }
          };
          
          this.setConversationContext(activatedContext);
          
          // Process the items with target list context
          const enhancedInput = `Füge ${itemsText} zu ${lastAction.listName} hinzu`;
          console.log('🔄 Processing enhanced continuation command:', enhancedInput);
          
          return await this.processEnhancedCommand(enhancedInput);
        }
      }
    }
    
    return {
      success: false,
      message: '💡 Keine kürzliche Liste gefunden zum Fortsetzen.\n\nVerwende Fortsetzungs-Wörter wie "und" oder "weiters" nur nach dem Hinzufügen von Artikeln zu einer Liste.'
    };
  }

  // ========================================
  // RECIPE PROCESSING - FIXED
  // ========================================

  private async processRecipeCommand(input: string): Promise<AIExecutionResult> {
    console.log('🍳 Processing recipe command:', input.substring(0, 50));
    
    // CRITICAL: Preserve existing conversation context
    const existingContext = this.getConversationContext();
    const targetListName = existingContext.waitingForArticles?.listName;
    const targetListId = existingContext.waitingForArticles?.listId;
    
    console.log('🍳 Existing context:', { targetListName, targetListId });
    
    try {
      const recipeContent = this.extractRecipeContent(input);
      console.log('🍳 Extracted recipe content:', recipeContent);
      
      if (!recipeContent || recipeContent.length < 3) {
        return {
          success: false,
          message: '❌ Keine Zutatenliste gefunden.<br><br>💡 Beispiel:<br>"Rezept: Milch, Brot, 2kg Bananen"'
        };
      }
      
      // FIXED: Process recipe with proper multi-item handling
      let finalCommand: string;
      
      if (targetListName && targetListId) {
        console.log(`🍳 Using target list from context: ${targetListName}`);
        
        // FIXED: Always try Groq first, then fallback
        if (this.hasApiKey()) {
          console.log('🍳 Using Groq API for advanced recipe processing');
          try {
            const standardizedCommands = await this.standardizeRecipeIngredients(recipeContent, targetListName);
            
            if (!standardizedCommands || standardizedCommands.trim().length < 10) {
              throw new Error('AI returned empty result');
            }
            
            const commands = standardizedCommands
              .split('\n')
              .map(cmd => cmd.trim())
              .filter(cmd => cmd.length > 0 && cmd.includes('Füge') && cmd.includes('hinzu'));
            
            if (commands.length === 0) {
              throw new Error('No valid commands from AI');
            }
            
            const enhancedCommands = commands.map(cmd => {
              if (!cmd.includes(' zu ') && !cmd.includes(targetListName)) {
                return cmd.replace(' hinzu', ` zu ${targetListName} hinzu`);
              }
              return cmd;
            });
            
            const multiItemCommand = enhancedCommands.join(', ')
              .replace(/Füge /g, '')
              .replace(/ hinzu/g, '');
            
            finalCommand = `Füge ${multiItemCommand} hinzu`;
            console.log('🍳 Groq processed recipe successfully:', finalCommand);
            
          } catch (aiError) {
            console.error('🍳 Groq processing failed, using enhanced fallback:', aiError);
            console.log('🍳 ERROR DETAILS:', aiError); // ADD THIS
            finalCommand = `Füge ${this.parseAdvancedRecipe(recipeContent).join(', ')} hinzu`;
            console.log('🍳 FALLBACK COMMAND:', finalCommand); // ADD THIS
          }
        } else {
          console.log('🍳 No API key - using enhanced local parsing');
          finalCommand = `Füge ${this.parseAdvancedRecipe(recipeContent).join(', ')} zu ${targetListName} hinzu`;
        }
      } else {
        // No target list - process normally
        console.log('🍳 No target list in context');
        
        if (this.hasApiKey()) {
          console.log('🍳 Using Groq API for recipe processing');
          try {
            const standardizedCommands = await this.standardizeRecipeIngredients(recipeContent);
            const commands = standardizedCommands
              .split('\n')
              .map(cmd => cmd.trim())
              .filter(cmd => cmd.length > 0 && cmd.includes('Füge') && cmd.includes('hinzu'));
            
            const multiItemCommand = commands.join(', ')
              .replace(/Füge /g, '')
              .replace(/ hinzu/g, '');
            
            finalCommand = `Füge ${multiItemCommand} hinzu`;
            console.log('🍳 Groq processed recipe successfully:', finalCommand);
          } catch (aiError) {
            console.error('🍳 Groq processing failed:', aiError);
            finalCommand = `Füge ${this.parseAdvancedRecipe(recipeContent).join(', ')} hinzu`;
          }
        } else {
          console.log('🍳 No API key - using enhanced local parsing');
          finalCommand = `Füge ${this.parseAdvancedRecipe(recipeContent).join(', ')} hinzu`;
        }
      }
      
      console.log('🍳 Final recipe command:', finalCommand);
      return await this.processEnhancedCommandWithMultiItems(finalCommand);
      
    } catch (error) {
      console.error('🍳 Recipe processing error:', error);
      return {
        success: false,
        message: `❌ Rezept-Verarbeitung fehlgeschlagen.<br><br>💡 Versuche stattdessen:<br>"Füge Milch, Gurken hinzu"`
      };
    }
  }

  // ========================================
  // RECIPE PARSING HELPER - NEW
  // ========================================

  /**
 * ENHANCED: Better fallback for simple recipe inputs
 */
private parseAdvancedRecipe(recipeContent: string): string[] {
  console.log('🍳 Advanced parsing recipe:', recipeContent.substring(0, 100));
  
  // CRITICAL FIX: Handle single ingredient case first
  const trimmed = recipeContent.trim();
  
  // If it looks like a single ingredient, return it directly
  if (!trimmed.includes(',') && !trimmed.includes(';') && !trimmed.includes('\n')) {
    const singleItemMatch = trimmed.match(/^([0-9.,]+\s*[a-zA-ZäöüÄÖÜß\s]+)/);
    if (singleItemMatch) {
      const cleanSingle = singleItemMatch[1].trim();
      console.log('🍳 Detected single ingredient in fallback:', cleanSingle);
      return [cleanSingle];
    }
  }
  
  const ingredients: string[] = [];
  
  // Split by newlines first
  const lines = recipeContent.split(/\r?\n/);
  
  for (let line of lines) {
    // Skip explanatory lines
    if (line.toLowerCase().includes('da es nur') || 
        line.toLowerCase().includes('ist die ausgabe') ||
        line.toLowerCase().includes('hier ist') ||
        line.toLowerCase().includes('ich kann')) {
      continue;
    }
    
    // Check if line contains multiple items separated by comma or semicolon
    if (line.includes(',') || line.includes(';')) {
      // Split by both separators
      const items = line.split(/\s*[,;]\s*/);
      for (let item of items) {
        const processedItem = this.processRecipeItem(item);
        if (processedItem) {
          ingredients.push(processedItem);
        }
      }
    } else {
      // Handle single item lines
      const processedItem = this.processRecipeItem(line);
      if (processedItem) {
        ingredients.push(processedItem);
      }
    }
  }
  
  console.log('🍳 Advanced parsed ingredients:', ingredients);
  
  // Fallback to simple parsing if advanced fails
  if (ingredients.length === 0) {
    return this.parseSimpleIngredients(recipeContent);
  }
  
  return ingredients.length > 0 ? ingredients.slice(0, 15) : [recipeContent.trim()];
}


  /**
 * FIXED: Process individual recipe item with better cleaning and validation
 */
private processRecipeItem(item: string): string | null {
  let cleaned = item
    .replace(/^[-•◦▪▫*>]+\s*/, '') // Remove bullet points
    .replace(/^[\d\.\)]+\s*/, '')   // Remove numbered lists  
    .replace(/^>\s*/, '')           // Remove >
    .replace(/^\*+\s*/, '')         // Remove asterisks
    .replace(/\*+$/, '')            // Remove trailing asterisks
    .replace(/^-+\s*/, '')          // Remove dashes
    .replace(/\s*-+$/, '')          // Remove trailing dashes
    .replace(/^•+\s*/, '')          // Remove bullets
    .replace(/•+$/, '')             // Remove trailing bullets
    .trim();
  
  // Skip section headers and empty lines
  if (!cleaned || 
      cleaned.length < 3 ||
      cleaned.toLowerCase().includes('für den') ||
      cleaned.toLowerCase().includes('für die') ||
      cleaned.toLowerCase().includes('zum würzen') ||
      cleaned.toLowerCase().includes('zubereitung') ||
      cleaned.toLowerCase().includes('portionen') ||
      /^-{3,}/.test(cleaned)) {
    return null;
  }
  
  // Check if line contains quantity (number + optional unit) OR food keywords
  const hasQuantity = /\d+/.test(cleaned);
  const hasUnit = /\b(g|kg|ml|l|el|tl|gramm|liter|prise|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser|pck)\b/i.test(cleaned);
  const hasFoodWords = /\b(butter|zucker|mehl|ei|eier|salz|natron|milch|öl|schokolade|schoko|vanille|zimt|kakao|nüsse|mandeln|rosinen|backpulver|zwiebel|knoblauch|tomate|kartoffel|fleisch|fisch|käse|brot|nudeln|reis|bohnen|erbsen|karotte|paprika|gurke|salat|apfel|banane|orange|zitrone|petersilie|basilikum|oregano|thymian|rosmarin|pfeffer|chili|ingwer|honig|essig|wein|bier|sahne|joghurt|quark|frischkäse|mozzarella|parmesan|gouda|emmentaler|cheddar|feta|ricotta|mascarpone|pecorino|gorgonzola|camembert|brie|roquefort|stilton)\b/i.test(cleaned);
  
  // Accept if it has quantity with unit OR food keywords, or basic quantity pattern
  if ((hasQuantity && hasUnit) || hasFoodWords || /^\d+\s+[a-zA-ZäöüÄÖÜß]/.test(cleaned)) {
    return cleaned;
  }
  
  return null;
}


  private parseSimpleIngredients(recipeContent: string): string[] {
    console.log('🍳 Parsing simple ingredients:', recipeContent);
    
    // FIXED: Try comma/newline/semicolon separation first
    if (recipeContent.includes(',') || recipeContent.includes('\n') || recipeContent.includes(';')) {
      const items = recipeContent
        .split(/[,\n;]/)  // Split by comma, newline, OR semicolon
        .map(item => item.trim())
        .filter(item => item.length > 0 && !item.toLowerCase().includes('zutaten'))
        .slice(0, 15);
      
      if (items.length > 1) {
        console.log('🍳 Found comma/newline/semicolon separated items:', items);
        return items;
      }
    }
    
    // Parse space-separated ingredients with quantities
    const ingredients: string[] = [];
    const words = recipeContent.trim().split(/\s+/);
    let currentIngredient = '';
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Check if word starts with a number or contains common units
      const hasQuantity = /^\d+/.test(word) || 
                         /\d+(g|kg|ml|l|el|tl|gramm|liter|prise|stück|stk|pack|dose|flasche)$/i.test(word);
      
      if (hasQuantity && currentIngredient) {
        // Start of new ingredient - save previous one
        ingredients.push(currentIngredient.trim());
        currentIngredient = word;
      } else {
        // Continue current ingredient
        currentIngredient += (currentIngredient ? ' ' : '') + word;
      }
    }
    
    // Add the last ingredient
    if (currentIngredient) {
      ingredients.push(currentIngredient.trim());
    }
    
    // Filter out empty and invalid items
    const validIngredients = ingredients
      .filter(item => item.length > 0 && !item.toLowerCase().includes('zutaten'))
      .slice(0, 15);
    
    console.log('🍳 Parsed ingredients:', validIngredients);
    
    // Fallback: if parsing failed, return original as single item
    if (validIngredients.length === 0) {
      return [recipeContent.trim()];
    }
    
    return validIngredients;
  }



  // ========================================
  // MULTI-ITEM PROCESSING - FIXED
  // ========================================

  private async processEnhancedCommandWithMultiItems(input: string): Promise<AIExecutionResult> {
    console.log('🎯 PROCESSING ENHANCED COMMAND WITH MULTI-ITEMS:', input);
    
    const multiItemResult = this.quantityExtraction.parseMultipleItems(input);
    
    if (multiItemResult.command === 'unrecognized' || multiItemResult.items.length === 0) {
      console.log('🎯 No multi-items found, using single item processing');
      return this.processEnhancedCommand(input);
    }

    console.log('🎯 PROCESSING MULTI-ITEM COMMAND:', {
      command: multiItemResult.command,
      itemCount: multiItemResult.items.length,
      listName: multiItemResult.listName,
      items: multiItemResult.items
    });

    // CRITICAL FIX: Preserve conversation context for target list
    const existingContext = this.getConversationContext();
    let targetListName = multiItemResult.listName;
    let targetListId = null;

    // If no list specified but we have conversation context, use it
    if (!targetListName && existingContext.waitingForArticles) {
      targetListName = existingContext.waitingForArticles.listName;
      targetListId = existingContext.waitingForArticles.listId;
      console.log('🎯 Using target list from context:', targetListName);
    }

    const multiAction: MultiItemPendingAction = {
      type: multiItemResult.command === 'create_list_with_items' ? 'create_list_with_multiple_items' : 'add_multiple_items',
      originalInput: input,
      itemName: multiItemResult.items[0]?.itemName || '',
      extractedQuantity: multiItemResult.items[0]?.quantity || '',
      items: multiItemResult.items,
      listName: targetListName,
      currentItemIndex: 0,
      processedItems: [],
      suggestedDepartment: this.disambiguation.suggestDepartment(multiItemResult.items[0]?.itemName || ''),
      conversationListId: targetListId || undefined
    };

    console.log('🎯 Starting multi-item processing with context:', multiAction);
    return this.disambiguation.processMultiItemSequentially(multiAction);
  }

  // ========================================
  // ENHANCED COMMAND PROCESSING - FIXED
  // ========================================

  private async processEnhancedCommand(input: string): Promise<AIExecutionResult> {
    console.log('🎯 PROCESSING ENHANCED COMMAND:', input);
    
    // Check for comma-separated items first
    if (this.quantityExtraction.hasMultipleItems(input)) {
      console.log('🎯 Detected comma-separated items, using multi-item processing');
      return this.processEnhancedCommandWithMultiItems(input);
    }
    
    // Extract quantity from input
    const quantityExtraction = this.quantityExtraction.extractQuantity(input);
    console.log('🎯 Quantity extraction result:', quantityExtraction);
  
    // Parse command intent
    const intent = this.commandParser.parseIntent(input, quantityExtraction.itemName);
    console.log('🎯 Parsed intent:', intent);
  
    // Check for unrecognized commands
    if (intent.itemName === 'UNRECOGNIZED_COMMAND' || 
        (intent as any).confidence !== undefined && (intent as any).confidence < 0.5) {
      console.log('🎯 Unrecognized or low confidence command, providing guidance');
      return {
        success: false,
        message: `❌ Unbekannter Befehl: "${input}"<br><br>💡 Sage "Hilfe" für verfügbare Befehle`
      };
    }
  
    // Handle create list commands
    if (intent.type === 'create_list') {
      console.log('🎯 Processing create list command');
      return await this.handleListCreationWithColor(input, quantityExtraction);
    }
  
    // Handle add item commands
    if (intent.type === 'add_item') {
      console.log('🎯 Processing add item command');
      
      // CRITICAL FIX: Check conversation context for target list
      const conversationContext = this.getConversationContext();
      let targetListName = intent.listName;
      let targetListId: string | undefined;
      
      // If no explicit list in command but we have conversation context, use it
      if (!targetListName && conversationContext.waitingForArticles) {
        targetListName = conversationContext.waitingForArticles.listName;
        targetListId = conversationContext.waitingForArticles.listId;
        console.log('🎯 Using target list from conversation context:', targetListName, targetListId);
      }
      
      const pendingAction: PendingAction = {
        type: intent.type,
        originalInput: input,
        itemName: quantityExtraction.itemName,
        extractedQuantity: quantityExtraction.quantity,
        listName: targetListName, // FIXED: Now includes conversation context list
        suggestedDepartment: this.disambiguation.suggestDepartment(quantityExtraction.itemName)
      };
  
      // CRITICAL FIX: Store conversation list ID in pending action for disambiguation service
      if (targetListId) {
        (pendingAction as any).conversationListId = targetListId;
      }
  
      console.log('🎯 Created pending action with conversation context:', pendingAction);
  
      return await this.handleItemActionWithDisambiguation(pendingAction);
    }
  
    // Fallback to basic processing
    return this.processBasicCommand(input);
  }

  private async processBasicCommand(input: string): Promise<AIExecutionResult> {
    console.log('🤖 PROCESSING BASIC COMMAND:', input);
    
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
      message: `❌ Unbekannter Befehl: "${originalInput}"<br><br>💡 Sage "Hilfe" für verfügbare Befehle${!this.hasApiKey() ? '<br>🔑 Groq API Key nicht gesetzt' : ''}`
    };
  }

  // ========================================
  // CONTEXTUAL PROCESSING - FIXED
  // ========================================

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
    
    // FIXED: Check for multiple items with proper context preservation
    if (input.includes(',')) {
      console.log('🗣️ Multiple items detected in contextual mode');
      const enhancedInput = `Füge ${input} zu ${listName} hinzu`;
      
      // CRITICAL: Preserve context before processing
      const contextToPreserve = { ...this.conversationContext };
      const result = await this.processEnhancedCommandWithMultiItems(enhancedInput);
      
      // CRITICAL: Restore context if it was lost
      if (result.success && !result.conversationContext) {
        console.log('🗣️ Preserving conversation context after disambiguation');
        result.conversationContext = contextToPreserve;
        result.followUpPrompt = `Möchtest du noch weitere Artikel zu "${listName}" hinzufügen?`;
      }
      
      return result;
    }
    
    // Handle single item
    const quantityExtraction = this.quantityExtraction.extractQuantity(input);
    console.log('🗣️ Single item extraction:', quantityExtraction);
    
    const disambiguationOptions = await this.disambiguation.getDisambiguationOptions(quantityExtraction.itemName);
    const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');
    
    if (existingOptions.length > 0) {
      // Show disambiguation with skip option
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
      
      const pendingAction: PendingAction = {
        type: 'add_item',
        originalInput: input,
        itemName: quantityExtraction.itemName,
        extractedQuantity: quantityExtraction.quantity,
        listName: listName,
        suggestedDepartment: this.disambiguation.suggestDepartment(quantityExtraction.itemName)
      };
      
      return {
        success: true,
        message: this.aiResponse.getDisambiguationMessage(quantityExtraction.itemName),
        needsUserInput: true,
        disambiguationOptions: enhancedOptions,
        pendingAction: pendingAction
      };
    }
    
    // No disambiguation needed - create article directly
    return await this.createArticleInConversationContext(quantityExtraction, listId, listName);
  }

  // ========================================
  // HELPER METHODS - FIXED
  // ========================================

  private isRecipeCommand(input: string): boolean {
    const normalizedInput = input.toLowerCase().trim();
    
    // FIXED: Check first line only for recipe keywords
    const firstLine = normalizedInput.split(/\r?\n/)[0].trim();
    
    const recipeKeywords = [
      'rezept:', 'rezept', 'zutaten:', 'zutaten',
      'ingredienzien:', 'ingredienzien', 'ingredients:',
      'einkaufsliste aus rezept'
    ];
    
    // FIXED: Check if first line starts with or equals recipe keywords
    const isRecipeDetected = recipeKeywords.some(keyword => {
      if (keyword.endsWith(':')) {
        return firstLine.startsWith(keyword);
      } else {
        // For keywords without colon, check if first line starts with keyword followed by space/end
        return firstLine === keyword || firstLine.startsWith(keyword + ' ');
      }
    });
    
    console.log('🍳 Recipe detection:', { 
      firstLine, 
      normalizedInput: normalizedInput.substring(0, 50), 
      detected: isRecipeDetected 
    });
    
    return isRecipeDetected;
  }

  private extractRecipeContent(input: string): string {
    const lines = input.split(/\r?\n/);
    const firstLine = lines[0].toLowerCase().trim();
    
    const keywords = ['rezept:', 'rezept', 'zutaten:', 'zutaten', 'ingredienzien:', 'ingredienzien', 'ingredients:'];
    
    for (const keyword of keywords) {
      if (keyword.endsWith(':')) {
        // For keywords with colon, find the colon position
        const colonIndex = firstLine.indexOf(keyword);
        if (colonIndex !== -1) {
          // Extract everything after the colon from the first line + all subsequent lines
          const afterColon = lines[0].substring(colonIndex + keyword.length).trim();
          const remainingLines = lines.slice(1);
          
          if (afterColon) {
            return [afterColon, ...remainingLines].join('\n').trim();
          } else {
            return remainingLines.join('\n').trim();
          }
        }
      } else {
        // For keywords without colon
        if (firstLine === keyword || firstLine.startsWith(keyword + ' ')) {
          if (firstLine === keyword) {
            // "Rezept" is on its own line, content starts from next line
            return lines.slice(1).join('\n').trim();
          } else {
            // "Rezept [content]" - extract content after keyword
            const afterKeyword = lines[0].substring(keyword.length).trim();
            const remainingLines = lines.slice(1);
            
            if (afterKeyword) {
              return [afterKeyword, ...remainingLines].join('\n').trim();
            } else {
              return remainingLines.join('\n').trim();
            }
          }
        }
      }
    }
    
    // Fallback: return everything if no keyword found
    return input.trim();
  }

  private isContinuationKeyword(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    const continuationKeywords = ['und', 'weiters', 'außerdem', 'zusätzlich', 'noch', 'dann', 'danach'];
    
    return continuationKeywords.some(keyword => 
      lowerInput.startsWith(keyword + ' ') || 
      lowerInput === keyword
    );
  }

  private isWaitingForArticles(): boolean {
    return !!this.conversationContext.waitingForArticles;
  }

  private isSimpleArticleInput(input: string): boolean {
    const trimmedInput = input.trim().toLowerCase();
    
    if (trimmedInput.includes('füge') || 
        trimmedInput.includes('erstelle') || 
        trimmedInput.includes('hinzu') || 
        trimmedInput.includes('liste') ||
        trimmedInput.includes('zeige')) {
      return false;
    }
    
    if (this.isNegativeResponse(trimmedInput)) {
      return false;
    }
    
    return trimmedInput.length > 0 && 
           trimmedInput.length < 100 && 
           !trimmedInput.includes('http') &&
           !trimmedInput.includes('www.');
  }

  private isNegativeResponse(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    const negativeWords = ['nein', 'no', 'nicht', 'stop', 'stopp', 'abbrechen', 'fertig', 'genug', 'ende', 'schluss'];
    
    return negativeWords.some(word => 
      lowerInput === word || 
      lowerInput.startsWith(word + ' ') ||
      lowerInput.startsWith(word + ',') ||
      lowerInput.startsWith(word + '.')
    );
  }

  // ========================================
  // API KEY MANAGEMENT
  // ========================================

  private getSecureApiKey(): string {
    const localStorageKey = localStorage.getItem('groq-api-key');
    const environmentKey = environment?.groqApiKey;
    const key = localStorageKey || environmentKey || '';
    console.log('🔑 API Key source:', localStorageKey ? 'localStorage' : environmentKey ? 'environment' : 'none');
    return key;
  }

  setApiKey(apiKey: string): void {
    if (apiKey && apiKey.trim()) {
      localStorage.setItem('groq-api-key', apiKey.trim());
      console.log('🔑 API key saved to localStorage');
      this.logApiKeyStatus();
    }
  }

  hasApiKey(): boolean {
    const key = this.getSecureApiKey();
    console.log('🔑 Checking API key:', key ? `Found ${key.length} chars` : 'Not found');
    return !!key && key.length > 20;
  }

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

  private logApiKeyStatus(): void {
    const status = this.getApiKeyStatus();
    console.log('🔑 API Key Status:', status);
  }

  // ========================================
  // DISAMBIGUATION HANDLING - FIXED
  // ========================================

  async handleDisambiguationChoice(
    pendingAction: PendingAction | MultiItemPendingAction,
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('🎯 Handling disambiguation choice with conversation context');
    console.log('🎯 Pending action:', pendingAction);
    console.log('🎯 Selected option:', selectedOption);
    
    // FIXED: Preserve conversation context during regular disambiguation
    const existingContext = this.getConversationContext();
    const result = await this.disambiguation.handleDisambiguationChoice(pendingAction, selectedOption);
    
    // CRITICAL: Restore and enhance context after successful addition
    if (result.success && result.listId && result.message.includes('hinzugefügt')) {
      const messageMatch = result.message.match(/"([^"]+)" wurde (?:erstellt und )?zur Liste "([^"]+)" hinzugefügt/);
      const articleName = messageMatch ? messageMatch[1] : pendingAction.itemName;
      const listName = messageMatch ? messageMatch[2] : (pendingAction.listName || 'Unbekannt');
      
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
      result.followUpPrompt = 'Du kannst direkt weitere Artikel zur letzt gewählten Liste hinzufügen (zB "Käse, Tomaten"). Wenn du damit fertig bist, kannst du rechts unten den ✅-Button klicken.';
    }
    
    return result;
  }

  // ========================================
  // ADDITIONAL IMPLEMENTATIONS
  // ========================================

  private async standardizeRecipeIngredients(rawRecipeText: string, targetList?: string): Promise<string> {
    console.log('🍳 Standardizing recipe ingredients with AI:', rawRecipeText.substring(0, 100));
    
    const cleanedText = this.cleanRawRecipeText(rawRecipeText);
    
    const prompt = `Konvertiere diese deutsche Zutatenliste in ein standardisiertes Format.
  
  EINGABE: ${cleanedText}
  
  REGELN:
  - Nur echte Zutaten mit Mengen extrahieren
  - Format: "MENGE EINHEIT ZUTAT" (z.B. "2 EL Öl", nicht "Öl 2 EL")
  - Deutsche Dezimalzahlen: 0,3 nicht 0.3
  - Deutsche Einheiten: g, kg, ml, l, EL, TL, Prise, Stück
  - Behalte Kommas in Dezimalzahlen: "0,3 TL Natron"
  - WICHTIG: Gib ALLE Zutaten in EINER Zeile aus, getrennt durch Semikolon
  
  BEISPIELE:
  "Öl 2 EL" → "2 EL Öl"
  "Natron 0,3 TL" → "0,3 TL Natron"
  "Mehl 500g" → "500g Mehl"
  
  AUSGABEFORMAT: Alle Zutaten in einer Zeile mit Semikolon getrennt:
  "0,5kg Mehl; 2 Eier; 250ml Milch; 0,3 TL Öl"
  
  ANTWORTE NUR mit einer Zeile im oben gezeigten Format:`;
  
    try {
      const response = await this.callGroqAPI(prompt);
      let cleanResponse = this.extractIngredientsFromAIResponse(response);
      
      console.log('🍳 AI raw response:', response.substring(0, 200));
      console.log('🍳 Extracted ingredients:', cleanResponse);
      
      if (!cleanResponse || cleanResponse.length < 5) {
        throw new Error('Invalid AI response');
      }
      
      const finalCommand = `Füge ${cleanResponse} hinzu`;
      console.log('🍳 Final standardized command:', finalCommand);
      return finalCommand;
      
    } catch (error) {
      console.error('🍳 AI standardization failed:', error);
      // Use enhanced fallback
      const fallbackItems = this.parseAdvancedRecipe(rawRecipeText);
      return `Füge ${fallbackItems.join('; ')} hinzu`;
    }
  }

  /**
   * Enhanced fallback parser that handles "item quantity" patterns like "Öl 2 EL"
   */
  private parseAdvancedRecipeWithAI(recipeContent: string): string[] {
    console.log('🍳 Enhanced fallback parsing:', recipeContent.substring(0, 100));
    
    const ingredients: string[] = [];
    const items = recipeContent.split(/[,\n;]/);
    
    for (let item of items) {
      let cleaned = item
        .replace(/^[-•◦▪▫*>]+\s*/, '')
        .replace(/^[\d\.\)]+\s*/, '')
        .trim();
      
      if (!cleaned || cleaned.length < 2) continue;
      
      // Handle "item quantity unit" pattern: "Öl 2 EL" → "2 EL Öl"
      const itemQuantityMatch = cleaned.match(/^([a-zA-ZäöüÄÖÜß\s]+?)\s+(\d+(?:[.,]\d+)?)\s*(EL|TL|g|kg|ml|l|Prise|Stück|Dose|Pack)?$/i);
      if (itemQuantityMatch) {
        const itemName = itemQuantityMatch[1].trim();
        const quantity = itemQuantityMatch[2];
        const unit = itemQuantityMatch[3] || 'Stück';
        const standardized = `${quantity} ${unit} ${itemName}`;
        ingredients.push(standardized);
        console.log('🍳 Converted:', cleaned, '→', standardized);
        continue;
      }
      
      // Already in correct format or simple item
      ingredients.push(cleaned);
    }
    
    console.log('🍳 Enhanced fallback result:', ingredients);
    return ingredients.slice(0, 15);
  }


  /**
 * FIXED: Extract just the ingredients list from AI response that might contain explanations
 */
private extractIngredientsFromAIResponse(response: string): string {
  console.log('🍳 Extracting ingredients from AI response');
  console.log('🍳 Raw AI response:', response);
  
  // CRITICAL FIX: Handle single ingredient responses with explanations
  const singleItemPattern = /^([0-9.,]+\s*[a-zA-ZäöüÄÖÜß\s]+)(?:\s*→.*|\s*\n|\s*Da es nur|\s*ist die Ausgabe|$)/i;
  const singleMatch = response.match(singleItemPattern);
  
  if (singleMatch) {
    const cleanSingle = singleMatch[1].trim();
    console.log('🍳 Detected single ingredient:', cleanSingle);
    
    // Verify it looks like a real ingredient (has number + unit/food word)
    if (/\d+/.test(cleanSingle) && 
        (/\b(g|kg|ml|l|el|tl|gramm|liter|prise|stück|flaschen|pack|dose)\b/i.test(cleanSingle) ||
         /\b(milch|öl|mehl|ei|zucker|salz|butter|sekt|wein|bier)\b/i.test(cleanSingle))) {
      return cleanSingle;
    }
  }
  
  // Look for clean semicolon-separated list (multiple ingredients)
  const multiItemPattern = /^([^→\n]*(?:[0-9.,]+\s*[a-zA-ZäöüÄÖÜß\s]+\s*;\s*){1,}[0-9.,]+\s*[a-zA-ZäöüÄÖÜß\s]+[^→\n]*)/m;
  const multiMatch = response.match(multiItemPattern);
  
  if (multiMatch) {
    const cleanMulti = multiMatch[1]
      .replace(/[""]/g, '') // Remove quotes
      .replace(/\s*→.*$/gm, '') // Remove everything after →
      .replace(/^\s*-\s*/, '') // Remove leading dash
      .trim();
    
    if (cleanMulti.includes(';') && cleanMulti.length > 10) {
      console.log('🍳 Found clean semicolon list:', cleanMulti);
      return cleanMulti;
    }
  }
  
  // CRITICAL FIX: Clean common corruption patterns
  let cleaned = response
    .replace(/→.*$/gm, '') // Remove everything after →
    .replace(/\n.*?Da es nur.*$/gmi, '') // Remove "Da es nur eine Zutat gibt" and everything after
    .replace(/\n.*?ist die Ausgabe.*$/gmi, '') // Remove "ist die Ausgabe" and everything after
    .replace(/\n.*?hier ist.*$/gmi, '') // Remove "hier ist" explanations
    .replace(/\n.*?ich kann.*$/gmi, '') // Remove "ich kann" explanations
    .replace(/\n.*?konvertiert.*$/gmi, '') // Remove conversion explanations
    .replace(/\n{2,}/g, ' ') // Replace multiple newlines with space
    .replace(/\s{2,}/g, ' ') // Replace multiple spaces with single space
    .trim();
  
  console.log('🍳 Cleaned response:', cleaned);
  
  // Try to extract just the ingredient part again
  const finalPattern = /^([0-9.,]+\s*[a-zA-ZäöüÄÖÜß\s]+?)(?:\s|$)/;
  const finalMatch = cleaned.match(finalPattern);
  
  if (finalMatch) {
    const finalClean = finalMatch[1].trim();
    console.log('🍳 Final extracted ingredient:', finalClean);
    return finalClean;
  }
  
  // Ultimate fallback - return first meaningful part
  const firstLine = cleaned.split('\n')[0].trim();
  if (firstLine.length > 0 && /\d+/.test(firstLine)) {
    console.log('🍳 Fallback to first line:', firstLine);
    return firstLine;
  }
  
  console.log('🍳 Could not extract clean ingredients, returning original');
  return response.trim();
}


  private cleanRawRecipeText(rawText: string): string {
    return rawText
      .replace(/\s+/g, ' ')
      .replace(/[•◦▪▫]/g, '')
      .replace(/[-–—]{2,}/g, '')
      .replace(/[*]{2,}/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private async callGroqAPI(prompt: string): Promise<string> {
    const apiKey = this.getSecureApiKey();
    
    const requestBody = {
      model: 'llama-3.1-8b-instant', // FIXED: Updated to current model
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 2000
    };
    
    console.log('🔑 API Request Body:', JSON.stringify(requestBody, null, 2));
    
    try {
      const response = await fetch(this.GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
  
      console.log('🔑 API Response Status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('🔑 API Error Response:', errorText);
        throw new Error(`Groq API Fehler: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '';
      
    } catch (error) {
      console.error('🍳 Groq API call failed:', error);
      throw error;
    }
  }

  private handleApiKeyCommand(input: string): AIExecutionResult {
    const lowerInput = input.toLowerCase();
    
    const keyPattern = /(?:set\s+)?api\s+key[:\s]+([a-zA-Z0-9_-]+)/i;
    const match = input.match(keyPattern);
    
    if (match && match[1]) {
      const apiKey = match[1].trim();
      
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
    
    const hasKey = this.hasApiKey();
    return {
      success: true,
      message: this.aiResponse.getApiKeyInstructions(hasKey)
    };
  }

  private async handleShowListsCommand(): Promise<AIExecutionResult> {
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

  private async createArticleInConversationContext(
    quantityExtraction: any, 
    listId: string, 
    listName: string
  ): Promise<AIExecutionResult> {
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
          } else {
            return {
              success: false,
              message: `❌ Fehler beim Aktualisieren der Liste "${targetList.name}".`
            };
          }
        } else {
          return {
            success: false,
            message: `❌ Liste mit ID "${listId}" nicht gefunden.`
          };
        }
      } else {
        return {
          success: false,
          message: `❌ Fehler beim Erstellen des Artikels "${quantityExtraction.itemName}".`
        };
      }
      
    } catch (error) {
      console.error('Error creating article in conversation context:', error);
      return {
        success: false,
        message: '❌ Fehler beim Hinzufügen des Artikels.'
      };
    }
  }

  private async getSmartSuggestions(itemName: string): Promise<{
    departmentId: string;
    icon: string;
  } | null> {
    if (!this.hasApiKey()) {
      return null;
    }
  
    try {
      const articles = await this.dataService.getArticles().pipe(take(1)).toPromise();
      const iconCounts = new Map<string, number>();
      
      articles?.forEach(article => {
        if (article.icon) iconCounts.set(article.icon, (iconCounts.get(article.icon) || 0) + 1);
      });
  
      const topIcons = Array.from(iconCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([icon]) => icon)
        .join(' ');
  
      const prompt = `Item: "${itemName}"
  Departments: fruit-vegetables, dairy-products, bread, meat-fish, beverages-alcohol, household-goods, miscellaneous
  User icons: ${topIcons || '🥛🍞🧀🍎🥩'}
  Format: {"dept":"beverages-alcohol","icon":"🍺"}`;
  
      console.log('🎯🤖 Getting AI suggestions for:', itemName);
      const response = await this.callGroqAPI(prompt);
      const result = JSON.parse(response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      
      if (result.dept && result.icon) {
        console.log('✅🤖 AI suggestions:', result);
        return { departmentId: result.dept, icon: result.icon };
      }
      
      return null;
    } catch (error) {
      console.error('🎯❌ AI suggestions failed:', error);
      return null;
    }
  }

  private async findListById(listId: string): Promise<ShoppingList | null> {
    try {
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      return lists?.find(list => list.id === listId) || null;
    } catch (error) {
      console.error('Error finding list by ID:', error);
      return null;
    }
  }

  private async handleListCreationWithColor(input: string, quantityExtraction: any): Promise<AIExecutionResult> {
    console.log('🎨 HANDLING LIST CREATION WITH COLOR:', input);
    
    // Extract color first
    const colorExtraction = this.commandParser.extractColor(input);
    console.log('🎨 COLOR EXTRACTION:', colorExtraction);
    
    const cleanInput = colorExtraction.cleanInput;
    
    // Parse list creation
    const createMatch = cleanInput.match(/erstelle\s+liste\s+(.+?)(?:\s+mit\s+(.+))?$/i);
    
    if (!createMatch) {
      return {
        success: false,
        message: '❌ Unverständlicher Liste-Befehl.\n\n💡 Beispiele:\n• "Erstelle Liste Spar"\n• "Erstelle Liste REWE in rot"'
      };
    }
    
    const listName = createMatch[1].trim();
    const itemName = createMatch[2]?.trim();
    
    try {
      const listColor = colorExtraction.colorHex || this.aiResponse.suggestListColor(listName);
      
      const listToCreate = {
        name: listName,
        color: listColor,
        icon: '🛒',
        articleIds: [] as string[],
        itemStates: {} as any
      };
      
      // Create article if specified
      if (itemName) {
        const articleData = {
          name: itemName,
          amount: quantityExtraction.quantity || '',
          departmentId: this.aiResponse.suggestDepartment(itemName),
          icon: this.aiResponse.suggestIcon(itemName)
        };
        
        const newArticle = await this.dataService.createArticle(articleData).toPromise();
        
        if (newArticle) {
          listToCreate.articleIds.push(newArticle.id);
          listToCreate.itemStates[newArticle.id] = {
            articleId: newArticle.id,
            isChecked: false,
            amount: quantityExtraction.quantity || ''
          };
        }
      }
      
      const newList = await this.dataService.createList(listToCreate).toPromise();
      
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
        
        const message = itemName 
          ? `✅ Liste "${newList.name}" wurde mit "${itemName}" erstellt.`
          : `✅ Liste "${newList.name}" wurde erstellt.`;
        
        return {
          success: true,
          message: message,
          listId: newList.id,
          conversationContext: this.getConversationContext(),
          followUpPrompt: 'Möchtest du jetzt Artikel hinzufügen?'
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

  private async handleItemActionWithDisambiguation(action: PendingAction): Promise<AIExecutionResult> {
    console.log('🎯 Handling item action with disambiguation:', action);

    // Get disambiguation options
    const disambiguationOptions = await this.disambiguation.getDisambiguationOptions(action.itemName);
    console.log('🎯 Disambiguation options:', disambiguationOptions.length);

    const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');
    
    if (existingOptions.length > 0) {
      console.log('🎯 Found existing options, showing disambiguation');
      
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
    console.log('🎯 No existing options, creating new article');
    return await this.executeActionWithNewArticle(action);
  }

  private async handleItemAdditionBasic(input: string, quantityExtraction: any): Promise<AIExecutionResult> {
    console.log('🔍 HANDLING BASIC ITEM ADDITION:', input);
    
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
      suggestedDepartment: this.disambiguation.suggestDepartment(quantityExtraction.itemName)

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

  private async executeActionWithNewArticle(action: PendingAction): Promise<AIExecutionResult> {
    console.log('🎯 Executing action with new article:', action.itemName);
    
    try {
      if (action.type === 'create_list') {
        const articleData = {
          name: action.itemName,
          amount: action.extractedQuantity || '',
          departmentId: action.suggestedDepartment || 'miscellaneous',
          icon: this.aiResponse.suggestIcon(action.itemName)
        };
        
        const newArticle = await this.dataService.createArticle(articleData).toPromise();

        if (!newArticle) {
          throw new Error('Failed to create article');
        }

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

        const newList = await this.dataService.createList(listData).toPromise();

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

          return {
            success: true,
            message: `✅ Liste "${newList.name}" wurde mit "${newArticle.name}" erstellt.`,
            listId: newList.id,
            conversationContext: this.getConversationContext(),
            followUpPrompt: 'Möchtest du jetzt weitere Artikel hinzufügen?'
          };
        }
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

    return {
      success: false,
      message: '❌ Unerwarteter Fehler.'
    };
  }

  private async executeActionWithNewArticleToList(action: PendingAction, listName: string): Promise<AIExecutionResult> {
    console.log('🎯 Executing action with new article to list:', listName);
    
    try {
      const articleData = {
        name: action.itemName,
        amount: action.extractedQuantity || '',
        departmentId: this.aiResponse.suggestDepartment(action.itemName),
        icon: this.aiResponse.suggestIcon(action.itemName)
      };

      const newArticle = await this.dataService.createArticle(articleData).toPromise();

      if (newArticle) {
        const targetList = await this.findListByName(listName);

        if (targetList) {
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
            // Set conversation context for follow-up
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
          
            return {
              success: true,
              message: `✅ "${newArticle.name}" wurde zu "${targetList.name}" hinzugefügt.`,
              listId: targetList.id,
              conversationContext: this.getConversationContext(),
              followUpPrompt: 'Möchtest du noch weitere Artikel hinzufügen? Du kannst auch "und [Artikel]" oder "weiters [Artikel]" sagen.'
            };
          } else {
            return {
              success: false,
              message: `❌ Fehler beim Hinzufügen von "${newArticle.name}" zur Liste "${targetList.name}".`
            };
          }
        } else {
          return {
            success: false,
            message: `❌ Liste "${listName}" nicht gefunden.`
          };
        }
      } else {
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
  // ADDITIONAL HELPER METHODS
  // ========================================

  public async getDisambiguationOptions(itemName: string): Promise<DisambiguationOption[]> {
    return this.disambiguation.getDisambiguationOptions(itemName);
  }

  async suggestDepartment(itemName: string): Promise<string> {
    try {
      const suggestions = await this.getSmartSuggestions(itemName);
      if (suggestions?.departmentId) {
        console.log('✅🤖 AI department:', suggestions.departmentId);
        return suggestions.departmentId;
      }
    } catch (error) {
      console.log('🎯❌ AI failed, using fallback');
    }
    
    // Fallback
    const lowerName = itemName.toLowerCase();
    if (/milch|käse|joghurt/.test(lowerName)) return 'dairy-products';
    if (/brot|nudeln|reis/.test(lowerName)) return 'bread';
    if (/fleisch|wurst|fisch/.test(lowerName)) return 'meat-fish';
    if (/bier|wein|wasser|saft/.test(lowerName)) return 'beverages-alcohol';
    return 'miscellaneous';
  }
  
  async suggestIcon(itemName: string): Promise<string> {
    try {
      const suggestions = await this.getSmartSuggestions(itemName);
      if (suggestions?.icon) {
        console.log('✅🤖 AI icon:', suggestions.icon);
        return suggestions.icon;
      }
    } catch (error) {
      console.log('🎯❌ AI failed, using fallback');
    }
    
    // Fallback
    const lowerName = itemName.toLowerCase();
    if (/milch/.test(lowerName)) return '🥛';
    if (/brot/.test(lowerName)) return '🍞';
    if (/bier/.test(lowerName)) return '🍺';
    if (/käse/.test(lowerName)) return '🧀';
    return '📦';
  }
}