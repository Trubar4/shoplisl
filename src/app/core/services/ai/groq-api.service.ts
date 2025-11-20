// src/app/core/services/ai/groq-api.service.ts
import { Injectable } from '@angular/core';
import { ApiKeyStatus } from './ai-models';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class GroqApiService {
  private readonly GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
  private readonly MODEL = 'llama-3.1-8b-instant';

  constructor() {
    this.logApiKeyStatus();
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

  validateApiKey(apiKey: string): boolean {
    return apiKey.startsWith('gsk_') && apiKey.length > 20;
  }

  /**
   * Get user-friendly message about missing API key with setup instructions
   */
  getNoApiKeyMessage(): string {
    return `ℹ️ <strong>Tipp:</strong> Für komplexe Rezepte empfehle ich die Groq API (kostenlos).<br><br>` +
           `<strong>Vorteile:</strong><br>` +
           `• Automatische Erkennung von Abschnitten (Teig, Soße, etc.)<br>` +
           `• Besser bei Spezialzeichen (*, •, >>>, ---)<br>` +
           `• Genauere Mengenangaben (Type 405, 3,5%, etc.)<br><br>` +
           `<strong>API-Schlüssel einrichten:</strong><br>` +
           `1. Besuche <a href="https://console.groq.com" target="_blank">console.groq.com</a><br>` +
           `2. Erstelle einen kostenlosen Account<br>` +
           `3. Generiere einen API-Schlüssel (beginnt mit "gsk_")<br>` +
           `4. Öffne die Browser-Konsole (F12)<br>` +
           `5. Führe aus: <code>localStorage.setItem('groq-api-key', 'gsk_...')</code><br>` +
           `6. Lade die App neu<br><br>` +
           `<em>Hinweis: Der API-Schlüssel bleibt lokal in deinem Browser gespeichert.</em>`;
  }

  // ========================================
  // API CALLS
  // ========================================

  async callGroqAPI(prompt: string, temperature: number = 0.1, maxTokens: number = 2000): Promise<string> {
    const apiKey = this.getSecureApiKey();
    
    if (!apiKey) {
      throw new Error('No API key configured');
    }
    
    const requestBody = {
      model: this.MODEL,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: temperature,
      max_tokens: maxTokens
    };
    
    console.log('🔑 API Request:', {
      model: requestBody.model,
      temperature: requestBody.temperature,
      max_tokens: requestBody.max_tokens,
      prompt_length: prompt.length
    });
    
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
        console.error('🔑 API Error Response:', errorText);
        throw new Error(`Groq API Fehler: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '';
      
    } catch (error) {
      console.error('🔑 Groq API call failed:', error);
      throw error;
    }
  }

  // ========================================
  // SPECIALIZED API CALLS
  // ========================================

  async standardizeRecipeIngredients(
    rawRecipeText: string,
    targetList?: string
  ): Promise<string> {
    console.log('🍳 Standardizing recipe ingredients with AI:', rawRecipeText.substring(0, 100));

    const cleanedText = this.cleanRawRecipeText(rawRecipeText);

    const prompt = `Konvertiere diese deutsche Zutatenliste in ein standardisiertes Format.

  EINGABE: ${cleanedText}

  REGELN:
  - Nur echte Zutaten mit Mengen extrahieren
  - Format: "MENGE EINHEIT ZUTAT" (z.B. "2 EL Öl", nicht "Öl 2 EL")
  - Deutsche Dezimalzahlen: 0,5 nicht 0.5 (Komma, nicht Punkt!)
  - Deutsche Einheiten: g, kg, ml, l, EL, TL, Prise, Stück
  - KRITISCH: ÄNDERE NIEMALS Mengenangaben - übernimm sie EXAKT wie angegeben
  - KRITISCH: Behalte ALLE Produktspezifikationen (z.B. "3,5%", "Type 405", "mittelgroße", "gehackt", "extra virgin")
  - KRITISCH: Verwechsle NICHT Produktspezifikationen (wie "3,5%") mit Mengenangaben
  - Behalte beschreibende Adjektive (weiche, frische, große, etc.)
  - Bei Dezimalzahlen in Mengen: IMMER mit 0 beginnen (0,5l nicht ,5l)
  - Ignoriere Abschnittsüberschriften (Für den Teig, Für die Soße, etc.)
  - Ignoriere Formatierungszeichen (*, -, •, >>>, etc.)
  - WICHTIG: Gib ALLE Zutaten in EINER Zeile aus, getrennt durch Semikolon

  BEISPIELE MIT PRODUKTSPEZIFIKATIONEN UND EXAKTEN MENGEN:
  "400ml Vollmilch 3,5%" → "400 ml Vollmilch 3,5%" (EXAKT 400 ml, NICHT 1 l!)
  "500g Weizenmehl Type 405" → "500 g Weizenmehl Type 405" (EXAKT 500 g!)
  "2 mittelgroße Eier" → "2 Stück mittelgroße Eier" (EXAKT 2!)
  "200g Tomaten (gehackt)" → "200 g Tomaten gehackt" (EXAKT 200 g!)
  "75g weiche Butter" → "75 g weiche Butter" (EXAKT 75 g, NICHT aufrunden!)
  "Honig 0,5l" → "0,5 l Honig" (EXAKT 0,5 l, Reihenfolge korrigieren)
  "1 TL Salz," → "1 TL Salz" (EXAKT 1 TL, entferne Komma am Ende)
  "Öl 2 EL" → "2 EL Öl" (EXAKT 2 EL)
  "Natron 0,3 TL" → "0,3 TL Natron" (EXAKT 0,3 TL)

  AUSGABEFORMAT: Alle Zutaten in einer Zeile mit Semikolon getrennt:
  "500 g Weizenmehl Type 405; 2 Stück mittelgroße Eier; 400 ml Vollmilch 3,5%; 1 TL Salz; 200 g Tomaten gehackt; 1 Zwiebel; 2 EL Öl; 75 g weiche Butter; 0,5 l Honig"

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
      throw error;
    }
  }

  async standardizeComplexInput(
    rawInput: string
  ): Promise<string> {
    console.log('🎯 Standardizing complex input with AI:', rawInput.substring(0, 100));

    const prompt = `Konvertiere diese komplexe Einkaufsliste in ein standardisiertes Format.

  EINGABE: ${rawInput}

  REGELN:
  - Extrahiere alle Artikel mit Mengen
  - Format: "MENGE EINHEIT ARTIKEL" (z.B. "2 Stück Äpfel", "500 g Mehl")
  - Deutsche Dezimalzahlen: 0,5 nicht 0.5 (Komma, nicht Punkt!)
  - Deutsche Einheiten: g, kg, ml, l, EL, TL, Prise, Stück, Pack, Dose, Flasche, Becher
  - KRITISCH: ÄNDERE NIEMALS Mengenangaben - übernimm sie EXAKT wie angegeben
  - KRITISCH: Behalte ALLE Produktspezifikationen (z.B. "3,5%", "bio", "frisch", "mittelgroß")
  - KRITISCH: Verwechsle NICHT Produktspezifikationen (wie "3,5%") mit Mengenangaben
  - Behalte beschreibende Adjektive (weiche, frische, große, bio, etc.)
  - Bei Dezimalzahlen in Mengen: IMMER mit 0 beginnen (0,5l nicht ,5l)
  - Ignoriere Formatierungszeichen (*, -, •, >>>, ---, etc.)
  - WICHTIG: Gib ALLE Artikel in EINER Zeile aus, getrennt durch Semikolon

  BEISPIELE MIT EXAKTEN MENGEN:
  "500g bio Mehl, 2 frische Eier" → "500 g bio Mehl; 2 Stück frische Eier" (EXAKT 500 g, EXAKT 2!)
  "400ml Milch 3,5% und Butter 250g" → "400 ml Milch 3,5%; 250 g Butter" (EXAKT 400 ml, NICHT 1 l!)
  "0,5l Honig" → "0,5 l Honig" (EXAKT 0,5 l!)
  "3 große Äpfel, Bananen 1kg" → "3 Stück große Äpfel; 1 kg Bananen" (EXAKT wie angegeben!)

  AUSGABEFORMAT: Alle Artikel in einer Zeile mit Semikolon getrennt.

  ANTWORTE NUR mit einer Zeile im oben gezeigten Format:`;

    try {
      const response = await this.callGroqAPI(prompt);
      let cleanResponse = this.extractIngredientsFromAIResponse(response);

      console.log('🎯 AI raw response:', response.substring(0, 200));
      console.log('🎯 Extracted items:', cleanResponse);

      if (!cleanResponse || cleanResponse.length < 5) {
        throw new Error('Invalid AI response');
      }

      const finalCommand = `Füge ${cleanResponse} hinzu`;
      console.log('🎯 Final standardized command:', finalCommand);
      return finalCommand;

    } catch (error) {
      console.error('🎯 AI standardization failed:', error);
      throw error;
    }
  }

  async getSmartSuggestions(
    itemName: string,
    existingArticles?: any[]
  ): Promise<{
    departmentId: string;
    icon: string;
  } | null> {
    if (!this.hasApiKey()) {
      return null;
    }
  
    try {
      const iconCounts = new Map<string, number>();
      
      existingArticles?.forEach(article => {
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
      const response = await this.callGroqAPI(prompt, 0.1, 100);
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

  // ========================================
  // COMPLEXITY DETECTION
  // ========================================

  /**
   * Detect if input is complex/messy and would benefit from AI preprocessing
   */
  isComplexInput(input: string): boolean {
    const cleanInput = input.toLowerCase().trim();

    // Indicators of complexity:
    // 1. Has special formatting characters (bullets, dashes, etc.)
    const hasSpecialChars = /[•◦▪▫*►▶→⦁]{1,}|[-–—]{2,}|[>]{2,}/.test(input);

    // 2. Has multiple line breaks (structured/formatted list)
    const hasMultipleLines = (input.match(/\n/g) || []).length >= 2;

    // 3. Has section headers (common in recipes)
    const hasSectionHeaders = /für (den|die|das)|zum |zur |zubereitung|zutaten|portionen/i.test(cleanInput);

    // 4. Has product specifications with decimals (e.g., "3,5%")
    const hasProductSpecs = /\d+,\d+%|type \d+|extra virgin|bio |frisch|mittelgroß|gebackt|gehackt/i.test(input);

    // 5. Has inconsistent quantity formats (mixed order)
    const hasInconsistentFormats = this.detectInconsistentFormats(input);

    // 6. Has decimal quantities with commas
    const hasDecimalCommas = /\d,\d+\s*(g|kg|ml|l|el|tl)/i.test(input);

    const complexityScore = [
      hasSpecialChars,
      hasMultipleLines,
      hasSectionHeaders,
      hasProductSpecs,
      hasInconsistentFormats,
      hasDecimalCommas
    ].filter(Boolean).length;

    console.log('🎯 Complexity detection:', {
      hasSpecialChars,
      hasMultipleLines,
      hasSectionHeaders,
      hasProductSpecs,
      hasInconsistentFormats,
      hasDecimalCommas,
      complexityScore,
      isComplex: complexityScore >= 2
    });

    // Consider complex if 2 or more indicators are present
    return complexityScore >= 2;
  }

  /**
   * Detect if input has inconsistent quantity formats (e.g., "500g Mehl" mixed with "Eier 2 Stück")
   */
  private detectInconsistentFormats(input: string): boolean {
    const quantityFirst = /\d+\s*(g|kg|ml|l|el|tl)\s+\w+/i.test(input); // "500g Mehl"
    const quantityLast = /\w+\s+\d+\s*(g|kg|ml|l|el|tl)/i.test(input);  // "Mehl 500g"

    return quantityFirst && quantityLast;
  }

  // ========================================
  // HELPER METHODS
  // ========================================

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

  private extractIngredientsFromAIResponse(response: string): string {
    console.log('🍳 Extracting ingredients from AI response');
    console.log('🍳 Raw AI response:', response);
    
    // Handle single ingredient responses with explanations
    const singleItemPattern = /^([0-9.,]+\s*[a-zA-ZäöüÄÖÜß\s]+)(?:\s*→.*|\s*\n|\s*Da es nur|\s*ist die Ausgabe|$)/i;
    const singleMatch = response.match(singleItemPattern);
    
    if (singleMatch) {
      const cleanSingle = singleMatch[1].trim();
      console.log('🍳 Detected single ingredient:', cleanSingle);
      
      // Verify it looks like a real ingredient
      if (/\d+/.test(cleanSingle) && 
          (/\b(g|kg|ml|l|el|tl|gramm|liter|prise|stück|flaschen|pack|dose)\b/i.test(cleanSingle) ||
           /\b(milch|öl|mehl|ei|zucker|salz|butter|sekt|wein|bier)\b/i.test(cleanSingle))) {
        return cleanSingle;
      }
    }
    
    // Look for clean semicolon-separated list
    const multiItemPattern = /^([^→\n]*(?:[0-9.,]+\s*[a-zA-ZäöüÄÖÜß\s]+\s*;\s*){1,}[0-9.,]+\s*[a-zA-ZäöüÄÖÜß\s]+[^→\n]*)/m;
    const multiMatch = response.match(multiItemPattern);
    
    if (multiMatch) {
      const cleanMulti = multiMatch[1]
        .replace(/[""]/g, '')
        .replace(/\s*→.*$/gm, '')
        .replace(/^\s*-\s*/, '')
        .trim();
      
      if (cleanMulti.includes(';') && cleanMulti.length > 10) {
        console.log('🍳 Found clean semicolon list:', cleanMulti);
        return cleanMulti;
      }
    }
    
    // Clean common corruption patterns
    let cleaned = response
      .replace(/→.*$/gm, '')
      .replace(/\n.*?Da es nur.*$/gmi, '')
      .replace(/\n.*?ist die Ausgabe.*$/gmi, '')
      .replace(/\n.*?hier ist.*$/gmi, '')
      .replace(/\n.*?ich kann.*$/gmi, '')
      .replace(/\n.*?konvertiert.*$/gmi, '')
      .replace(/\n{2,}/g, ' ')
      .replace(/\s{2,}/g, ' ')
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
    
    // Ultimate fallback
    const firstLine = cleaned.split('\n')[0].trim();
    if (firstLine.length > 0 && /\d+/.test(firstLine)) {
      console.log('🍳 Fallback to first line:', firstLine);
      return firstLine;
    }
    
    console.log('🍳 Could not extract clean ingredients, returning original');
    return response.trim();
  }
}