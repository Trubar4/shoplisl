//src/app/core/services/ai/smart-suggestions.service.ts

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import { DataService } from '../data';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SmartSuggestionsService {
  private readonly GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(private dataService: DataService) {}

  /**
   * Get smart department and icon suggestions using AI
   * Token usage: ~30-50 tokens per request
   */
  async getSmartSuggestions(itemName: string): Promise<{
    departmentId: string;
    icon: string;
    confidence: number;
  } | null> {
    if (!this.hasApiKey()) {
      console.log('🎯❌ No API key available for smart suggestions');
      return null;
    }

    try {
      console.log('🎯🤖 Getting AI smart suggestions for:', itemName);
      
      // Get user's existing departments and popular icons for personalization
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

        const prompt = `German item: "${itemName}"

        Available departments:
        - bread (Brot)
        - fruit-vegetables (Obst & Gemüse)  
        - sausage-cheese-counter (Wurst & Käse Theke)
        - fridge-meat (Kühlschrank inkl. Fleisch etc.)
        - fish (Fisch)
        - dairy-products (Milchprodukte)
        - spices-oils (Gewürze & Öle)
        - noodles-rice (Nudeln & Reis)
        - tins-jars (Konserven & Gläser)
        - pastries (Backwaren)
        - beverages-alcohol (Getränke & Alkohol)
        - frozen-goods (Tiefkühlwaren)
        - sweet-salty (Süßes & Salziges)
        - international (International)
        - body-care (Körperpflege)
        - cleaning-agents (Reinigungsmittel)
        - household-goods (Haushaltswaren)
        - stationery (Schreibwaren)
        - breakfast (Frühstück)
        - baby (Baby)
        - pet-supplies (Tierbedarf)
        - season (Saison)
        - medicine (Medizin)
        - drugstore (Drogerie)
        - miscellaneous (Sonstiges)
        
        Return ONLY this JSON format:
        {"dept":"body-care","icon":"🧴"}`;

      console.log('🎯🤖 Sending AI request for:', itemName);
      console.log('🎯🤖 User popular icons:', topIcons);
      
      const response = await this.callGroqAPI(prompt);
      
      console.log('🎯🤖 Raw AI response:', response);
      
      // Parse response
      const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const result = JSON.parse(cleanResponse);
      
      console.log('🎯🤖 Parsed AI result:', result);
      
      if (result.dept && result.icon) {
        const suggestions = {
          departmentId: result.dept,
          icon: result.icon,
          confidence: result.conf || 0.8
        };
        
        console.log('✅🤖 AI SUGGESTIONS SUCCESS:', suggestions);
        return suggestions;
      }
      
      console.log('🎯❌ AI response missing dept or icon');
      return null;
      
    } catch (error) {
      console.error('🎯❌ AI suggestions failed:', error);
      return null;
    }
  }

  async suggestDepartment(itemName: string): Promise<string> {
    console.log('🎯🤖 Getting AI department suggestion for:', itemName);
    
    try {
      const suggestions = await this.getSmartSuggestions(itemName);
      if (suggestions?.departmentId) {
        console.log('✅🤖 AI department suggestion:', suggestions.departmentId);
        return suggestions.departmentId;
      }
    } catch (error) {
      console.log('🎯❌ AI department suggestion failed:', error);
    }
    
    console.log('🎯📦 Using fallback department suggestion for:', itemName);
    return this.getFallbackDepartment(itemName);
  }

  async suggestIcon(itemName: string): Promise<string> {
    console.log('🎯🤖 Getting AI icon suggestion for:', itemName);
    
    try {
      const suggestions = await this.getSmartSuggestions(itemName);
      if (suggestions?.icon) {
        console.log('✅🤖 AI icon suggestion:', suggestions.icon);
        return suggestions.icon;
      }
    } catch (error) {
      console.log('🎯❌ AI icon suggestion failed:', error);
    }
    
    console.log('🎯📦 Using fallback icon suggestion for:', itemName);
    return this.getFallbackIcon(itemName);
  }

  private getFallbackDepartment(itemName: string): string {
    const lowerName = itemName.toLowerCase();
    
    if (/milch|käse|joghurt|butter|sahne/.test(lowerName)) return 'dairy-products';
    if (/brot|nudeln|reis|toast/.test(lowerName)) return 'bread';
    if (/fleisch|wurst|schinken|fisch|lachs/.test(lowerName)) return 'meat-fish';
    if (/apfel|gurke|tomate|salat|banane/.test(lowerName)) return 'fruit-vegetables';
    if (/bier|wein|wasser|saft|cola/.test(lowerName)) return 'beverages-alcohol';
    if (/seife|shampoo|putzen|spülen/.test(lowerName)) return 'household-goods';
    
    return 'miscellaneous';
  }

  private getFallbackIcon(itemName: string): string {
    const lowerName = itemName.toLowerCase();
    
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
    const hasKey = !!key && key.length > 20;
    
    console.log('🎯🔑 API Key check:', hasKey ? `Found ${key.length} chars` : 'Not found');
    return hasKey;
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
          content: prompt + '\n\nIMPORTANT: Reply with ONLY the JSON object, no explanations or additional text.'
        }
      ],
      temperature: 0.1,
      max_tokens: 50 // Very small to force concise response
    };
    
    console.log('🎯🤖 API Request:', { model: requestBody.model, prompt: prompt.substring(0, 100) });
    
    try {
      const response = await fetch(this.GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
  
      console.log('🎯🤖 API Response Status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('🎯❌ API Error Response:', errorText);
        throw new Error(`Groq API Error: ${response.status}`);
      }
  
      const data = await response.json();
      const responseText = data.choices[0]?.message?.content || '';
      
      console.log('🎯🤖 API Response Text:', responseText);
      
      // ENHANCED: Extract JSON from response even if there's extra text
      const jsonMatch = responseText.match(/\{[^}]*"dept"[^}]*\}/);
      if (jsonMatch) {
        console.log('🎯🤖 Extracted JSON:', jsonMatch[0]);
        return jsonMatch[0];
      }
      
      return responseText;
      
    } catch (error) {
      console.error('🎯❌ Groq API call failed:', error);
      throw error;
    }
  }
}