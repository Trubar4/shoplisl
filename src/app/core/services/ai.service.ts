// src/app/core/services/ai.service.ts - Complete Enhanced Version
import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, combineLatest, of } from 'rxjs';
import { map, take, catchError } from 'rxjs/operators';
import { DataService } from './data';
import { Article, ShoppingList } from '../models';
import { environment } from '../../../environments/environment';

// Enhanced interfaces for disambiguation
export interface DisambiguationOption {
  id: string;
  displayName: string;
  type: 'new' | 'existing';
  article?: Article;
  confidence: number;
  department?: string;
  icon?: string;
}

export interface PendingAction {
  type: 'add_item' | 'create_list' | 'select_list';
  originalInput: string;
  itemName: string;
  extractedQuantity?: string;
  listName?: string;
  suggestedDepartment?: string;
  articleToAdd?: {
    id?: string;
    name: string;
    amount?: string;
    departmentId?: string;
    icon?: string;
  };
}

export interface QuantityExtraction {
  itemName: string;
  quantity?: string;
  unit?: string;
}

export interface ListSelectionOption {
  id: string;
  name: string;
  color: string;
  icon: string;
  itemCount: number;
}

// AI Response Types
export interface AIResponse {
  action: 'ADD_ARTICLES' | 'CREATE_LIST' | 'DISAMBIGUATE' | 'HELP' | 'ERROR';
  message: string;
  listName?: string;
  articles?: string[];
  listColor?: string;
  listIcon?: string;
  needsDisambiguation?: boolean;
  disambiguationOptions?: DisambiguationOption[];
  pendingAction?: PendingAction;
  followUpQuestion?: string;
}

export interface AIExecutionResult {
  success: boolean;
  message: string;
  listId?: string;
  needsUserInput?: boolean;
  disambiguationOptions?: DisambiguationOption[];
  pendingAction?: PendingAction;
  error?: string;
  suggestedAction?: string;
  suggestedData?: any;
}

@Injectable({
  providedIn: 'root'
})
export class AIService {
  private readonly GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
  
  // Disambiguation thresholds
  private readonly DISAMBIGUATION_THRESHOLD = 0.6;
  private readonly MIN_SIMILARITY_THRESHOLD = 0.3;
  
  // German department mappings for smart suggestions
  private readonly DEPARTMENT_KEYWORDS = {
    'bread': ['brot', 'brötchen', 'baguette', 'toast', 'weißbrot', 'vollkornbrot', 'semmel'],
    'fruit-vegetables': ['apfel', 'banana', 'banane', 'orange', 'tomate', 'salat', 'karotte', 'zwiebel', 'obst', 'gemüse', 'gurke', 'paprika', 'zitrone'],
    'dairy-products': ['milch', 'butter', 'joghurt', 'käse', 'sahne', 'quark', 'frischkäse', 'mozzarella'],
    'meat': ['fleisch', 'wurst', 'schinken', 'hähnchen', 'rind', 'schwein', 'hackfleisch'],
    'fish': ['fisch', 'lachs', 'thunfisch', 'garnelen', 'forelle'],
    'beverages-alcohol': ['wasser', 'saft', 'bier', 'wein', 'cola', 'kaffee', 'tee', 'mineralwasser'],
    'frozen-goods': ['tiefkühl', 'eis', 'pizza', 'pommes', 'spinat'],
    'sweet-salty': ['schokolade', 'chips', 'kekse', 'süßigkeiten', 'nüsse', 'bonbons'],
    'cleaning-agents': ['spülmittel', 'waschmittel', 'putzmittel', 'reiniger'],
    'body-care': ['shampoo', 'zahnpasta', 'seife', 'duschgel', 'deo'],
    'household-goods': ['toilettenpapier', 'küchenrolle', 'müllbeutel', 'servietten']
  };

  // 🎨 German color mappings for list creation
  private readonly COLOR_KEYWORDS: { [key: string]: string } = {
    'rot': '#F44336',
    'red': '#F44336',
    'grün': '#4CAF50',
    'green': '#4CAF50',
    'blau': '#2196F3',
    'blue': '#2196F3',
    'gelb': '#FFEB3B',
    'yellow': '#FFEB3B',
    'orange': '#FF9800',
    'lila': '#9C27B0',
    'purple': '#9C27B0',
    'violett': '#9C27B0',
    'rosa': '#E91E63',
    'pink': '#E91E63',
    'schwarz': '#424242',
    'black': '#424242',
    'grau': '#9E9E9E',
    'gray': '#9E9E9E',
    'grey': '#9E9E9E',
    'weiß': '#FAFAFA',
    'weiss': '#FAFAFA',
    'white': '#FAFAFA',
    'türkis': '#009688',
    'turquoise': '#009688',
    'braun': '#795548',
    'brown': '#795548'
  };

