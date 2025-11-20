// src/app/core/services/ai/recipe-processing.service.ts
import { Injectable } from '@angular/core';
import { AIExecutionResult } from './ai-models';
import { GroqApiService } from './groq-api.service';
import { ContextManagementService } from './context-management.service';

@Injectable({
  providedIn: 'root'
})
export class RecipeProcessingService {
  
  constructor(
    private groqApi: GroqApiService,
    private contextManager: ContextManagementService
  ) {}

  // ========================================
  // RECIPE DETECTION
  // ========================================

  isRecipeCommand(input: string): boolean {
    const normalizedInput = input.toLowerCase().trim();
    const firstLine = normalizedInput.split(/\r?\n/)[0].trim();
    
    const recipeKeywords = [
      'rezept:', 'rezept', 'zutaten:', 'zutaten',
      'ingredienzien:', 'ingredienzien', 'ingredients:',
      'einkaufsliste aus rezept'
    ];
    
    const isRecipeDetected = recipeKeywords.some(keyword => {
      if (keyword.endsWith(':')) {
        return firstLine.startsWith(keyword);
      } else {
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

  // ========================================
  // RECIPE PROCESSING
  // ========================================

  async processRecipeCommand(
    input: string,
    processMultiItemsCallback: (command: string) => Promise<AIExecutionResult>
  ): Promise<AIExecutionResult> {
    console.log('🍳 Processing recipe command:', input.substring(0, 50));
    
    // Preserve existing conversation context
    const existingContext = this.contextManager.getConversationContext();
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
      
      // Check if user needs to choose between local parsing and API setup
      const existingContext = this.contextManager.getConversationContext();
      const forceLocalParsing = existingContext.forceLocalParsing;

      // If no API key and user hasn't chosen yet, ask them first
      if (!this.groqApi.hasApiKey() && !forceLocalParsing) {
        console.log('🍳 No API key - asking user to choose parsing method');

        // Store the recipe content in context so we can process it after user chooses
        this.contextManager.setConversationContext({
          pendingRecipe: {
            content: recipeContent,
            targetListName: targetListName,
            targetListId: targetListId
          }
        });

        return {
          success: false,
          message: `ℹ️ <strong>Groq API-Schlüssel nicht konfiguriert</strong><br><br>` +
                   `Möchtest du das Rezept mit lokalem Parsing verarbeiten oder die Groq API einrichten?<br><br>` +
                   `<strong>Lokales Parsing:</strong><br>` +
                   `→ Funktioniert gut für einfache Rezepte<br>` +
                   `→ Möglicherweise ungenau bei komplexen Formaten<br><br>` +
                   `<strong>Groq API (empfohlen):</strong><br>` +
                   `→ Kostenlos und deutlich genauer<br>` +
                   `→ Besser bei Abschnitten, Spezialzeichen, Produktspezifikationen`,
          actionButtons: [
            {
              id: 'recipe-parse-local',
              label: 'Lokal',
              icon: 'offline_bolt',
              command: 'lokal',
              style: 'secondary'
            },
            {
              id: 'recipe-setup-api',
              label: 'Anleitung API-Key',
              icon: 'api',
              command: 'api',
              style: 'primary'
            }
          ]
        };
      }

      let finalCommand: string;

      if (targetListName && targetListId) {
        console.log(`🍳 Using target list from context: ${targetListName}`);

        if (this.groqApi.hasApiKey()) {
          console.log('🍳 Using Groq API for advanced recipe processing');
          try {
            const standardizedCommands = await this.groqApi.standardizeRecipeIngredients(recipeContent, targetListName);

            if (!standardizedCommands || standardizedCommands.trim().length < 10) {
              throw new Error('AI returned empty result');
            }

            const commands = this.parseStandardizedCommands(standardizedCommands);

            if (commands.length === 0) {
              throw new Error('No valid commands from AI');
            }

            const enhancedCommands = commands.map(cmd => {
              if (!cmd.includes(' zu ') && !cmd.includes(targetListName)) {
                return cmd.replace(' hinzu', ` zu ${targetListName} hinzu`);
              }
              return cmd;
            });

            finalCommand = this.combineCommandsToMultiItem(enhancedCommands);
            console.log('🍳 Groq processed recipe successfully:', finalCommand);

          } catch (aiError) {
            console.error('🍳 Groq processing failed, using enhanced fallback:', aiError);
            finalCommand = `Füge ${this.parseAdvancedRecipe(recipeContent).join(', ')} hinzu`;
          }
        } else {
          console.log('🍳 No API key - using enhanced local parsing');
          finalCommand = `Füge ${this.parseAdvancedRecipe(recipeContent).join(', ')} zu ${targetListName} hinzu`;
        }
      } else {
        // No target list - process normally
        console.log('🍳 No target list in context');

        if (this.groqApi.hasApiKey()) {
          console.log('🍳 Using Groq API for recipe processing');
          try {
            const standardizedCommands = await this.groqApi.standardizeRecipeIngredients(recipeContent);
            const commands = this.parseStandardizedCommands(standardizedCommands);
            finalCommand = this.combineCommandsToMultiItem(commands);
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
      return await processMultiItemsCallback(finalCommand);
      
    } catch (error) {
      console.error('🍳 Recipe processing error:', error);
      return {
        success: false,
        message: `❌ Rezept-Verarbeitung fehlgeschlagen.<br><br>💡 Versuche stattdessen:<br>"Füge Milch, Gurken hinzu"`
      };
    }
  }

  // ========================================
  // RECIPE PARSING HELPERS
  // ========================================

  private extractRecipeContent(input: string): string {
    const lines = input.split(/\r?\n/);
    const firstLine = lines[0].toLowerCase().trim();
    
    const keywords = ['rezept:', 'rezept', 'zutaten:', 'zutaten', 'ingredienzien:', 'ingredienzien', 'ingredients:'];
    
    for (const keyword of keywords) {
      if (keyword.endsWith(':')) {
        const colonIndex = firstLine.indexOf(keyword);
        if (colonIndex !== -1) {
          const afterColon = lines[0].substring(colonIndex + keyword.length).trim();
          const remainingLines = lines.slice(1);
          
          if (afterColon) {
            return [afterColon, ...remainingLines].join('\n').trim();
          } else {
            return remainingLines.join('\n').trim();
          }
        }
      } else {
        if (firstLine === keyword || firstLine.startsWith(keyword + ' ')) {
          if (firstLine === keyword) {
            return lines.slice(1).join('\n').trim();
          } else {
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
    
    return input.trim();
  }

  private parseStandardizedCommands(standardizedCommands: string): string[] {
    return standardizedCommands
      .split('\n')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && cmd.includes('Füge') && cmd.includes('hinzu'));
  }

  private combineCommandsToMultiItem(commands: string[]): string {
    const multiItemCommand = commands.join(', ')
      .replace(/Füge /g, '')
      .replace(/ hinzu/g, '');
    
    return `Füge ${multiItemCommand} hinzu`;
  }

  parseAdvancedRecipe(recipeContent: string): string[] {
    console.log('🍳 Advanced parsing recipe:', recipeContent.substring(0, 100));

    const trimmed = recipeContent.trim();

    // Handle single ingredient case
    if (!trimmed.includes(',') && !trimmed.includes(';') && !trimmed.includes('\n')) {
      const singleItemMatch = trimmed.match(/^([0-9.,]+\s*[a-zA-ZäöüÄÖÜß\s]+)/);
      if (singleItemMatch) {
        const cleanSingle = singleItemMatch[1].trim();
        console.log('🍳 Detected single ingredient in fallback:', cleanSingle);
        return [cleanSingle];
      }
    }

    const ingredients: string[] = [];
    const lines = recipeContent.split(/\r?\n/);

    for (let line of lines) {
      // Skip explanatory lines
      if (this.shouldSkipLine(line)) {
        continue;
      }

      // Check if line contains multiple items
      if (line.includes(',') || line.includes(';')) {
        const items = line.split(/\s*[,;]\s*/);
        for (let item of items) {
          const processedItem = this.processRecipeItem(item);
          if (processedItem) {
            // Check if processed item contains multiple space-separated ingredients
            const splitItems = this.splitSpaceSeparatedIngredients(processedItem);
            ingredients.push(...splitItems);
          }
        }
      } else {
        const processedItem = this.processRecipeItem(line);
        if (processedItem) {
          // Check if processed item contains multiple space-separated ingredients
          const splitItems = this.splitSpaceSeparatedIngredients(processedItem);
          ingredients.push(...splitItems);
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
   * Split space-separated ingredients when they have quantity indicators
   * Example: "500g Mehl 2 Eier 1l Milch" → ["500g Mehl", "2 Eier", "1l Milch"]
   */
  private splitSpaceSeparatedIngredients(text: string): string[] {
    // Pattern to detect quantity indicators at start of ingredients
    // Matches: "500g", "2", "400ml", "1 TL", "0,5l" etc.
    // Important: Must not match "Type 405" or "3,5%" (product specifications)
    const quantityPattern = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|el|tl|gramm|liter|prise|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser|pck)?/gi;

    const matches = [];

    // Find all quantity positions in the text
    let match;
    while ((match = quantityPattern.exec(text)) !== null) {
      const matchedText = match[0];
      const matchIndex = match.index;

      // Skip if this looks like a product specification, not a quantity:

      // 1. Skip "Type 405" - check if preceded by "Type" or "type"
      const beforeMatch = text.substring(Math.max(0, matchIndex - 10), matchIndex).toLowerCase();
      if (/type\s*$/.test(beforeMatch)) {
        console.log(`🍳 Skipping "${matchedText}" - part of Type specification`);
        continue;
      }

      // 2. Skip "3,5%" - check if followed by "%"
      const afterMatch = text.substring(matchIndex + matchedText.length, matchIndex + matchedText.length + 1);
      if (afterMatch === '%') {
        console.log(`🍳 Skipping "${matchedText}" - part of percentage specification`);
        continue;
      }

      // 3. Skip standalone numbers without units that aren't at word boundaries
      // (e.g., "1" in middle of text without context)
      const hasUnit = match[2]; // The unit capture group
      if (!hasUnit) {
        // For numbers without units, check if they're at start or preceded by separators
        const charBefore = matchIndex > 0 ? text[matchIndex - 1] : ' ';
        if (!/[\s,;]/.test(charBefore) && matchIndex > 0) {
          console.log(`🍳 Skipping "${matchedText}" - number without unit not at boundary`);
          continue;
        }
      }

      matches.push({
        index: matchIndex,
        quantity: matchedText,
        fullMatch: matchedText
      });
    }

    // If we found multiple quantities, split at those positions
    if (matches.length >= 2) {
      const ingredients: string[] = [];

      // Add first ingredient (from start to second quantity)
      const firstIngredient = text.substring(0, matches[1].index).trim();
      if (firstIngredient.length > 0) {
        ingredients.push(firstIngredient);
      }

      // Add middle ingredients
      for (let i = 1; i < matches.length - 1; i++) {
        const startPos = matches[i].index;
        const endPos = matches[i + 1].index;

        const ingredient = text.substring(startPos, endPos).trim();
        if (ingredient.length > 0) {
          ingredients.push(ingredient);
        }
      }

      // Add last ingredient (from last quantity to end)
      const lastIngredient = text.substring(matches[matches.length - 1].index).trim();
      if (lastIngredient.length > 0) {
        ingredients.push(lastIngredient);
      }

      console.log(`🍳 Split space-separated: "${text.substring(0, 80)}..." → ${ingredients.length} items`);
      return ingredients.filter(i => i.length > 0);
    }

    // If only one or zero quantities, return the whole text as a single ingredient
    return [text];
  }

  private shouldSkipLine(line: string): boolean {
    const lowerLine = line.toLowerCase();
    return lowerLine.includes('da es nur') ||
           lowerLine.includes('ist die ausgabe') ||
           lowerLine.includes('hier ist') ||
           lowerLine.includes('ich kann');
  }

  private processRecipeItem(item: string): string | null {
    // Remove section header prefixes first (but keep the ingredients)
    let cleaned = item
      .replace(/^(für den |für die |für das |für einen |für eine |für ein )[^:]*:\s*/gi, '') // Remove "Für den Teig:", "Für die Soße:" etc.
      .replace(/^[-•◦▪▫*⦁>]+\s*/g, '') // Remove bullet points at start
      .replace(/[-•◦▪▫*⦁>]+\s*/g, ' ') // Replace bullet points in middle with space
      .replace(/^[\d\.\)]+\s*/, '') // Remove numbered list markers
      .replace(/\s*-{3,}\s*/g, ' ') // Replace separator lines with space
      .replace(/\s*={3,}\s*/g, ' ') // Replace equals separators with space
      .replace(/\s+/g, ' ') // Normalize multiple spaces
      .trim();

    // Skip section headers and empty lines
    if (!cleaned ||
        cleaned.length < 3 ||
        this.isSectionHeader(cleaned)) {
      return null;
    }

    // Check if line contains quantity or food keywords
    const hasQuantity = /\d+/.test(cleaned);
    const hasUnit = this.hasUnitKeyword(cleaned);
    const hasFoodWords = this.hasFoodKeyword(cleaned);

    // Accept if it has quantity with unit OR food keywords
    if ((hasQuantity && hasUnit) || hasFoodWords || /^\d+\s+[a-zA-ZäöüÄÖÜß]/.test(cleaned)) {
      return cleaned;
    }

    return null;
  }

  private isSectionHeader(text: string): boolean {
    const lower = text.toLowerCase();
    // Only skip pure separator lines or instruction lines
    // Don't skip lines that contain "für den/die" as they contain ingredients
    return /^-{3,}$/.test(text.trim()) ||  // Lines that are just dashes
           /^={3,}$/.test(text.trim()) ||  // Lines that are just equals
           lower === 'zubereitung' ||
           lower === 'zubereitung:' ||
           lower.startsWith('portionen:') ||
           lower.startsWith('portion:');
  }

  private hasUnitKeyword(text: string): boolean {
    return /\b(g|kg|ml|l|el|tl|gramm|liter|prise|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser|pck)\b/i.test(text);
  }

  private hasFoodKeyword(text: string): boolean {
    return /\b(butter|zucker|mehl|ei|eier|salz|natron|milch|öl|schokolade|schoko|vanille|zimt|kakao|nüsse|mandeln|rosinen|backpulver|zwiebel|knoblauch|tomate|kartoffel|fleisch|fisch|käse|brot|nudeln|reis|bohnen|erbsen|karotte|paprika|gurke|salat|apfel|banane|orange|zitrone|petersilie|basilikum|oregano|thymian|rosmarin|pfeffer|chili|ingwer|honig|essig|wein|bier|sahne|joghurt|quark|frischkäse|mozzarella|parmesan|gouda|emmentaler|cheddar|feta|ricotta|mascarpone|pecorino|gorgonzola|camembert|brie|roquefort|stilton)\b/i.test(text);
  }

  private parseSimpleIngredients(recipeContent: string): string[] {
    console.log('🍳 Parsing simple ingredients:', recipeContent);

    // Try comma/newline/semicolon separation first
    if (recipeContent.includes(',') || recipeContent.includes('\n') || recipeContent.includes(';')) {
      const items = recipeContent
        .split(/[,\n;]/)
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
  // USER CHOICE HANDLERS
  // ========================================

  /**
   * Check if user wants to proceed with local parsing
   */
  isChooseLocalParsing(input: string): boolean {
    const normalized = input.toLowerCase().trim();
    return normalized === 'lokal' ||
           normalized === 'local' ||
           normalized === 'weiter' ||
           normalized === 'continue' ||
           normalized === 'ja' ||
           normalized === 'yes' ||
           normalized === 'option 1' ||
           normalized === '1';
  }

  /**
   * Check if user wants to see API setup instructions
   */
  isChooseApiSetup(input: string): boolean {
    const normalized = input.toLowerCase().trim();
    return normalized === 'api' ||
           normalized === 'anleitung' ||
           normalized === 'setup' ||
           normalized === 'instructions' ||
           normalized === 'groq' ||
           normalized === 'option 2' ||
           normalized === '2';
  }

  /**
   * Process pending recipe with local parsing
   */
  async processPendingRecipeWithLocal(
    processMultiItemsCallback: (command: string) => Promise<AIExecutionResult>
  ): Promise<AIExecutionResult> {
    const context = this.contextManager.getConversationContext();
    const pendingRecipe = context.pendingRecipe;

    if (!pendingRecipe) {
      return {
        success: false,
        message: '❌ Kein Rezept gefunden. Bitte sende das Rezept erneut.'
      };
    }

    console.log('🍳 Processing pending recipe with local parsing');

    // Set flag to skip the choice prompt
    this.contextManager.setConversationContext({
      forceLocalParsing: true,
      pendingRecipe: undefined // Clear pending recipe
    });

    // Process the recipe
    return this.processRecipeCommand(
      `Rezept: ${pendingRecipe.content}`,
      processMultiItemsCallback
    );
  }

  /**
   * Show API setup instructions
   */
  showApiSetupInstructions(): AIExecutionResult {
    console.log('🍳 Showing API setup instructions');

    // Clear pending recipe context
    this.contextManager.setConversationContext({
      pendingRecipe: undefined
    });

    return {
      success: false,
      message: this.groqApi.getNoApiKeyMessage() +
               '<br><br>─────────────────────<br><br>' +
               '💡 <em>Nachdem du den API-Schlüssel eingerichtet hast, kannst du dein Rezept erneut senden.</em>'
    };
  }

  /**
   * Check if there's a pending recipe choice
   */
  hasPendingRecipeChoice(): boolean {
    const context = this.contextManager.getConversationContext();
    return !!context.pendingRecipe;
  }
}