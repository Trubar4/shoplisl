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
            ingredients.push(processedItem);
          }
        }
      } else {
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

  private shouldSkipLine(line: string): boolean {
    const lowerLine = line.toLowerCase();
    return lowerLine.includes('da es nur') || 
           lowerLine.includes('ist die ausgabe') ||
           lowerLine.includes('hier ist') ||
           lowerLine.includes('ich kann');
  }

  private processRecipeItem(item: string): string | null {
    let cleaned = item
      .replace(/^[-•◦▪▫*>]+\s*/, '')
      .replace(/^[\d\.\)]+\s*/, '')
      .replace(/^>\s*/, '')
      .replace(/^\*+\s*/, '')
      .replace(/\*+$/, '')
      .replace(/^-+\s*/, '')
      .replace(/\s*-+$/, '')
      .replace(/^•+\s*/, '')
      .replace(/•+$/, '')
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
    return lower.includes('für den') ||
           lower.includes('für die') ||
           lower.includes('zum würzen') ||
           lower.includes('zubereitung') ||
           lower.includes('portionen') ||
           /^-{3,}/.test(text);
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
}