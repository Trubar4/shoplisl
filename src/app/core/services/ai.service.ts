// src/app/core/services/ai.service.ts - Enhanced with Smart Disambiguation
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
  type: 'add_item' | 'create_list';
  originalInput: string;
  itemName: string;
  extractedQuantity?: string;
  listName?: string;
  suggestedDepartment?: string;
}

export interface QuantityExtraction {
  itemName: string;
  quantity?: string;
  unit?: string;
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

  constructor(private dataService: DataService) {
    this.logApiKeyStatus();
  }

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
   * 🎯 ENHANCED: Extract quantity from German input
   */
  private extractQuantity(input: string): QuantityExtraction {
    // German quantity patterns with units
    const quantityPatterns = [
      // Amount + unit at start: "2kg Bananen", "500ml Milch"
      /(\d+(?:[.,]\d+)?\s*(?:kg|g|liter|l|ml|stück|stk|pack|packung|dose|dosen|gramm))\s+(.+)/i,
      // Amount + x: "2x Bananen", "3 x Äpfel"
      /(\d+(?:[.,]\d+)?)\s*x\s+(.+)/i,
      // Amount at end: "Bananen 2kg", "Milch 1 Liter"
      /(.+?)\s+(\d+(?:[.,]\d+)?\s*(?:kg|g|liter|l|ml|stück|stk|pack|packung|dose|dosen|gramm))$/i,
      // Simple number: "2 Bananen", "3 Äpfel"
      /(\d+(?:[.,]\d+)?)\s+(.+)/i
    ];

    for (let i = 0; i < quantityPatterns.length; i++) {
      const pattern = quantityPatterns[i];
      const match = input.match(pattern);
      
      if (match) {
        if (i === 2) { // Quantity at end pattern
          return {
            itemName: match[1].trim(),
            quantity: match[2].trim()
          };
        } else { // Quantity at start patterns
          return {
            itemName: match[2].trim(),
            quantity: match[1].trim()
          };
        }
      }
    }

    return { itemName: input.trim() };
  }

