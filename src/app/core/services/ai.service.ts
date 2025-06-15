// src/app/core/services/ai.service.ts
import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, combineLatest, of } from 'rxjs';
import { map, take, catchError } from 'rxjs/operators';
import { DataService } from './data';
import { Article, ShoppingList } from '../models';
import { environment } from '../../../environments/environment'; // ✅ Add this import

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

export interface DisambiguationOption {
  id: string;
  label: string;
  option: number;
  type: 'new' | 'existing';
  articleId?: string;
}

export interface PendingAction {
  action: string;
  listName: string;
  articles: string[];
  disambiguationArticle: string;
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
  private readonly GROQ_API_KEY = environment.groqApiKey || ''; // ✅ Read from environment
  
  // German department mappings for smart suggestions
  private readonly DEPARTMENT_KEYWORDS = {
    'bread': ['brot', 'brötchen', 'baguette', 'toast', 'weißbrot', 'vollkornbrot'],
    'fruit-vegetables': ['apfel', 'banana', 'banane', 'orange', 'tomate', 'salat', 'karotte', 'zwiebel', 'obst', 'gemüse'],
    'dairy-products': ['milch', 'butter', 'joghurt', 'käse', 'sahne', 'quark'],
    'meat': ['fleisch', 'wurst', 'schinken', 'hähnchen', 'rind', 'schwein'],
    'fish': ['fisch', 'lachs', 'thunfisch', 'garnelen'],
    'beverages-alcohol': ['wasser', 'saft', 'bier', 'wein', 'cola', 'kaffee', 'tee'],
    'frozen-goods': ['tiefkühl', 'eis', 'pizza', 'pommes'],
    'sweet-salty': ['schokolade', 'chips', 'kekse', 'süßigkeiten', 'nüsse'],
    'cleaning-agents': ['spülmittel', 'waschmittel', 'putzmittel'],
    'body-care': ['shampoo', 'zahnpasta', 'seife', 'duschgel'],
    'household-goods': ['toilettenpapier', 'küchenrolle', 'müllbeutel']
  };