  constructor(private dataService: DataService) {
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
   * 🔒 SECURE: Log API key status without exposing the key
   */
  private logApiKeyStatus(): void {
    const finalKey = this.getSecureApiKey();
    const hasKey = !!finalKey;
    const source = localStorage.getItem('groq-api-key') ? 'localStorage' : 
                  environment?.groqApiKey ? 'environment' : 'none';
    
    console.log('🔑 API Key Status:', {
      configured: hasKey,
      source: source,
      length: hasKey ? finalKey.length : 0
    });
  }

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
          message: '🔑 API Key erfolgreich gespeichert!\n\n✅ Groq API Key konfiguriert\n🎯 Smart Disambiguation aktiviert\n🚀 Alle AI-Features verfügbar\n\n💡 Du kannst jetzt sagen:\n"Füge 2kg Bananen hinzu"'
        };
      } else {
        return {
          success: false,
          message: '❌ Ungültiger API Key!\n\nGroq API Keys:\n• Beginnen mit "gsk_"\n• Sind länger als 20 Zeichen\n\n📋 Format:\nset api key: gsk_YOUR_KEY_HERE\n\n🔗 Key erstellen:\nhttps://console.groq.com/keys'
        };
      }
    }
    
    // No key provided - show instructions
    const hasKey = this.hasApiKey();
    return {
      success: true,
      message: `🔑 API Key Setup\n\n${hasKey ? '✅ Bereits konfiguriert' : '❌ Nicht gefunden'}\n\n📝 So konfigurierst du deinen API Key:\n\n1️⃣ Schreibe: "set api key: gsk_YOUR_KEY_HERE"\n\n2️⃣ Groq API Key kostenlos erstellen:\n🔗 https://console.groq.com/keys\n\n${hasKey ? '🎯 Alle Features aktiviert!' : '⚠️ Ohne API Key sind nur Basis-Funktionen verfügbar'}`
    };
  }

  /**
   * 💡 Provide helpful guidance when no API key is configured
   */
  private getNoApiKeyGuidance(): string {
    return '💡 Für intelligente Features:\n\n1️⃣ Groq API Key kostenlos erstellen:\n🔗 https://console.groq.com/keys\n\n2️⃣ Hier eingeben:\n"set api key: gsk_YOUR_KEY_HERE"\n\n✨ Dann verfügbar:\n• Smart Disambiguation\n• Mengen-Erkennung\n• Intelligente Artikel-Vorschläge\n• Automatische Listen-Auswahl';
  }

  // ========================================
  // QUANTITY EXTRACTION
  // ========================================

  /**
   * 🔍 ENHANCED: Extract quantity with better input preservation and debugging
   */
  private extractQuantity(input: string): QuantityExtraction {
    console.log('🔍 QUANTITY EXTRACTION INPUT:', input);
    
    // Store original input for debugging
    const originalInput = input.trim();
    
    // First, clean the input by removing command prefixes and suffixes
    let cleanedInput = originalInput
      .replace(/^füge\s+/i, '') // Remove "Füge " at start
      .replace(/\s+zu\s+.+?\s+hinzu$/i, '') // Remove " zu [Liste] hinzu" at end
      .replace(/\s+hinzu$/i, '') // Remove " hinzu" at end
      .trim();
    
    console.log('🔍 CLEANED INPUT:', cleanedInput);
    
    // Enhanced German quantity patterns - now working on cleaned input
    const quantityPatterns = [
      // Pattern 1: "Artikel Menge Amount Unit" → "Milch Menge 1l"
      { 
        pattern: /^(.+?)\s+menge\s+(\d+(?:[.,]\d+)?\s*(?:kg|g|gramm|liter|l|ml|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser))$/i,
        type: 'item_menge_amount',
        itemGroup: 1,
        quantityGroup: 2
      },
      // Pattern 2: "Amount Unit Artikel" → "2kg Bananen", "500ml Milch"
      { 
        pattern: /^(\d+(?:[.,]\d+)?\s*(?:kg|g|gramm|liter|l|ml|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser))\s+(.+)$/i,
        type: 'unit_start',
        itemGroup: 2,
        quantityGroup: 1
      },
      // Pattern 3: "Amount x Artikel" → "2x Bananen", "3 x Äpfel"
      { 
        pattern: /^(\d+(?:[.,]\d+)?)\s*x\s+(.+)$/i,
        type: 'x_notation',
        itemGroup: 2,
        quantityGroup: 1
      },
      // Pattern 4: "Artikel Amount Unit" → "Bananen 2kg", "Milch 1 Liter"
      { 
        pattern: /^(.+?)\s+(\d+(?:[.,]\d+)?\s*(?:kg|g|gramm|liter|l|ml|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser))$/i,
        type: 'unit_end',
        itemGroup: 1,
        quantityGroup: 2
      },
      // Pattern 5: "Amount Artikel" → "2 Bananen", "3 Äpfel"
      { 
        pattern: /^(\d+(?:[.,]\d+)?)\s+(.+)$/i,
        type: 'number_start',
        itemGroup: 2,
        quantityGroup: 1
      }
    ];
  
    for (let i = 0; i < quantityPatterns.length; i++) {
      const { pattern, type, itemGroup, quantityGroup } = quantityPatterns[i];
      const match = cleanedInput.match(pattern);
      
      if (match) {
        console.log(`🔍 MATCHED PATTERN ${type}:`, match);
        
        const itemName = match[itemGroup].trim();
        const quantity = match[quantityGroup].trim();
  
        console.log('🔍 EXTRACTED:', { itemName, quantity, originalInput });
        
        return {
          itemName: itemName,
          quantity: quantity
        };
      }
    }
  
    console.log('🔍 NO QUANTITY PATTERN MATCHED, RETURNING CLEANED INPUT:', cleanedInput);
    
    // Return cleaned input if no pattern matches
    return { 
      itemName: cleanedInput 
    };
  }

  // ========================================
  // DISAMBIGUATION LOGIC
  // ========================================

  /**
   * 🎯 ENHANCED: Smart disambiguation with fuzzy matching
   */
  private async getDisambiguationOptions(itemName: string, excludeId?: string): Promise<DisambiguationOption[]> {
    console.log('🔍 Getting disambiguation options for:', itemName);
    
    const articles = await this.dataService.getArticles().pipe(take(1)).toPromise();
    const options: DisambiguationOption[] = [];
  
    if (!articles) return options;
  
    // Clean the search term
    const searchTerm = itemName.toLowerCase().trim();
    console.log('🔍 Search term:', searchTerm);
  
    // Find similar existing articles using multiple matching strategies
    const similarArticles = articles
      .filter(article => article.id !== excludeId)
      .map(article => {
        const articleName = article.name.toLowerCase();
        
        // Calculate multiple similarity scores
        const exactMatch = articleName === searchTerm ? 1.0 : 0;
        const containsMatch = articleName.includes(searchTerm) || searchTerm.includes(articleName) ? 0.8 : 0;
        const levenshteinSim = this.calculateSimilarity(searchTerm, articleName);
        
        // Use the best similarity score
        const similarity = Math.max(exactMatch, containsMatch, levenshteinSim);
        
        console.log(`🔍 Article "${article.name}" similarity: ${similarity}`);
        
        return {
          article,
          similarity
        };
      })
      .filter(item => item.similarity >= this.MIN_SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 4); // Max 4 existing options
  
    console.log('🔍 Similar articles found:', similarArticles.length);
  
    // Add existing articles as options
    for (const item of similarArticles) {
      options.push({
        id: `existing_${item.article.id}`,
        displayName: item.article.name,
        type: 'existing',
        article: item.article,
        confidence: item.similarity,
        department: item.article.departmentId,
        icon: item.article.icon
      });
    }
  
    // Always add option to create new article with the EXACT name provided
    const suggestedDepartment = this.suggestDepartment(itemName);
    options.push({
      id: 'new_article',
      displayName: `"${itemName}" (neu erstellen)`,
      type: 'new',
      confidence: 1.0,
      department: suggestedDepartment,
      icon: this.suggestIcon(itemName)
    });
  
    console.log('🔍 Final disambiguation options:', options);
    return options;
  }

  /**
   * 🎯 Calculate similarity between two strings using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLength);
  }

  /**
   * 🎯 Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * 🎨 Extract color from German input
   */
  private extractColor(input: string): { colorName?: string; colorHex?: string; cleanInput: string } {
    const lowerInput = input.toLowerCase();
    
    // Pattern: "in [color]" or "mit [color]" or "[color]"
    const colorPatterns = [
      /\s+in\s+(rot|red|grün|green|blau|blue|gelb|yellow|orange|lila|purple|violett|rosa|pink|schwarz|black|grau|gray|grey|weiß|weiss|white|türkis|turquoise|braun|brown)\s*$/i,
      /\s+mit\s+(rot|red|grün|green|blau|blue|gelb|yellow|orange|lila|purple|violett|rosa|pink|schwarz|black|grau|gray|grey|weiß|weiss|white|türkis|turquoise|braun|brown)\s*$/i,
      /\s+(rot|red|grün|green|blau|blue|gelb|yellow|orange|lila|purple|violett|rosa|pink|schwarz|black|grau|gray|grey|weiß|weiss|white|türkis|turquoise|braun|brown)\s*$/i
    ];

    for (const pattern of colorPatterns) {
      const match = lowerInput.match(pattern);
      if (match) {
        const colorName = match[1].toLowerCase();
        const colorHex = this.COLOR_KEYWORDS[colorName];
        if (colorHex) {
          // Remove color from input
          const cleanInput = input.replace(new RegExp(match[0], 'i'), '').trim();
          return { 
            colorName, 
            colorHex, 
            cleanInput 
          };
        }
      }
    }

    return { cleanInput: input };
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
      if (input.toLowerCase().includes('hilfe')) {
        const hasKey = this.hasApiKey();
        return {
          success: true,
          message: this.getEnhancedHelpMessage(hasKey)
        };
      }
      
      if (input.toLowerCase().includes('test')) {
        const hasKey = this.hasApiKey();
        const source = localStorage.getItem('groq-api-key') ? 'localStorage' : 
                      environment?.groqApiKey ? 'environment.ts' : 'none';
        
        return {
          success: true,
          message: `✅ AI Service funktioniert!\n\nAPI Key: ${hasKey ? '✅ Konfiguriert' : '❌ Nicht gefunden'}\nQuelle: ${source}\nDataService: ${!!this.dataService ? '✅ Verfügbar' : '❌ Fehler'}\n\n🎯 Enhanced Features:\n• Smart Disambiguation: ${hasKey ? '✅' : '❌'}\n• Quantity Extraction: ${hasKey ? '✅' : '❌'}\n• List Selection: ✅\n• Fuzzy Matching: ${hasKey ? '✅' : '❌'}\n\n${!hasKey ? this.getNoApiKeyGuidance() : '🚀 Alle Systeme bereit für intelligente Verarbeitung!'}`
        };
      }

      // 🎯 Check if API key is configured for advanced features
      const hasApiKey = this.hasApiKey();
      console.log('🔑 Has API Key:', hasApiKey);
      
      // For first-time users or commands that require AI features
      if (!hasApiKey && (
        input.toLowerCase().includes('füge') || 
        input.toLowerCase().includes('erstelle') ||
        input.toLowerCase().includes('hinzu')
      )) {
        console.log('🔄 Processing with basic command (no API key)');
        // Process with basic functionality but show upgrade path
        const basicResult = await this.processBasicCommand(input);
        
        // Add API key guidance to successful basic operations
        if (basicResult.success && !basicResult.needsUserInput) {
          basicResult.message += '\n\n' + this.getNoApiKeyGuidance();
        }
        
        return basicResult;
      }

      // 🎯 ENHANCED: Process command with quantity extraction and disambiguation (if API key available)
      if (hasApiKey) {
        console.log('🎯 Processing with enhanced command (has API key)');
        return await this.processEnhancedCommand(input);
      } else {
        console.log('🔄 Processing with basic command (fallback)');
        return await this.processBasicCommand(input);
      }
      
    } catch (error) {
      console.error('AI Service error:', error);
      return {
        success: false,
        message: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ========================================
  // BASIC COMMAND PROCESSING
  // ========================================

  /**
   * 🔧 ENHANCED: Process commands with color support and input preservation
   */
  private async processBasicCommand(input: string): Promise<AIExecutionResult> {
    console.log('🤖 PROCESSING BASIC COMMAND:', input);
    
    const lowerInput = input.toLowerCase();
    const originalInput = input.trim();
    
    // Extract quantity and item name with debugging
    const quantityExtraction = this.extractQuantity(originalInput);
    console.log('🔍 QUANTITY EXTRACTION RESULT:', quantityExtraction);
    
    // Handle specific commands first
    if (lowerInput.includes('zeige') && lowerInput.includes('liste')) {
      return await this.handleShowListsCommand();
    }
    
    // Handle list creation with color support
    if (lowerInput.includes('erstelle') && lowerInput.includes('liste')) {
      return await this.handleListCreationWithColor(originalInput, quantityExtraction);
    }
    
    // Handle item addition
    if (lowerInput.includes('füge') && lowerInput.includes('hinzu')) {
      return await this.handleItemAdditionWithPreservation(originalInput, quantityExtraction);
    }
    
    // For unrecognized commands, provide helpful feedback
    return {
      success: true,
      message: `Ich verstehe: "${originalInput}"\n\n🤖 Das ist kein bekannter Befehl.\n\n💡 Verfügbare Befehle:\n• "Füge [Artikel] hinzu" - Artikel zur Liste hinzufügen\n• "Füge [Artikel] zu [Liste] hinzu" - Direkt zur spezifizierten Liste\n⚖️ "Füge [Artikel] Menge [Anzahl] [Einheit] hinzu"\n• "Erstelle Liste [Name]" - Neue Liste erstellen\n🎨 "Erstelle Liste [Name] in [Farbe]" - Bunte Liste\n• "Zeige Listen" - Alle Listen anzeigen\n• "Hilfe" - Ausführliche Hilfe\n\n📋 Beispiele:\n• "Füge Schokolade Menge 2 Stück hinzu"\n• "Füge 500ml Milch zu Spar hinzu"`
    };
  }

  // ========================================
  // ENHANCED COMMAND PROCESSING
  // ========================================

  /**
   * 🎯 ENHANCED: Process command with smart disambiguation (requires API key)
   */
  private async processEnhancedCommand(input: string): Promise<AIExecutionResult> {
    console.log('🎯 PROCESSING ENHANCED COMMAND:', input);
    
    // Extract quantity from input
    const quantityExtraction = this.extractQuantity(input);
    console.log('🎯 Quantity extraction:', quantityExtraction);
  
    // Parse command intent using the clean item name from quantity extraction
    const intent = this.parseIntent(input, quantityExtraction.itemName);
    console.log('🎯 Parsed intent:', intent);
  
    // Check for unrecognized commands first
    if (intent.listName === 'UNRECOGNIZED_COMMAND') {
      console.log('🎯 Unrecognized command, falling back to basic processing');
      return this.processBasicCommand(input);
    }
  
    // Enhanced action with quantity - ensure clean item name is used
    const pendingAction: PendingAction = {
      ...intent,
      itemName: quantityExtraction.itemName, // Use the clean item name from extraction
      extractedQuantity: quantityExtraction.quantity,
      suggestedDepartment: this.suggestDepartment(quantityExtraction.itemName)
    };
  
    console.log('🎯 Final pending action:', pendingAction);
  
    // Handle create list commands
    if (intent.type === 'create_list') {
      console.log('🎯 Processing create list command');
      return await this.handleListCreationWithColor(input, quantityExtraction);
    }
  
    // Handle add item commands (only if they contain "füge...hinzu")
    if (intent.type === 'add_item' && intent.listName !== 'UNRECOGNIZED_COMMAND') {
      console.log('🎯 Processing add item command');
      return await this.handleItemActionWithDisambiguation(pendingAction);
    }
  
    // Fallback to basic processing
    console.log('🎯 Fallback to basic processing');
    return this.processBasicCommand(input);
  }

  /**
   * 🎯 Parse command intent from input
   */
  private parseIntent(input: string, cleanItemName: string): Omit<PendingAction, 'extractedQuantity' | 'suggestedDepartment'> {
    const lowerInput = input.toLowerCase();
  
    // Create list patterns: "Erstelle Liste REWE mit Milch"
    const createListMatch = lowerInput.match(/erstelle\s+liste\s+(.+?)\s+mit\s+(.+)/);
    if (createListMatch) {
      // For create list, extract item from the pattern and clean it
      const extractedItem = createListMatch[2].replace(/\s+hinzu$/, '').trim();
      return {
        type: 'create_list',
        originalInput: input,
        itemName: this.cleanItemName(extractedItem),
        listName: createListMatch[1].trim()
      };
    }
  
    // Add to specific list: "Füge Bananen zu Spar hinzu"
    const addToListMatch = lowerInput.match(/füge\s+(.+?)\s+zu\s+(.+?)\s+hinzu/);
    if (addToListMatch) {
      // For specific list addition, use the already-clean item name from extractQuantity
      return {
        type: 'add_item',
        originalInput: input,
        itemName: cleanItemName, // Use the pre-cleaned item name
        listName: addToListMatch[2].trim()
      };
    }
  
    // Generic add: "Füge Bananen hinzu" or "Füge Joghurt Menge 1 Becher hinzu"
    if (lowerInput.includes('füge') && lowerInput.includes('hinzu')) {
      // IMPORTANT: Use the already-extracted and cleaned item name from extractQuantity
      // Don't re-extract from the pattern as it can include quantity information
      return {
        type: 'add_item',
        originalInput: input,
        itemName: cleanItemName // Use the pre-cleaned item name
      };
    }
  
    // Default add item
    return {
      type: 'add_item',
      originalInput: input,
      itemName: cleanItemName // Use the pre-cleaned item name
    };
  }

  /**
   * 🧹 NEW: Clean item name from command artifacts
   */
  private cleanItemName(itemName: string): string {
    return itemName
      .replace(/^füge\s+/i, '') // Remove "füge " prefix
      .replace(/\s+menge\s+.+$/i, '') // Remove " menge X Unit" completely
      .replace(/\s+hinzu$/i, '') // Remove " hinzu" suffix
      .replace(/\s+zu\s+.+$/i, '') // Remove " zu [list]" suffix
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .trim();
  }

  /**
   * 🎯 ENHANCED: Handle item action with smart disambiguation
   */
  private async handleItemActionWithDisambiguation(action: PendingAction): Promise<AIExecutionResult> {
    console.log('🎯 Handling item action with disambiguation:', action);
    console.log('🎯 Action item name:', action.itemName);
    console.log('🎯 Action quantity:', action.extractedQuantity);
  
    // For items that don't contain "füge...hinzu", this shouldn't be called
    if (!action.originalInput.toLowerCase().includes('füge') || !action.originalInput.toLowerCase().includes('hinzu')) {
      console.log('🚫 This is not an add item command, redirecting to basic processing');
      return this.processBasicCommand(action.originalInput);
    }
  
    // Ensure we're working with a clean item name (should already be clean from extractQuantity)
    const cleanItemName = this.cleanItemName(action.itemName);
    console.log('🎯 Clean item name (should be same as action.itemName):', cleanItemName);
  
    // Update action with clean name (should be no change if extractQuantity worked correctly)
    action.itemName = cleanItemName;
  
    // Get disambiguation options
    const disambiguationOptions = await this.getDisambiguationOptions(cleanItemName);
    console.log('🎯 Disambiguation options for item:', cleanItemName);
    console.log('🎯 Number of disambiguation options:', disambiguationOptions.length);
  
    // ALWAYS show disambiguation if there are existing similar items
    // This ensures user gets to choose and prevents wrong item selection
    const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');
    
    if (existingOptions.length > 0) {
      console.log('🎯 Found existing options, showing disambiguation');
      
      return {
        success: true,
        message: `🎯 Ich habe ähnliche Artikel für "${cleanItemName}" gefunden. Welchen möchtest du verwenden?`,
        needsUserInput: true,
        disambiguationOptions,
        pendingAction: action
      };
    }
  
    // No existing items found - create new article directly
    console.log('🎯 No existing options, creating new article');
    return await this.executeActionWithNewArticle(action);
  }

  // ========================================
  // ACTION EXECUTION
  // ========================================

  /**
   * 🎯 Execute action with existing article - Enhanced with list selection
   */
  private async executeActionWithArticle(action: PendingAction, article: Article): Promise<AIExecutionResult> {
    try {
      // Update article amount if quantity was extracted
      if (action.extractedQuantity) {
        await this.dataService.updateArticle(article.id, {
          ...article,
          amount: action.extractedQuantity
        }).toPromise();
      }

      if (action.type === 'create_list') {
        const newList = await this.dataService.createList({
          name: action.listName!,
          color: this.suggestListColor(action.listName!),
          icon: '🛒',
          articleIds: [article.id],
          itemStates: { [article.id]: { articleId: article.id, isChecked: false } }
        }).toPromise();

        return {
          success: true,
          message: `✅ Liste "${action.listName}" wurde mit "${article.name}"${action.extractedQuantity ? ` (${action.extractedQuantity})` : ''} erstellt.`,
          listId: newList?.id
        };
      } else {
        // Check if list was specified
        if (!action.listName) {
          // No list specified - ask user to choose
          return await this.requestListSelection(action, article);
        }

        // List was specified - find and use it
        const targetList = await this.findListByName(action.listName);

        if (!targetList) {
          return {
            success: false,
            message: `❌ Liste "${action.listName}" nicht gefunden.\n\n📝 Verfügbare Listen:\n${await this.getAvailableListsText()}`
          };
        }

        await this.dataService.addArticleToList(targetList.id, article.id).toPromise();
        
        return {
          success: true,
          message: `✅ "${article.name}"${action.extractedQuantity ? ` (${action.extractedQuantity})` : ''} wurde zur Liste "${targetList.name}" hinzugefügt.`,
          listId: targetList.id
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '❌ Fehler beim Ausführen der Aktion.'
      };
    }
  }

  /**
   * 🎯 Execute action with new article - Enhanced with list selection
   */
  private async executeActionWithNewArticle(action: PendingAction): Promise<AIExecutionResult> {
    console.log('🎯 Executing action with new article:', action.itemName);
    
    try {
      if (action.type === 'create_list') {
        const newArticle = await this.dataService.createArticle({
          name: action.itemName, // Use EXACT name from action
          amount: action.extractedQuantity || '',
          departmentId: action.suggestedDepartment || 'miscellaneous',
          icon: this.suggestIcon(action.itemName)
        }).toPromise();
  
        if (!newArticle) {
          throw new Error('Failed to create article');
        }
  
        console.log('🎯 Created new article:', newArticle);
  
        const newList = await this.dataService.createList({
          name: action.listName!,
          color: this.suggestListColor(action.listName!),
          icon: '🛒',
          articleIds: [newArticle.id],
          itemStates: { [newArticle.id]: { articleId: newArticle.id, isChecked: false } }
        }).toPromise();
  
        return {
          success: true,
          message: `✅ Liste "${action.listName}" wurde mit "${newArticle.name}"${action.extractedQuantity ? ` (${action.extractedQuantity})` : ''} erstellt.`,
          listId: newList?.id
        };
      } else {
        // Check if list was specified
        if (!action.listName) {
          // No list specified - ask user to choose (but first create the article data)
          const articleData = {
            name: action.itemName, // Use EXACT name
            amount: action.extractedQuantity || '',
            departmentId: action.suggestedDepartment || 'miscellaneous',
            icon: this.suggestIcon(action.itemName)
          };
  
          console.log('🎯 Requesting list selection for new article:', articleData);
          return await this.requestListSelectionForNewArticle(action, articleData);
        }
  
        // List was specified - proceed normally
        const newArticle = await this.dataService.createArticle({
          name: action.itemName, // Use EXACT name
          amount: action.extractedQuantity || '',
          departmentId: action.suggestedDepartment || 'miscellaneous',
          icon: this.suggestIcon(action.itemName)
        }).toPromise();
  
        if (!newArticle) {
          throw new Error('Failed to create article');
        }
  
        console.log('🎯 Created new article for list:', newArticle);
  
        const targetList = await this.findListByName(action.listName);
  
        if (!targetList) {
          return {
            success: false,
            message: `❌ Liste "${action.listName}" nicht gefunden.\n\n📝 Verfügbare Listen:\n${await this.getAvailableListsText()}`
          };
        }
  
        await this.dataService.addArticleToList(targetList.id, newArticle.id).toPromise();
        
        return {
          success: true,
          message: `✅ "${newArticle.name}"${action.extractedQuantity ? ` (${action.extractedQuantity})` : ''} wurde zur Liste "${targetList.name}" hinzugefügt.`,
          listId: targetList.id
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

  // ========================================
  // LIST SELECTION LOGIC
  // ========================================

  /**
   * 🎯 NEW: Request list selection for existing article
   */
  private async requestListSelection(action: PendingAction, article: Article): Promise<AIExecutionResult> {
    const listOptions = await this.getListSelectionOptions();
    
    if (listOptions.length === 0) {
      return {
        success: false,
        message: `❌ Keine Listen gefunden!\n\n💡 Erstelle zuerst eine Liste:\n"Erstelle Liste [Name]"`
      };
    }

    // If only one list exists, use it directly
    if (listOptions.length === 1) {
      const targetList = await this.findListByName(listOptions[0].name);
      if (targetList) {
        await this.dataService.addArticleToList(targetList.id, article.id).toPromise();
        return {
          success: true,
          message: `✅ "${article.name}"${action.extractedQuantity ? ` (${action.extractedQuantity})` : ''} wurde zur Liste "${targetList.name}" hinzugefügt.`,
          listId: targetList.id
        };
      }
    }

    // Multiple lists - ask user to choose
    const pendingActionWithArticle: PendingAction = {
      ...action,
      type: 'select_list',
      articleToAdd: {
        id: article.id,
        name: article.name,
        amount: action.extractedQuantity || article.amount,
        departmentId: article.departmentId,
        icon: article.icon
      }
    };

    return {
      success: true,
      message: `🎯 Zu welcher Liste soll "${article.name}"${action.extractedQuantity ? ` (${action.extractedQuantity})` : ''} hinzugefügt werden?`,
      needsUserInput: true,
      disambiguationOptions: this.convertListsToDisambiguationOptions(listOptions),
      pendingAction: pendingActionWithArticle
    };
  }

  /**
   * 🎯 NEW: Request list selection for new article
   */
  private async requestListSelectionForNewArticle(action: PendingAction, articleData: any): Promise<AIExecutionResult> {
    const listOptions = await this.getListSelectionOptions();
    
    if (listOptions.length === 0) {
      return {
        success: false,
        message: `❌ Keine Listen gefunden!\n\n💡 Erstelle zuerst eine Liste:\n"Erstelle Liste [Name]"`
      };
    }

    // If only one list exists, create article and add it
    if (listOptions.length === 1) {
      const newArticle = await this.dataService.createArticle(articleData).toPromise();
      if (newArticle) {
        const targetList = await this.findListByName(listOptions[0].name);
        if (targetList) {
          await this.dataService.addArticleToList(targetList.id, newArticle.id).toPromise();
          return {
            success: true,
            message: `✅ "${newArticle.name}"${action.extractedQuantity ? ` (${action.extractedQuantity})` : ''} wurde zur Liste "${targetList.name}" hinzugefügt.`,
            listId: targetList.id
          };
        }
      }
    }

    // Multiple lists - ask user to choose
    const pendingActionWithArticle: PendingAction = {
      ...action,
      type: 'select_list',
      articleToAdd: articleData
    };

    return {
      success: true,
      message: `🎯 Zu welcher Liste soll "${articleData.name}"${action.extractedQuantity ? ` (${action.extractedQuantity})` : ''} hinzugefügt werden?`,
      needsUserInput: true,
      disambiguationOptions: this.convertListsToDisambiguationOptions(listOptions),
      pendingAction: pendingActionWithArticle
    };
  }

  /**
   * 🎯 NEW: Get available lists as selection options
   */
  private async getListSelectionOptions(): Promise<ListSelectionOption[]> {
    const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
    if (!lists) return [];

    return lists.map(list => ({
      id: list.id,
      name: list.name,
      color: list.color || '#1a9edb', // Default color if undefined
      icon: list.icon || '🛒', // Default icon if undefined
      itemCount: list.articleIds?.length || 0
    }));
  }

  /**
   * 🎯 NEW: Convert lists to disambiguation options for UI
   */
  private convertListsToDisambiguationOptions(listOptions: ListSelectionOption[]): DisambiguationOption[] {
    return listOptions.map(list => ({
      id: `list_${list.id}`,
      displayName: list.name,
      type: 'existing' as const,
      confidence: 1.0,
      department: `${list.itemCount} ${list.itemCount === 1 ? 'Artikel' : 'Artikel'}`,
      icon: list.icon
    }));
  }

  /**
   * 🎯 NEW: Get available lists as text
   */
  private async getAvailableListsText(): Promise<string> {
    const listOptions = await this.getListSelectionOptions();
    return listOptions
      .map(list => `• ${list.name} (${list.itemCount} ${list.itemCount === 1 ? 'Artikel' : 'Artikel'})`)
      .join('\n');
  }

  // ========================================
  // DISAMBIGUATION HANDLING
  // ========================================

  /**
   * 🎯 ENHANCED: Handle disambiguation choice (now includes list selection)
   */
  async handleDisambiguationChoice(
    pendingAction: PendingAction, 
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('🎯 Handling disambiguation choice:', { pendingAction, selectedOption });

    // Handle list selection
    if (pendingAction.type === 'select_list') {
      return await this.handleListSelection(pendingAction, selectedOption);
    }

    // Handle article disambiguation (existing logic)
    if (selectedOption.type === 'existing' && selectedOption.article) {
      return await this.executeActionWithArticle(pendingAction, selectedOption.article);
    } else {
      return await this.executeActionWithNewArticle(pendingAction);
    }
  }

  /**
   * 🎯 NEW: Handle list selection from disambiguation
   */
  private async handleListSelection(pendingAction: PendingAction, selectedOption: DisambiguationOption): Promise<AIExecutionResult> {
    try {
      // Extract list ID from selected option
      const listId = selectedOption.id.replace('list_', '');
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      const targetList = lists?.find(list => list.id === listId);

      if (!targetList) {
        return {
          success: false,
          message: '❌ Ausgewählte Liste nicht gefunden.'
        };
      }

      const articleData = pendingAction.articleToAdd!;

      // Create article if it doesn't exist yet
      let articleId = articleData.id;
      if (!articleId) {
        const newArticle = await this.dataService.createArticle({
          name: articleData.name,
          amount: articleData.amount || '',
          departmentId: articleData.departmentId || 'miscellaneous',
          icon: articleData.icon || '📦'
        }).toPromise();
        
        if (!newArticle) {
          throw new Error('Failed to create article');
        }
        articleId = newArticle.id;
      }

      // Add article to selected list
      await this.dataService.addArticleToList(targetList.id, articleId).toPromise();

      return {
        success: true,
        message: `✅ "${articleData.name}"${articleData.amount ? ` (${articleData.amount})` : ''} wurde zur Liste "${targetList.name}" hinzugefügt.`,
        listId: targetList.id
      };

    } catch (error) {
      console.error('List selection error:', error);
      return {
        success: false,
        message: '❌ Fehler beim Hinzufügen zur ausgewählten Liste.'
      };
    }
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  private async findListByName(listName: string): Promise<ShoppingList | null> {
    const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
    if (!lists) return null;
    
    const normalizedQuery = listName.toLowerCase().trim();
    
    // Exact match first
    let match = lists.find(list => 
      list.name.toLowerCase() === normalizedQuery
    );
    
    if (match) return match;
    
    // Partial match
    match = lists.find(list => 
      list.name.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(list.name.toLowerCase())
    );
    
    return match || null;
  }

  private suggestDepartment(articleName: string): string {
    const normalized = articleName.toLowerCase();
    
    for (const [departmentId, keywords] of Object.entries(this.DEPARTMENT_KEYWORDS)) {
      if (keywords.some(keyword => 
        normalized.includes(keyword) || keyword.includes(normalized)
      )) {
        return departmentId;
      }
    }
    
    return 'miscellaneous';
  }

  private suggestIcon(articleName: string): string {
    const normalized = articleName.toLowerCase();
    
    const iconMap: { [key: string]: string } = {
      'banane': '🍌', 'banana': '🍌',
      'apfel': '🍎', 'apple': '🍎',
      'brot': '🍞', 'bread': '🍞',
      'milch': '🥛', 'milk': '🥛',
      'käse': '🧀', 'cheese': '🧀',
      'fleisch': '🥩', 'meat': '🥩',
      'fisch': '🐟', 'fish': '🐟',
      'ei': '🥚', 'egg': '🥚',
      'wasser': '💧', 'water': '💧',
      'bier': '🍺', 'beer': '🍺',
      'salat': '🥗', 'lettuce': '🥬'
    };
    
    for (const [keyword, icon] of Object.entries(iconMap)) {
      if (normalized.includes(keyword)) {
        return icon;
      }
    }
    
    return '📦';
  }

  private suggestListColor(listName: string): string {
    const normalized = listName.toLowerCase();
    
    const colorMap: { [key: string]: string } = {
      'spar': '#00A651',
      'billa': '#FF6B00',
      'hofer': '#E30613',
      'merkur': '#0066CC',
      'interspar': '#00A651',
      'lidl': '#0050AA',
      'penny': '#E30613',
      'adeg': '#FFD700'
    };
    
    for (const [shop, color] of Object.entries(colorMap)) {
      if (normalized.includes(shop)) {
        return color;
      }
    }
    
    const defaultColors = ['#1a9edb', '#4CAF50', '#FF9800', '#9C27B0', '#F44336'];
    return defaultColors[Math.floor(Math.random() * defaultColors.length)];
  }

  // ========================================
  // NEW ENHANCED HELPER METHODS
  // ========================================

  /**
   * 🎨 Handle list creation with color support
   */
  private async handleListCreationWithColor(input: string, quantityExtraction: QuantityExtraction): Promise<AIExecutionResult> {
    console.log('🎨 HANDLING LIST CREATION WITH COLOR:', input);
    
    // Extract color first
    const colorExtraction = this.extractColor(input);
    console.log('🎨 COLOR EXTRACTION:', colorExtraction);
    
    // Parse list creation from clean input (without color)
    const cleanInput = colorExtraction.cleanInput.toLowerCase();
    
    // Pattern: "erstelle liste [name] mit [item]" or "erstelle liste [name]"
    const createMatch = cleanInput.match(/erstelle\s+liste\s+(.+?)(?:\s+mit\s+(.+))?$/);
    
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
          departmentId: this.suggestDepartment(itemName),
          icon: this.suggestIcon(itemName)
        };
        
        console.log('🎨 CREATING ARTICLE:', articleToCreate);
        
        const newArticle = await this.dataService.createArticle(articleToCreate).toPromise();
        
        if (newArticle) {
          articleIds.push(newArticle.id);
          itemStates[newArticle.id] = { articleId: newArticle.id, isChecked: false };
        }
      }
      
      // Use extracted color or suggest based on name
      const listColor = colorExtraction.colorHex || this.suggestListColor(listName);
      
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
        const colorName = colorExtraction.colorName ? ` in ${colorExtraction.colorName}` : '';
        const itemText = itemName ? ` mit "${quantityExtraction.itemName || itemName}"${quantityExtraction.quantity ? ` (${quantityExtraction.quantity})` : ''}` : '';
        
        return {
          success: true,
          message: `✅ Liste "${listName}"${colorName} wurde${itemText} erstellt.`,
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
   * 🔍 Handle item addition with input preservation
   */
  private async handleItemAdditionWithPreservation(input: string, quantityExtraction: QuantityExtraction): Promise<AIExecutionResult> {
    console.log('🔍 HANDLING ITEM ADDITION WITH PRESERVATION:', input);
    console.log('🔍 USING QUANTITY EXTRACTION:', quantityExtraction);
    
    const lowerInput = input.toLowerCase();
    
    // Parse add patterns
    const addMatch = lowerInput.match(/füge\s+(.+?)\s+(?:zu\s+(.+?)\s+)?hinzu/);
    
    if (!addMatch) {
      return {
        success: false,
        message: `❌ Unverständlicher Hinzufügen-Befehl: "${input}"\n\n💡 Beispiele:\n• "Füge Bananen hinzu"\n• "Füge 2kg Bananen zu Spar hinzu"`
      };
    }
    
    const extractedItemFromPattern = addMatch[1].trim();
    const listName = addMatch[2]?.trim();
    
    // IMPORTANT: Use the original item name from quantity extraction, not the pattern match
    // This preserves exactly what the user typed
    const finalItemName = quantityExtraction.itemName;
    
    console.log('🔍 ITEM ADDITION PARSED:', {
      input,
      extractedFromPattern: extractedItemFromPattern,
      finalItemName,
      quantity: quantityExtraction.quantity,
      listName
    });
    
    // If no list specified, ask for list selection
    if (!listName) {
      const listOptions = await this.getListSelectionOptions();
      
      if (listOptions.length === 0) {
        return {
          success: false,
          message: `❌ Keine Listen gefunden!\n\n💡 Erstelle zuerst eine Liste:\n"Erstelle Liste [Name]"`
        };
      }

      // If only one list, use it directly
      if (listOptions.length === 1) {
        try {
          const newArticle = await this.dataService.createArticle({
            name: finalItemName, // Use preserved name
            amount: quantityExtraction.quantity || '',
            departmentId: this.suggestDepartment(finalItemName),
            icon: this.suggestIcon(finalItemName)
          }).toPromise();

          if (newArticle) {
            const targetList = await this.findListByName(listOptions[0].name);
            if (targetList) {
              await this.dataService.addArticleToList(targetList.id, newArticle.id).toPromise();
              return {
                success: true,
                message: `✅ "${newArticle.name}"${quantityExtraction.quantity ? ` (${quantityExtraction.quantity})` : ''} wurde zur Liste "${targetList.name}" hinzugefügt.`,
                listId: targetList.id
              };
            }
          }
        } catch (error) {
          console.error('🔍 SINGLE LIST ADDITION ERROR:', error);
          return {
            success: false,
            message: '❌ Fehler beim Hinzufügen des Artikels.'
          };
        }
      }

      // Multiple lists - ask user to choose
      const pendingAction: PendingAction = {
        type: 'select_list',
        originalInput: input,
        itemName: finalItemName, // Use preserved name
        extractedQuantity: quantityExtraction.quantity,
        articleToAdd: {
          name: finalItemName, // Use preserved name
          amount: quantityExtraction.quantity || '',
          departmentId: this.suggestDepartment(finalItemName),
          icon: this.suggestIcon(finalItemName)
        }
      };

      console.log('🔍 REQUESTING LIST SELECTION WITH PRESERVED NAME:', pendingAction);

      return {
        success: true,
        message: `🎯 Zu welcher Liste soll "${finalItemName}"${quantityExtraction.quantity ? ` (${quantityExtraction.quantity})` : ''} hinzugefügt werden?`,
        needsUserInput: true,
        disambiguationOptions: this.convertListsToDisambiguationOptions(listOptions),
        pendingAction: pendingAction
      };
    }

    // List was specified - proceed with addition
    try {
      const newArticle = await this.dataService.createArticle({
        name: finalItemName, // Use preserved name
        amount: quantityExtraction.quantity || '',
        departmentId: this.suggestDepartment(finalItemName),
        icon: this.suggestIcon(finalItemName)
      }).toPromise();

      if (newArticle) {
        const targetList = await this.findListByName(listName);

        if (targetList) {
          await this.dataService.addArticleToList(targetList.id, newArticle.id).toPromise();
          return {
            success: true,
            message: `✅ "${newArticle.name}"${quantityExtraction.quantity ? ` (${quantityExtraction.quantity})` : ''} wurde zur Liste "${targetList.name}" hinzugefügt.`,
            listId: targetList.id
          };
        } else {
          return {
            success: false,
            message: `❌ Liste "${listName}" nicht gefunden.\n\n📝 Verfügbare Listen:\n${await this.getAvailableListsText()}`
          };
        }
      }
    } catch (error) {
      console.error('🔍 LIST ADDITION ERROR:', error);
      return {
        success: false,
        message: '❌ Fehler beim Hinzufügen des Artikels.'
      };
    }
    
    return {
      success: false,
      message: '❌ Unerwarteter Fehler beim Hinzufügen des Artikels.'
    };
  }

  /**
   * 💡 Enhanced help guidance with color examples and quantity patterns
   */
  private getEnhancedHelpMessage(hasApiKey: boolean): string {
    let helpMessage = '🤖 Shoplisl AI Assistant\n\n';
    
    if (hasApiKey) {
      helpMessage += '✅ Intelligente Features aktiv\n\n';
      helpMessage += '📝 Verfügbare Befehle:\n\n';
      helpMessage += '• "Füge [Artikel] hinzu"\n  → Fragt nach der Liste\n\n';
      helpMessage += '• "Füge [Artikel] zu [Liste] hinzu"\n  → Direkt zur spezifizierten Liste\n\n';
      helpMessage += '⚖️ MENGEN-SYNTAX:\n';
      helpMessage += '• "Füge 2kg Bananen hinzu"\n';
      helpMessage += '• "Füge Schokolade Menge 2 Stück hinzu"\n';
      helpMessage += '• "Füge 500ml Milch zu Spar hinzu"\n';
      helpMessage += '• "Füge 3x Äpfel hinzu"\n\n';
      helpMessage += '• "Erstelle Liste [Name]"\n  → Neue Einkaufsliste\n\n';
      helpMessage += '• "Erstelle Liste [Name] mit [Artikel]"\n  → Liste mit erstem Artikel\n\n';
      helpMessage += '🎨 MIT FARBEN:\n';
      helpMessage += '• "Erstelle Liste Spar in rot"\n';
      helpMessage += '• "Erstelle Liste REWE in blau mit Milch"\n';
      helpMessage += '• Verfügbare Farben: rot, grün, blau, gelb, orange, lila, rosa, schwarz, grau, weiß, türkis, braun\n\n';
    } else {
      helpMessage += '⚙️ Basis-Funktionen verfügbar\n\n';
      helpMessage += '💡 Für intelligente Features:\n';
      helpMessage += '"set api key: gsk_YOUR_KEY_HERE"\n\n';
      helpMessage += '📝 Basis-Befehle:\n\n';
      helpMessage += '• "Füge [Artikel] hinzu" - Fragt nach Liste\n';
      helpMessage += '• "Füge [Artikel] zu [Liste] hinzu"\n';
      helpMessage += '⚖️ "Füge [Artikel] Menge [Anzahl] [Einheit] hinzu"\n';
      helpMessage += '• "Erstelle Liste [Name]"\n';
      helpMessage += '🎨 "Erstelle Liste [Name] in [Farbe]"\n';
      helpMessage += '• "Zeige Listen" - Alle Listen anzeigen\n';
      helpMessage += '• "Test" - System-Status prüfen\n\n';
    }
    
    return helpMessage;
  }

  /**
   * 📋 NEW: Handle show lists command
   */
  private async handleShowListsCommand(): Promise<AIExecutionResult> {
    console.log('📋 HANDLING SHOW LISTS COMMAND');
    
    try {
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      
      if (!lists || lists.length === 0) {
        return {
          success: true,
          message: '📋 Keine Listen gefunden.\n\n💡 Erstelle eine neue Liste:\n"Erstelle Liste [Name]"\n"Erstelle Liste [Name] in [Farbe]"'
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
}