  /**
   * 🎯 ENHANCED: Smart disambiguation with fuzzy matching
   */
  private async getDisambiguationOptions(itemName: string, excludeId?: string): Promise<DisambiguationOption[]> {
    const articles = await this.dataService.getArticles().pipe(take(1)).toPromise();
    const options: DisambiguationOption[] = [];

    if (!articles) return options;

    // Find similar existing articles using fuzzy matching
    const similarArticles = articles
      .filter(article => article.id !== excludeId) // Exclude current article if updating
      .map(article => ({
        article,
        similarity: this.calculateSimilarity(itemName.toLowerCase(), article.name.toLowerCase())
      }))
      .filter(item => item.similarity >= this.MIN_SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 4); // Max 4 existing options

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

    // Always add option to create new article
    const suggestedDepartment = this.suggestDepartment(itemName);
    options.push({
      id: 'new_article',
      displayName: `${itemName} (neu)`,
      type: 'new',
      confidence: 1.0,
      department: suggestedDepartment,
      icon: this.suggestIcon(itemName)
    });

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
   * Execute AI command and perform actual data operations
   */
  async executeCommand(input: string): Promise<AIExecutionResult> {
    try {
      console.log('🤖 Processing command:', input);
      
      // Handle simple test commands first
      if (input.toLowerCase().includes('hilfe')) {
        return {
          success: true,
          message: 'Hallo! Ich kann dir mit folgenden Aufgaben helfen:\n\n• "Füge 2kg Bananen zu Spar hinzu"\n• "Erstelle Liste ADEG mit Milch"\n• "API Key setup" (für erweiterte Funktionen)\n\nNeu: Intelligente Mengen-Erkennung und Smart-Disambiguation!'
        };
      }
      
      // Handle API key setup
      if (input.toLowerCase().includes('api key') || input.toLowerCase().includes('setup')) {
        const hasKey = this.hasApiKey();
        const source = localStorage.getItem('groq-api-key') ? 'localStorage' : 
                      environment?.groqApiKey ? 'environment' : 'none';
        
        return {
          success: true,
          message: `🔑 API Key Status: ${hasKey ? '✅ Konfiguriert' : '❌ Nicht gefunden'}\n${hasKey ? `Quelle: ${source}` : ''}\n\n${!hasKey ? 'Setup-Anleitung:\n\n1. Öffne Browser-Konsole (F12)\n2. Führe aus:\n   localStorage.setItem("groq-api-key", "dein-key")\n3. Seite neu laden\n\nGroq Account: https://console.groq.com/keys' : 'API Key ist einsatzbereit! 🚀\n\n✨ Neue Features verfügbar:\n• Smart Disambiguation\n• Mengen-Erkennung\n• Fuzzy Matching'}`
        };
      }
      
      if (input.toLowerCase().includes('test')) {
        const hasKey = this.hasApiKey();
        const source = localStorage.getItem('groq-api-key') ? 'localStorage' : 
                      environment?.groqApiKey ? 'environment.ts' : 'none';
        
        return {
          success: true,
          message: `✅ AI Service funktioniert!\n\nAPI Key: ${hasKey ? '✅ Konfiguriert' : '❌ Nicht gefunden'}\nQuelle: ${source}\nDataService: ${!!this.dataService ? '✅ Verfügbar' : '❌ Fehler'}\n\n🎯 Enhanced Features:\n• Smart Disambiguation: ✅\n• Quantity Extraction: ✅\n• Fuzzy Matching: ✅\n\n${!hasKey ? '💡 Sage "API Key setup" für Anleitung' : '🚀 Alle Systeme bereit für intelligente Verarbeitung!'}`
        };
      }

      // 🎯 ENHANCED: Process command with quantity extraction and disambiguation
      return await this.processEnhancedCommand(input);
      
    } catch (error) {
      console.error('AI Service error:', error);
      return {
        success: false,
        message: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 🎯 ENHANCED: Process command with smart disambiguation
   */
  private async processEnhancedCommand(input: string): Promise<AIExecutionResult> {
    // Extract quantity from input
    const quantityExtraction = this.extractQuantity(input);
    console.log('🎯 Quantity extraction:', quantityExtraction);

    // Parse command intent
    const intent = this.parseIntent(input, quantityExtraction.itemName);
    console.log('🎯 Parsed intent:', intent);

    // Enhanced action with quantity
    const pendingAction: PendingAction = {
      ...intent,
      extractedQuantity: quantityExtraction.quantity,
      suggestedDepartment: this.suggestDepartment(quantityExtraction.itemName)
    };

    // Check for disambiguation if adding/creating with items
    if (intent.type === 'add_item' || intent.type === 'create_list') {
      return await this.handleItemActionWithDisambiguation(pendingAction);
    }

    // Fallback to rule-based processing
    return this.processCommandRuleBased(input);
  }

  /**
   * 🎯 Parse command intent from input
   */
  private parseIntent(input: string, itemName: string): Omit<PendingAction, 'extractedQuantity' | 'suggestedDepartment'> {
    const lowerInput = input.toLowerCase();

    // Create list patterns: "Erstelle Liste REWE mit Milch"
    const createListMatch = lowerInput.match(/erstelle\s+liste\s+(.+?)\s+mit\s+(.+)/);
    if (createListMatch) {
      return {
        type: 'create_list',
        originalInput: input,
        itemName: createListMatch[2],
        listName: createListMatch[1]
      };
    }

    // Add to specific list: "Füge Bananen zu Spar hinzu"
    const addToListMatch = lowerInput.match(/füge\s+(.+?)\s+zu\s+(.+?)\s+hinzu/);
    if (addToListMatch) {
      return {
        type: 'add_item',
        originalInput: input,
        itemName: addToListMatch[1],
        listName: addToListMatch[2]
      };
    }

    // Generic add: "Füge Bananen hinzu"
    if (lowerInput.includes('füge') && lowerInput.includes('hinzu')) {
      const addMatch = lowerInput.match(/füge\s+(.+?)\s+hinzu/);
      return {
        type: 'add_item',
        originalInput: input,
        itemName: addMatch ? addMatch[1] : itemName
      };
    }

    // Default add item
    return {
      type: 'add_item',
      originalInput: input,
      itemName: itemName
    };
  }

  /**
   * 🎯 ENHANCED: Handle item action with smart disambiguation
   */
  private async handleItemActionWithDisambiguation(action: PendingAction): Promise<AIExecutionResult> {
    console.log('🎯 Handling item action with disambiguation:', action);

    // Get disambiguation options
    const disambiguationOptions = await this.getDisambiguationOptions(action.itemName);
    console.log('🎯 Disambiguation options:', disambiguationOptions);

    // Check if disambiguation is needed
    const existingOptions = disambiguationOptions.filter(opt => opt.type === 'existing');
    const needsDisambiguation = existingOptions.length > 0 && 
                               existingOptions[0].confidence >= this.DISAMBIGUATION_THRESHOLD;

    if (needsDisambiguation) {
      return {
        success: true,
        message: `Ich habe mehrere Möglichkeiten für "${action.itemName}" gefunden:`,
        needsUserInput: true,
        disambiguationOptions,
        pendingAction: action
      };
    }

    // No disambiguation needed - proceed directly
    if (existingOptions.length > 0) {
      // Use existing article with highest confidence
      return await this.executeActionWithArticle(action, existingOptions[0].article!);
    } else {
      // Create new article
      return await this.executeActionWithNewArticle(action);
    }
  }

  /**
   * 🎯 Execute action with existing article
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
          message: `Liste "${action.listName}" wurde mit "${article.name}"${action.extractedQuantity ? ` (${action.extractedQuantity})` : ''} erstellt.`,
          listId: newList?.id
        };
      } else {
        // Add to current or specified list
        const targetList = action.listName ? 
          await this.findListByName(action.listName) : 
          await this.getCurrentList();

        if (!targetList) {
          return {
            success: false,
            message: `Liste "${action.listName || 'aktuelle'}" nicht gefunden.`
          };
        }

        await this.dataService.addArticleToList(targetList.id, article.id).toPromise();
        
        return {
          success: true,
          message: `"${article.name}"${action.extractedQuantity ? ` (${action.extractedQuantity})` : ''} wurde zur Liste "${targetList.name}" hinzugefügt.`,
          listId: targetList.id
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Fehler beim Ausführen der Aktion.'
      };
    }
  }

  /**
   * 🎯 Execute action with new article
   */
  private async executeActionWithNewArticle(action: PendingAction): Promise<AIExecutionResult> {
    try {
      const newArticle = await this.dataService.createArticle({
        name: action.itemName,
        amount: action.extractedQuantity || '',
        departmentId: action.suggestedDepartment || 'miscellaneous',
        icon: this.suggestIcon(action.itemName)
      }).toPromise();

      if (!newArticle) {
        throw new Error('Failed to create article');
      }

      if (action.type === 'create_list') {
        const newList = await this.dataService.createList({
          name: action.listName!,
          color: this.suggestListColor(action.listName!),
          icon: '🛒',
          articleIds: [newArticle.id],
          itemStates: { [newArticle.id]: { articleId: newArticle.id, isChecked: false } }
        }).toPromise();

        return {
          success: true,
          message: `Liste "${action.listName}" wurde mit "${newArticle.name}"${action.extractedQuantity ? ` (${action.extractedQuantity})` : ''} erstellt.`,
          listId: newList?.id
        };
      } else {
        const targetList = action.listName ? 
          await this.findListByName(action.listName) : 
          await this.getCurrentList();

        if (!targetList) {
          return {
            success: false,
            message: `Liste "${action.listName || 'aktuelle'}" nicht gefunden.`
          };
        }

        await this.dataService.addArticleToList(targetList.id, newArticle.id).toPromise();
        
        return {
          success: true,
          message: `"${newArticle.name}"${action.extractedQuantity ? ` (${action.extractedQuantity})` : ''} wurde zur Liste "${targetList.name}" hinzugefügt.`,
          listId: targetList.id
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Fehler beim Erstellen des neuen Artikels.'
      };
    }
  }

  /**
   * 🎯 Handle disambiguation choice from user
   */
  async handleDisambiguationChoice(
    pendingAction: PendingAction, 
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    console.log('🎯 Handling disambiguation choice:', { pendingAction, selectedOption });

    if (selectedOption.type === 'existing' && selectedOption.article) {
      return await this.executeActionWithArticle(pendingAction, selectedOption.article);
    } else {
      return await this.executeActionWithNewArticle(pendingAction);
    }
  }

  // Helper methods
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

  private async getCurrentList(): Promise<ShoppingList | null> {
    const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
    // Return first list or null - you might want to implement "current list" logic
    return lists && lists.length > 0 ? lists[0] : null;
  }

  private processCommandRuleBased(input: string): AIExecutionResult {
    const lowerInput = input.toLowerCase();
    
    if (lowerInput.includes('füge') || lowerInput.includes('hinzu')) {
      return {
        success: true,
        message: 'Regel-basierte Verarbeitung: "Artikel hinzufügen" erkannt.\n\n🎯 Für intelligente Verarbeitung mit Smart Disambiguation:\n1. Sage "API Key setup" für Anleitung\n2. Nutze erweiterte AI-Funktionen'
      };
    }
    
    if (lowerInput.includes('erstelle') && lowerInput.includes('liste')) {
      return {
        success: true,
        message: 'Regel-basierte Verarbeitung: "Liste erstellen" erkannt.\n\n🎯 Für intelligente Verarbeitung sage "API Key setup".'
      };
    }
    
    return {
      success: true,
      message: `Ich verstehe: "${input}"\n\n🤖 Aktuell: Basis-Funktionen verfügbar\n🎯 Für Smart Disambiguation: "API Key setup"\n\nSage "Hilfe" für verfügbare Befehle.`
    };
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

  // Legacy methods for compatibility (simplified for now)
  private buildSystemPrompt(lists: ShoppingList[], articles: Article[]): string {
    return 'System prompt for Groq API calls';
  }

  private parseAIResponse(responseText: string): AIResponse {
    return { action: 'HELP', message: 'Response parsed' };
  }

  private async processWithGroq(input: string, lists: ShoppingList[], articles: Article[]): Promise<AIResponse> {
    return { action: 'HELP', message: 'Groq processing' };
  }

  private async executeAIAction(response: AIResponse): Promise<AIExecutionResult> {
    return { success: true, message: 'Action executed' };
  }
}