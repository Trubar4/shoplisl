// src/app/core/services/ai/command-parser.service.ts
import { Injectable } from '@angular/core';
import {
  CommandIntent,
  ColorExtraction,
  PendingAction,
  MultiItemPendingAction,
  QuantityExtraction,
  ColorMapping,
  isMultiItemPendingAction
} from './ai-models';
import { QuantityExtractionService } from './quantity-extraction.service';
import { LoggerService } from '../logger.service';

@Injectable({
  providedIn: 'root'
})
export class CommandParserService {

  // ========================================
  // COLOR MAPPINGS
  // ========================================

  private readonly COLOR_KEYWORDS: ColorMapping = {
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

  constructor(
    private quantityExtraction: QuantityExtractionService,
    private logger: LoggerService
  ) {}

  // ========================================
  // MAIN COMMAND PARSING (FIXED)
  // ========================================

  /**
   * 🎯 Parse command intent from input (FIXED: preserves original case)
   */
  parseIntent(input: string, cleanItemName?: string): Omit<PendingAction, 'extractedQuantity' | 'suggestedDepartment'> {
    const originalInput = input.trim(); // Preserve original
    const lowerInput = input.toLowerCase();
    
    // Handle API key commands
    if (lowerInput.includes('api key')) {
      return {
        type: 'add_item', // Will be handled specially
        originalInput: originalInput,
        itemName: 'API_KEY_COMMAND'
      };
    }

    // Handle help commands
    if (lowerInput.includes('hilfe') || lowerInput.includes('help')) {
      return {
        type: 'add_item', // Will be handled specially
        originalInput: originalInput,
        itemName: 'HELP_COMMAND'
      };
    }

    // Handle test commands
    if (lowerInput.includes('test')) {
      return {
        type: 'add_item', // Will be handled specially
        originalInput: originalInput,
        itemName: 'TEST_COMMAND'
      };
    }

    // Handle show lists commands
    if (lowerInput.includes('zeige') && lowerInput.includes('liste')) {
      return {
        type: 'add_item', // Will be handled specially
        originalInput: originalInput,
        itemName: 'SHOW_LISTS_COMMAND'
      };
    }

    // 🎯 FIXED: Create list patterns - extract from original input to preserve case
    const createListMatch = lowerInput.match(/erstelle\s+liste\s+(.+?)\s+mit\s+(.+)/);
    if (createListMatch) {
      // Extract positions from lowercase match but get content from original input
      const originalMatch = originalInput.match(/erstelle\s+liste\s+(.+?)\s+mit\s+(.+)/i);
      if (originalMatch) {
        const extractedItem = originalMatch[2].replace(/\s+hinzu$/, '').trim();
        return {
          type: 'create_list',
          originalInput: originalInput,
          itemName: this.cleanItemName(extractedItem),
          listName: originalMatch[1].trim() // 🎯 FIXED: Extract from original to preserve case
        };
      }
    }

    // 🎯 FIXED: Create list without items - preserve case
    const createListSimpleMatch = lowerInput.match(/erstelle\s+liste\s+(.+)$/);
    if (createListSimpleMatch && !createListSimpleMatch[1].includes('mit')) {
      // Extract from original input to preserve case
      const originalMatch = originalInput.match(/erstelle\s+liste\s+(.+)$/i);
      if (originalMatch) {
        return {
          type: 'create_list',
          originalInput: originalInput,
          itemName: '',
          listName: originalMatch[1].trim() // 🎯 FIXED: Extract from original to preserve case
        };
      }
    }

    // 🎯 FIXED: Add to specific list - preserve case
    const addToListMatch = lowerInput.match(/füge\s+(.+?)\s+zu\s+(.+?)\s+hinzu/);
    if (addToListMatch) {
      // Extract from original input to preserve case
      const originalMatch = originalInput.match(/füge\s+(.+?)\s+zu\s+(.+?)\s+hinzu/i);
      if (originalMatch) {
        return {
          type: 'add_item',
          originalInput: originalInput,
          itemName: cleanItemName || this.cleanItemName(originalMatch[1]),
          listName: originalMatch[2].trim() // 🎯 FIXED: Extract from original to preserve case
        };
      }
    }

    // Generic add: "Füge Bananen hinzu" or "Füge Joghurt Menge 1 Becher hinzu"
    if (lowerInput.includes('füge') && lowerInput.includes('hinzu')) {
      return {
        type: 'add_item',
        originalInput: originalInput,
        itemName: cleanItemName || this.extractItemFromFügeCommand(originalInput) // Use original input
      };
    }

    // Default: unrecognized command
    return {
      type: 'add_item',
      originalInput: originalInput,
      itemName: 'UNRECOGNIZED_COMMAND'
    };
  }

  /**
   * 🎯 Extract item name from "Füge ... hinzu" command (FIXED: use original input)
   */
  private extractItemFromFügeCommand(input: string): string {
    const match = input.match(/füge\s+(.+?)\s+hinzu/i); // Case insensitive but preserve original
    if (match) {
      return this.cleanItemName(match[1]);
    }
    return input;
  }

  /**
   * 🧹 Clean item name from command artifacts
   */
  cleanItemName(itemName: string): string {
    return itemName
      .replace(/^füge\s+/i, '') // Remove "füge " prefix
      .replace(/\s+menge\s+.+$/i, '') // Remove " menge X Unit" completely
      .replace(/\s+hinzu$/i, '') // Remove " hinzu" suffix
      .replace(/\s+zu\s+.+$/i, '') // Remove " zu [list]" suffix
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .trim();
  }

  // ========================================
  // COLOR EXTRACTION (FIXED)
  // ========================================

  /**
   * 🎨 Extract color from German input (FIXED: preserve original case)
   */
  extractColor(input: string): ColorExtraction {
    const originalInput = input; // Preserve original
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
          // 🎯 FIXED: Remove color from original input to preserve case
          const cleanInput = originalInput.replace(new RegExp(match[0], 'i'), '').trim();
          return { 
            colorName, 
            colorHex, 
            cleanInput 
          };
        }
      }
    }

    return { cleanInput: originalInput }; // Return original input
  }

  // ========================================
  // COMMAND CLASSIFICATION (FIXED)
  // ========================================

  /**
   * 🎯 Classify command type and confidence (FIXED: preserve original case)
   */
  classifyCommand(input: string): CommandIntent {
    const originalInput = input.trim(); // Preserve original
    const lowerInput = input.toLowerCase().trim();
    
    // API Key commands
    if (lowerInput.includes('api key') || lowerInput.includes('set api')) {
      return {
        type: 'api_key',
        originalInput: originalInput,
        confidence: 1.0
      };
    }

    // Help commands
    if (lowerInput.includes('hilfe') || lowerInput.includes('help')) {
      return {
        type: 'help',
        originalInput: originalInput,
        confidence: 1.0
      };
    }

    // Test commands
    if (lowerInput.includes('test')) {
      return {
        type: 'test',
        originalInput: originalInput,
        confidence: 1.0
      };
    }

    // Show lists commands
    if (lowerInput.includes('zeige') && lowerInput.includes('liste')) {
      return {
        type: 'show_lists',
        originalInput: originalInput,
        confidence: 1.0
      };
    }

    // 🎯 FIXED: Create list commands - preserve original case
    if (lowerInput.includes('erstelle') && lowerInput.includes('liste')) {
      const listMatch = lowerInput.match(/erstelle\s+liste\s+(.+?)(\s+mit\s+(.+))?$/);
      if (listMatch) {
        // Extract from original input to preserve case
        const originalMatch = originalInput.match(/erstelle\s+liste\s+(.+?)(\s+mit\s+(.+))?$/i);
        if (originalMatch) {
          return {
            type: 'create_list',
            originalInput: originalInput,
            listName: originalMatch[1].trim(), // 🎯 FIXED: From original input
            itemName: originalMatch[3]?.trim(), // 🎯 FIXED: From original input
            confidence: 0.95
          };
        }
      }
    }

    // 🎯 FIXED: Add item commands - preserve original case
    if (lowerInput.includes('füge') && lowerInput.includes('hinzu')) {
      const addMatch = lowerInput.match(/füge\s+(.+?)\s+(?:zu\s+(.+?)\s+)?hinzu/);
      if (addMatch) {
        // Extract from original input to preserve case
        const originalMatch = originalInput.match(/füge\s+(.+?)\s+(?:zu\s+(.+?)\s+)?hinzu/i);
        if (originalMatch) {
          return {
            type: 'add_item',
            originalInput: originalInput,
            itemName: originalMatch[1].trim(), // 🎯 FIXED: From original input
            listName: originalMatch[2]?.trim(), // 🎯 FIXED: From original input
            confidence: 0.95
          };
        }
      }
    }

    // Unrecognized command
    return {
      type: 'unrecognized',
      originalInput: originalInput,
      confidence: 0.0
    };
  }

  // ========================================
  // CONTEXT ANALYSIS
  // ========================================

  /**
   * 🎯 Analyze command context for better processing
   */
  analyzeContext(input: string): {
    hasQuantity: boolean;
    hasColor: boolean;
    hasListName: boolean;
    hasMultipleItems: boolean;
    complexity: 'simple' | 'medium' | 'complex';
  } {
    const lowerInput = input.toLowerCase();
    
    const hasQuantity = /\d+/.test(input) || input.toLowerCase().includes('menge');
    const hasColor = Object.keys(this.COLOR_KEYWORDS).some(color => 
      lowerInput.includes(color)
    );
    const hasListName = lowerInput.includes(' zu ') && lowerInput.includes('hinzu');
    const hasMultipleItems = input.includes(',');
    
    let complexity: 'simple' | 'medium' | 'complex' = 'simple';
    
    if (hasMultipleItems) {
      complexity = 'complex';
    } else if (hasQuantity || hasColor || hasListName) {
      complexity = 'medium';
    }

    return {
      hasQuantity,
      hasColor,
      hasListName,
      hasMultipleItems,
      complexity
    };
  }

  // ========================================
  // VALIDATION METHODS
  // ========================================

  /**
   * 🎯 Validate if input is a valid command
   */
  isValidCommand(input: string): boolean {
    const intent = this.classifyCommand(input);
    return intent.confidence > 0.0;
  }

  /**
   * 🎯 Check if input requires disambiguation
   */
  requiresDisambiguation(input: string): boolean {
    const context = this.analyzeContext(input);
    return context.complexity === 'complex' || 
           (context.complexity === 'medium' && !context.hasListName);
  }

  /**
   * 🎯 Check if input has sufficient information
   */
  hasSufficientInfo(input: string): {
    sufficient: boolean;
    missing: string[];
  } {
    const intent = this.classifyCommand(input);
    const missing: string[] = [];

    if (intent.type === 'add_item') {
      if (!intent.itemName || intent.itemName.trim() === '') {
        missing.push('Artikel-Name');
      }
    }

    if (intent.type === 'create_list') {
      if (!intent.listName || intent.listName.trim() === '') {
        missing.push('Listen-Name');
      }
    }

    return {
      sufficient: missing.length === 0,
      missing
    };
  }

  // ========================================
  // SUGGESTION METHODS
  // ========================================

  /**
   * 🎯 Suggest improvements for unclear commands
   */
  suggestImprovements(input: string): string[] {
    const suggestions: string[] = [];
    const context = this.analyzeContext(input);
    const intent = this.classifyCommand(input);

    if (intent.confidence < 0.5) {
      suggestions.push('Der Befehl wurde nicht erkannt. Versuche: "Füge [Artikel] hinzu" oder "Erstelle Liste [Name]"');
    }

    if (intent.type === 'add_item' && !context.hasListName) {
      suggestions.push('Tipp: Du kannst direkt eine Liste angeben: "Füge [Artikel] zu [Liste] hinzu"');
    }

    if (context.hasMultipleItems && !context.hasQuantity) {
      suggestions.push('Tipp: Du kannst Mengen angeben: "Füge 2kg Bananen, 1L Milch hinzu"');
    }

    if (intent.type === 'create_list' && !context.hasColor) {
      suggestions.push('Tipp: Du kannst eine Farbe wählen: "Erstelle Liste [Name] in [Farbe]"');
    }

    return suggestions;
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * 🎯 Get command summary for debugging
   */
  getCommandSummary(input: string): string {
    const intent = this.classifyCommand(input);
    const context = this.analyzeContext(input);
    
    let summary = `Typ: ${intent.type}`;
    
    if (intent.itemName) {
      summary += `, Artikel: ${intent.itemName}`;
    }
    
    if (intent.listName) {
      summary += `, Liste: ${intent.listName}`;
    }
    
    summary += `, Komplexität: ${context.complexity}`;
    summary += `, Vertrauen: ${Math.round(intent.confidence * 100)}%`;
    
    return summary;
  }

  /**
   * 🎯 Extract all mentioned items from input
   */
  extractAllItems(input: string): string[] {
    // For multi-item commands, use quantity extraction service
    if (this.quantityExtraction.hasMultipleItems(input)) {
      const result = this.quantityExtraction.parseMultipleItems(input);
      return result.items.map(item => item.itemName);
    }

    // For single items
    const extraction = this.quantityExtraction.extractQuantity(input);
    return extraction.itemName ? [extraction.itemName] : [];
  }

  /**
   * 🎯 Get color suggestions based on input
   */
  getColorSuggestions(input: string): string[] {
    const lowerInput = input.toLowerCase();
    
    if (lowerInput.includes('liste') || lowerInput.includes('erstelle')) {
      return ['rot', 'grün', 'blau', 'gelb', 'orange'];
    }
    
    return [];
  }

  /**
   * 🎯 Check if input mentions specific stores
   */
  mentionsStore(input: string): string | null {
    const lowerInput = input.toLowerCase();
    const stores = ['spar', 'billa', 'hofer', 'merkur', 'interspar', 'lidl', 'penny', 'adeg'];
    
    for (const store of stores) {
      if (lowerInput.includes(store)) {
        return store;
      }
    }
    
    return null;
  }

  isConversationEnd(input: string): boolean {
    const cleanInput = input.toLowerCase().trim();
    
    const endKeywords = [
      'nein', 'nein danke', 'fertig', 'stop', 'beenden', 'ende', 
      'nicht mehr', 'keine weitere', 'keine weiteren', 'reicht',
      'das war\'s', 'das wars', 'genug', 'schluss', 'aufhören',
      'nö', 'ne', 'nope', 'nada', 'nichts mehr'
    ];
    
    const isEnd = endKeywords.some(keyword => {
      return cleanInput === keyword || 
            cleanInput.startsWith(keyword + ' ') ||
            cleanInput.endsWith(' ' + keyword) ||
            cleanInput.includes(' ' + keyword + ' ');
    });
    
    this.logger.debug('context', `Checking conversation end for: ${input} -> result: ${isEnd}`);
    return isEnd;
  }
}