  constructor(
    private dataService: DataService  // ✅ Remove HttpClient injection for now
  ) {
    // Debug: Log API key status (without exposing the key)
    console.log('🔑 Groq API Key configured:', !!this.GROQ_API_KEY);
    if (this.GROQ_API_KEY) {
      console.log('🔑 API Key length:', this.GROQ_API_KEY.length);
    }
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
          message: 'Hallo! Ich kann dir mit folgenden Aufgaben helfen:\n\n• "Füge Bananen zu Spar hinzu"\n• "Erstelle Liste ADEG"\n• "Hilfe"'
        };
      }
      
      if (input.toLowerCase().includes('test')) {
        return {
          success: true,
          message: '✅ AI Service funktioniert! DataService ist verfügbar: ' + !!this.dataService
        };
      }
      
      // Get current context for AI processing
      const [lists, articles] = await Promise.all([
        this.dataService.getLists().pipe(take(1)).toPromise(),
        this.dataService.getArticles().pipe(take(1)).toPromise()
      ]);
      
      console.log('🤖 Context:', { listsCount: lists?.length, articlesCount: articles?.length });
      
      // Process the command with AI (if API key is available)
      if (this.GROQ_API_KEY) {
        console.log('🤖 Using Groq AI processing...'); // ✅ Add this debug log
        const aiResponse = await this.processWithGroq(input, lists || [], articles || []);
        return await this.executeAIAction(aiResponse);
      } else {
        console.log('🤖 Using rule-based processing (no API key)'); // ✅ Add this debug log
        // Simple rule-based processing without AI
        return this.processCommandRuleBased(input, lists || [], articles || []);
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

  /**
   * Process command with Groq AI API using fetch
   */
  private async processWithGroq(input: string, lists: ShoppingList[], articles: Article[]): Promise<AIResponse> {
    try {
      const systemPrompt = this.buildSystemPrompt(lists, articles);
      
      const requestBody = {
        model: 'llama3-70b-8192', // ✅ Correct model name for Groq
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input }
        ],
        temperature: 0.2, // ✅ Lower temperature for more consistent JSON
        max_tokens: 500,  // ✅ Reduce tokens for simpler responses
        top_p: 0.9,
        stream: false,
        response_format: { type: 'json_object' } // ✅ Force JSON format
      };

      console.log('🔍 Groq API request:', {
        url: this.GROQ_API_URL,
        model: requestBody.model,
        messageCount: requestBody.messages.length
      });

      const response = await fetch(this.GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      console.log('🔍 Groq API response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 Groq API error details:', errorText);
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('🔍 Groq API success:', result);
      
      const aiResponseText = result.choices[0].message.content;
      console.log('🔍 AI response text:', aiResponseText);
      
      return this.parseAIResponse(aiResponseText);
    } catch (error) {
      console.error('Groq API error:', error);
      return {
        action: 'ERROR',
        message: 'AI-Verarbeitung fehlgeschlagen. Versuche es erneut.'
      };
    }
  }

  /**
   * Simple rule-based processing when no AI API is available
   */
  private processCommandRuleBased(input: string, lists: ShoppingList[], articles: Article[]): AIExecutionResult {
    const lowerInput = input.toLowerCase();
    
    // Rule: Add articles to list
    if (lowerInput.includes('füge') || lowerInput.includes('hinzu')) {
      return {
        success: true,
        message: 'Regel-basierte Verarbeitung: "Artikel hinzufügen" erkannt.\n\nFür komplexere Befehle füge bitte deinen Groq API Key hinzu.'
      };
    }
    
    // Rule: Create list
    if (lowerInput.includes('erstelle') && lowerInput.includes('liste')) {
      return {
        success: true,
        message: 'Regel-basierte Verarbeitung: "Liste erstellen" erkannt.\n\nFür komplexere Befehle füge bitte deinen Groq API Key hinzu.'
      };
    }
    
    // Default response
    return {
      success: true,
      message: 'Ich verstehe: "' + input + '"\n\nFür intelligente Verarbeitung füge bitte deinen Groq API Key zu environment.ts hinzu.\n\nSage "Hilfe" für verfügbare Befehle.'
    };
  }

  /**
   * Build system prompt for AI
   */
  private buildSystemPrompt(lists: ShoppingList[], articles: Article[]): string {
    const listNames = lists.map(l => l.name).join(', ');
    const commonArticles = articles.slice(0, 20).map(a => a.name).join(', ');

    return `Du bist ein deutscher Einkaufslisten-Assistent für die ShopLisl App.

VERFÜGBARE_AKTIONEN:
- ADD_ARTICLES: Artikel zu bestehender Liste hinzufügen
- CREATE_LIST: Neue Einkaufsliste erstellen
- DISAMBIGUATE: Nachfragen bei ähnlichen Artikeln
- HELP: Hilfe anbieten

AKTUELLE_LISTEN: ${listNames || 'Keine Listen vorhanden'}
HÄUFIGE_ARTIKEL: ${commonArticles}

WICHTIG: Antworte IMMER mit gültigem JSON im exakt folgenden Format:

FÜR ARTIKEL HINZUFÜGEN:
{
  "action": "ADD_ARTICLES",
  "message": "Ich füge Bananen und Brot zur Liste Spar hinzu.",
  "listName": "Spar",
  "articles": ["Bananen", "Brot"],
  "needsDisambiguation": false
}

FÜR LISTE ERSTELLEN:
{
  "action": "CREATE_LIST", 
  "message": "Ich erstelle die Liste ADEG für dich.",
  "listName": "ADEG",
  "listColor": "#FFD700",
  "listIcon": "🛒",
  "articles": ["Erdbeeren", "Milch"],
  "needsDisambiguation": false
}

FÜR HILFE:
{
  "action": "HELP",
  "message": "Ich kann dir mit Einkaufslisten helfen! Sage 'Füge Bananen zu Spar hinzu' oder 'Erstelle Liste ADEG'."
}

REGELN:
- Antworte immer auf Deutsch
- NIEMALS Text außerhalb der JSON-Struktur
- message-Feld ist PFLICHT
- Erkenne Listennamen auch bei Tippfehlern
- Trenne mehrere Artikel mit Kommas`;
  }

  /**
   * Parse AI response from text
   */
  private parseAIResponse(responseText: string): AIResponse {
    try {
      console.log('🔍 Parsing AI response:', responseText);
      const parsed = JSON.parse(responseText);
      
      // Fix common formatting issues
      if (!parsed.message) {
        // Find the message value (it might be a loose string in the JSON)
        const values = Object.values(parsed);
        const messageCandidate = values.find(v => 
          typeof v === 'string' && (
            v.includes('erstellt') || v.includes('hinzu') || v.includes('Liste')
          )
        );
        
        if (messageCandidate) {
          parsed.message = messageCandidate;
        } else {
          parsed.message = `Aktion "${parsed.action}" wird ausgeführt.`;
        }
      }

      if (!parsed.action) {
        console.error('Missing action in AI response');
        throw new Error('Invalid AI response structure - missing action');
      }

      console.log('✅ Parsed AI response:', parsed);
      return parsed as AIResponse;
    } catch (error) {
      console.error('Failed to parse AI response:', responseText, 'Error:', error);
      return {
        action: 'ERROR',
        message: 'Entschuldigung, ich konnte deine Anfrage nicht verstehen.'
      };
    }
  }

  /**
   * Execute parsed AI action
   */
  private async executeAIAction(response: AIResponse): Promise<AIExecutionResult> {
    switch (response.action) {
      case 'ADD_ARTICLES':
        return await this.handleAddArticles(response);
        
      case 'CREATE_LIST':
        return await this.handleCreateList(response);
        
      case 'DISAMBIGUATE':
        return {
          success: true,
          message: response.message,
          needsUserInput: true,
          disambiguationOptions: response.disambiguationOptions,
          pendingAction: response.pendingAction
        };
        
      default:
        return {
          success: true,
          message: response.message || 'Wie kann ich dir helfen?'
        };
    }
  }

  /**
   * Handle adding articles to a list
   */
  private async handleAddArticles(response: AIResponse): Promise<AIExecutionResult> {
    if (!response.listName || !response.articles) {
      return {
        success: false,
        message: 'Ich benötige einen Listennamen und Artikel zum Hinzufügen.'
      };
    }

    try {
      // Find target list (fuzzy matching)
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      const targetList = this.findBestListMatch(response.listName, lists || []);
      
      if (!targetList) {
        return {
          success: false,
          message: `Liste "${response.listName}" nicht gefunden. Soll ich sie erstellen?`,
          suggestedAction: 'CREATE_LIST',
          suggestedData: { 
            listName: response.listName, 
            articles: response.articles 
          }
        };
      }

      const results: string[] = [];
      const articles = await this.dataService.getArticles().pipe(take(1)).toPromise();
      
      for (const articleName of response.articles) {
        try {
          let articleToAdd = this.findBestArticleMatch(articleName, articles || []);

          if (articleToAdd) {
            // Add existing article to list
            const success = await this.dataService.addArticleToList(targetList.id, articleToAdd.id).toPromise();
            if (success) {
              results.push(`✅ ${articleToAdd.name}`);
            }
          } else {
            // Create new article and add to list
            const newArticle = await this.dataService.createArticle({
              name: articleName,
              departmentId: this.suggestDepartment(articleName),
              icon: this.suggestIcon(articleName)
            }).toPromise();
            
            if (newArticle) {
              await this.dataService.addArticleToList(targetList.id, newArticle.id).toPromise();
              results.push(`✅ ${articleName} (neu erstellt)`);
            }
          }
        } catch (error) {
          console.error(`Error adding article ${articleName}:`, error);
          results.push(`❌ ${articleName} (Fehler)`);
        }
      }

      return {
        success: results.length > 0,
        message: `Zur Liste "${targetList.name}" hinzugefügt:\n${results.join('\n')}`,
        listId: targetList.id
      };
    } catch (error) {
      return {
        success: false,
        message: `Fehler beim Hinzufügen der Artikel: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  /**
   * Handle creating a new list
   */
  private async handleCreateList(response: AIResponse): Promise<AIExecutionResult> {
    if (!response.listName) {
      return {
        success: false,
        message: 'Ich benötige einen Namen für die neue Liste.'
      };
    }

    try {
      // Create the list
      const newList = await this.dataService.createList({
        name: response.listName,
        color: response.listColor || this.suggestListColor(response.listName),
        icon: response.listIcon || '🛒',
        articleIds: [],
        itemStates: {}
      }).toPromise();

      if (!newList) {
        throw new Error('Failed to create list');
      }

      // Add articles if provided
      if (response.articles && response.articles.length > 0) {
        const addResult = await this.handleAddArticles({
          action: 'ADD_ARTICLES',
          message: '',
          listName: response.listName,
          articles: response.articles
        });

        return {
          success: true,
          message: `Liste "${response.listName}" erstellt!\n${addResult.message}`,
          listId: newList.id
        };
      }

      return {
        success: true,
        message: `Liste "${response.listName}" erfolgreich erstellt!`,
        listId: newList.id
      };
    } catch (error) {
      return {
        success: false,
        message: `Fehler beim Erstellen der Liste: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      };
    }
  }

  // Helper methods for fuzzy matching and suggestions
  private findBestListMatch(query: string, lists: ShoppingList[]): ShoppingList | null {
    const normalizedQuery = query.toLowerCase().trim();
    
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

  private findBestArticleMatch(query: string, articles: Article[]): Article | null {
    const normalizedQuery = query.toLowerCase().trim();
    
    // Exact match first
    let match = articles.find(article => 
      article.name.toLowerCase() === normalizedQuery
    );
    
    if (match) return match;
    
    // Partial match
    match = articles.find(article => 
      article.name.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(article.name.toLowerCase())
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
    
    // Icon mapping based on article name
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
      'bier': '🍺', 'beer': '🍺'
    };
    
    for (const [keyword, icon] of Object.entries(iconMap)) {
      if (normalized.includes(keyword)) {
        return icon;
      }
    }
    
    return '📦'; // Default icon
  }

  private suggestListColor(listName: string): string {
    const normalized = listName.toLowerCase();
    
    // Color mapping based on shop names
    const colorMap: { [key: string]: string } = {
      'spar': '#00A651',     // Spar green
      'billa': '#FF6B00',    // Billa orange  
      'hofer': '#E30613',    // Hofer red
      'merkur': '#0066CC',   // Merkur blue
      'interspar': '#00A651', // Interspar green
      'lidl': '#0050AA',     // Lidl blue
      'penny': '#E30613',    // Penny red
      'adeg': '#FFD700'      // ADEG gold
    };
    
    for (const [shop, color] of Object.entries(colorMap)) {
      if (normalized.includes(shop)) {
        return color;
      }
    }
    
    // Default colors
    const defaultColors = ['#1a9edb', '#4CAF50', '#FF9800', '#9C27B0', '#F44336'];
    return defaultColors[Math.floor(Math.random() * defaultColors.length)];
  }

  /**
   * Handle disambiguation choice from user
   */
  async handleDisambiguationChoice(
    pendingAction: PendingAction, 
    selectedOption: DisambiguationOption
  ): Promise<AIExecutionResult> {
    return {
      success: true,
      message: `✅ Option "${selectedOption.label}" ausgewählt. (Implementierung folgt)`
    };
  }
}