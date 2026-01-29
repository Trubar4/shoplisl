// src/app/core/services/ai/smart-suggestions.service.ts - FIXED VERSION
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import { DataService } from '../data.service';
import { environment } from '../../../../environments/environment';
import { LoggerService } from '../logger.service';

@Injectable({
  providedIn: 'root'
})
export class SmartSuggestionsService {
  private readonly GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(
    private dataService: DataService,
    private logger: LoggerService
  ) {}

  /**
   * FIXED: Single AI call for both department and icon
   */
  async getSmartSuggestions(itemName: string): Promise<{
    departmentId: string;
    icon: string;
    confidence: number;
  } | null> {
    if (!this.hasApiKey()) {
      this.logger.debug('ai', 'No API key available for smart suggestions');
      return null;
    }

    try {
      this.logger.debug('ai', `Getting smart suggestions for: ${itemName}`);
      
      // Get user context for personalization (but don't log details)
      const articles = await this.dataService.getArticles().pipe(take(1)).toPromise();
      const userDepartments = new Set<string>();
      const iconCounts = new Map<string, number>();
      
      articles?.forEach(article => {
        if (article.departmentId) userDepartments.add(article.departmentId);
        if (article.icon) iconCounts.set(article.icon, (iconCounts.get(article.icon) || 0) + 1);
      });

      const topIcons = Array.from(iconCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([icon]) => icon)
        .join(' ');

      // ENHANCED: Better prompt with examples and clearer instructions
      const prompt = `You are a German grocery shopping assistant. Classify this item:

Item: "${itemName}"

IMPORTANT: Use ONLY these exact department IDs (not German translations):

- tins-jars: Konserven, Essiggurken, Oliven, Marmelade, Honig, Tomatenmark
- fruit-vegetables: Obst, Gemüse, Kräuter, Petersilie, Basilikum
- dairy-products: Milch, Käse, Joghurt, Butter, Sahne
- sausage-cheese-counter: Wurst, Schinken, Aufschnitt, Käse von der Theke
- fridge-meat: Frisches Fleisch, Hähnchen, Hack
- bread: Brot, Brötchen, Toast, Backwaren
- noodles-rice: Nudeln, Reis, Couscous, Quinoa
- spices-oils: Gewürze, Öl, Essig, getrocknete Kräuter
- beverages-alcohol: Getränke, Wasser, Bier, Wein, Saft
- frozen-goods: Tiefkühl, Eis, TK-Gemüse
- sweet-salty: Süßigkeiten, Chips, Schokolade, Nüsse
- household-goods: Putzmittel, Klopapier, Batterien
- body-care: Shampoo, Zahnpasta, Seife, Deo
- miscellaneous: Alles andere

Examples:
- "Essiggurken" → {"dept":"tins-jars","icon":"🥒"}
- "Milch" → {"dept":"dairy-products","icon":"🥛"}
- "Äpfel" → {"dept":"fruit-vegetables","icon":"🍎"}
- "frischer Koriander" → {"dept":"fruit-vegetables","icon":"🌿"}
- "Shampoo" → {"dept":"body-care","icon":"🧴"}

Popular user icons: ${topIcons || '🥛🍞🧀🍎🥩🌽🍉🥖🥬🍔🥐🍗🍚🍫🍺🍋🥔'}

CRITICAL: The "dept" field must be one of the exact IDs above, never a German word.

Return ONLY valid JSON:
{"dept":"fruit-vegetables","icon":"🌿"}`;

      this.logger.debug('ai', `Sending single AI request for: ${itemName}`);
      
      const response = await this.callGroqAPI(prompt);
      
      this.logger.debug('ai', `AI response received`, { response: response.substring(0, 100) });
      
      // Parse response more robustly
      const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      this.logger.debug('ai', Raw AI response:', cleanResponse);
      const result = JSON.parse(cleanResponse);
      this.logger.debug('ai', Parsed result:', result);

      if (result.dept && result.icon) {
        const suggestions = {
          departmentId: result.dept,
          icon: result.icon,
          confidence: result.conf || 0.8
        };
        
        this.logger.debug('ai', Final suggestions object:', suggestions); // ADD THIS LINE
        this.logger.info('ai', `Smart suggestions success: ${itemName} → ${result.dept}, ${result.icon}`);
        return suggestions;
      }
      
      this.logger.warn('ai', 'AI response missing dept or icon', result);
      return null;
      
    } catch (error) {
      this.logger.error('ai', 'Smart suggestions failed', error);
      return null;
    }
  }

  async suggestDepartment(itemName: string): Promise<string> {
    this.logger.debug('ai', `Getting department suggestion for: ${itemName}`);
    
    try {
      const suggestions = await this.getSmartSuggestions(itemName);
      if (suggestions?.departmentId) {
        this.logger.debug('ai', `AI department: ${suggestions.departmentId}`);
        return suggestions.departmentId;
      }
    } catch (error) {
      this.logger.debug('ai', 'AI department suggestion failed, using fallback');
    }
    
    const fallback = this.getFallbackDepartment(itemName);
    this.logger.debug('ai', `Fallback department: ${fallback}`);
    return fallback;
  }

  async suggestIcon(itemName: string): Promise<string> {
    this.logger.debug('ai', `Getting icon suggestion for: ${itemName}`);
    
    try {
      const suggestions = await this.getSmartSuggestions(itemName);
      if (suggestions?.icon) {
        this.logger.debug('ai', `AI icon: ${suggestions.icon}`);
        return suggestions.icon;
      }
    } catch (error) {
      this.logger.debug('ai', 'AI icon suggestion failed, using fallback');
    }
    
    const fallback = this.getFallbackIcon(itemName);
    this.logger.debug('ai', `Fallback icon: ${fallback}`);
    return fallback;
  }

  /**
   * ENHANCED: Better fallback logic with more German food items
   */
  private getFallbackDepartment(itemName: string): string {
    const lowerName = itemName.toLowerCase();
    
    // Specific pickled/canned items first
    if (/essiggurken|cornichons|gewürzgurken|sauergurken|eingelegte|konserve/.test(lowerName)) return 'tins-jars';
    if (/oliven|kapern|tomatenmark|passierte|bohnen|mais|erbsen/.test(lowerName)) return 'tins-jars';
    if (/marmelade|konfitüre|honig|nutella|erdnussbutter/.test(lowerName)) return 'tins-jars';
    
    // Fresh items
    if (/milch|käse|joghurt|butter|sahne|quark|frischkäse/.test(lowerName)) return 'dairy-products';
    if (/brot|nudeln|reis|toast|spaghetti|penne/.test(lowerName)) return 'bread';
    if (/fleisch|wurst|schinken|fisch|lachs|hähnchen/.test(lowerName)) return 'fridge-meat';
    if (/apfel|gurke|tomate|salat|banane|karotte/.test(lowerName)) return 'fruit-vegetables';
    if (/bier|wein|wasser|saft|cola|fanta/.test(lowerName)) return 'beverages-alcohol';
    if (/seife|shampoo|putzen|spülen|zahnpasta/.test(lowerName)) return 'household-goods';
    
    return 'miscellaneous';
  }

  /**
   * ENHANCED: Better fallback icons
   */
  private getFallbackIcon(itemName: string): string {
    const lowerName = itemName.toLowerCase();
    
    // Specific items first
    if (/essiggurken|gewürzgurken|sauergurken/.test(lowerName)) return '🥒';
    if (/oliven/.test(lowerName)) return '🫒';
    if (/tomatenmark/.test(lowerName)) return '🍅';
    if (/honig/.test(lowerName)) return '🍯';
    if (/marmelade|konfitüre/.test(lowerName)) return '🍓';
    
    // General categories
    if (/milch/.test(lowerName)) return '🥛';
    if (/brot/.test(lowerName)) return '🍞';
    if (/käse/.test(lowerName)) return '🧀';
    if (/apfel/.test(lowerName)) return '🍎';
    if (/banane/.test(lowerName)) return '🍌';
    if (/bier/.test(lowerName)) return '🍺';
    if (/wein/.test(lowerName)) return '🍷';
    if (/fleisch/.test(lowerName)) return '🥩';
    if (/fisch/.test(lowerName)) return '🐟';
    if (/ei/.test(lowerName)) return '🥚';
    
    return '📦';
  }

  private hasApiKey(): boolean {
    const localStorageKey = localStorage.getItem('groq-api-key');
    const environmentKey = environment?.groqApiKey;
    const key = localStorageKey || environmentKey || '';
    return !!key && key.length > 20;
  }

  private getSecureApiKey(): string {
    const localStorageKey = localStorage.getItem('groq-api-key');
    const environmentKey = environment?.groqApiKey;
    return localStorageKey || environmentKey || '';
  }

  private async callGroqAPI(prompt: string): Promise<string> {
    const apiKey = this.getSecureApiKey();
    
    const requestBody = {
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'user',
          content: prompt + '\n\nIMPORTANT: Reply with ONLY the JSON object, no explanations.'
        }
      ],
      temperature: 0.1,
      max_tokens: 50
    };
    
    try {
      const response = await fetch(this.GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('ai', `API Error: ${response.status}`, errorText);
        throw new Error(`Groq API Error: ${response.status}`);
      }
  
      const data = await response.json();
      const responseText = data.choices[0]?.message?.content || '';
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[^}]*"dept"[^}]*\}/);
      if (jsonMatch) {
        return jsonMatch[0];
      }
      
      return responseText;
      
    } catch (error) {
      this.logger.error('ai', 'Groq API call failed', error);
      throw error;
    }
  }
}