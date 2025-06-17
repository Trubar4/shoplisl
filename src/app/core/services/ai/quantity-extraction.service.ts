// src/app/core/services/ai/quantity-extraction.service.ts
import { Injectable } from '@angular/core';
import {
  QuantityExtraction,
  QuantityExtractionResult,
  ParsedItem,
  MultiItemParseResult,
  QuantityPattern,
  CommandPattern,
  ParsingError,
  QUANTITY_UNITS
} from './ai-models';

@Injectable({
  providedIn: 'root'
})
export class QuantityExtractionService {

  // ========================================
  // QUANTITY PATTERNS
  // ========================================

  private readonly QUANTITY_PATTERNS: QuantityPattern[] = [
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

  // ========================================
  // TOKEN QUANTITY PATTERNS
  // ========================================

  private readonly TOKEN_QUANTITY_PATTERNS: QuantityPattern[] = [
    // Pattern 1: "Artikel Menge Amount Unit" → "Milch Menge 1 Liter"
    { 
      pattern: /^(.+?)\s+menge\s+(\d+(?:[.,]\d+)?)\s*(kg|g|gramm|liter|l|ml|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)?$/i,
      type: 'item_menge_amount_unit',
      itemGroup: 1,
      quantityGroup: 2,
      unitGroup: 3
    },
    // Pattern 2: "Amount Unit Artikel" → "2kg Bananen", "500ml Milch"
    { 
      pattern: /^(\d+(?:[.,]\d+)?)\s*(kg|g|gramm|liter|l|ml|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)\s+(.+)$/i,
      type: 'amount_unit_item',
      itemGroup: 3,
      quantityGroup: 1,
      unitGroup: 2
    },
    // Pattern 3: "Amount x Artikel" → "2x Bananen", "3 x Äpfel"
    { 
      pattern: /^(\d+(?:[.,]\d+)?)\s*x\s+(.+)$/i,
      type: 'amount_x_item',
      itemGroup: 2,
      quantityGroup: 1,
      unitGroup: null
    },
    // Pattern 4: "Artikel Amount Unit" → "Bananen 2kg", "Milch 1 Liter"
    { 
      pattern: /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(kg|g|gramm|liter|l|ml|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)$/i,
      type: 'item_amount_unit',
      itemGroup: 1,
      quantityGroup: 2,
      unitGroup: 3
    },
    // Pattern 5: "Amount Artikel" → "2 Bananen", "3 Äpfel"
    { 
      pattern: /^(\d+(?:[.,]\d+)?)\s+(.+)$/i,
      type: 'amount_item',
      itemGroup: 2,
      quantityGroup: 1,
      unitGroup: null
    }
  ];

  // ========================================
  // COMMAND PATTERNS
  // ========================================

  private readonly COMMAND_PATTERNS: CommandPattern[] = [
    // Pattern 1: "Füge [items] zu [list] hinzu"
    {
      pattern: /^füge\s+(.+?)\s+zu\s+(.+?)\s+hinzu$/i,
      type: 'add_items',
      itemsGroup: 1,
      listGroup: 2
    },
    // Pattern 2: "Füge [items] hinzu" (no list specified)
    {
      pattern: /^füge\s+(.+?)\s+hinzu$/i,
      type: 'add_items',
      itemsGroup: 1,
      listGroup: null
    },
    // Pattern 3: "Erstelle Liste [name] mit [items]"
    {
      pattern: /^erstelle\s+liste\s+(.+?)\s+mit\s+(.+)$/i,
      type: 'create_list_with_items',
      itemsGroup: 2,
      listGroup: 1
    }
  ];

  // ========================================
  // SINGLE ITEM QUANTITY EXTRACTION
  // ========================================

  /**
   * 🔍 ENHANCED: Extract quantity with better input preservation and debugging
   */
  extractQuantity(input: string): QuantityExtraction {
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
    
    for (let i = 0; i < this.QUANTITY_PATTERNS.length; i++) {
      const { pattern, type, itemGroup, quantityGroup } = this.QUANTITY_PATTERNS[i];
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
  // MULTI-ITEM PARSING
  // ========================================

  /**
   * 🎯 NEW: Parse comma-separated items from input
   * Supports: "Füge Bananen, 2kg Würste, Milch Menge 1 Liter zu Spar hinzu"
   */
  parseMultipleItems(input: string): MultiItemParseResult {
    console.log('🎯 PARSING MULTIPLE ITEMS:', input);
    
    const result: MultiItemParseResult = {
      command: 'unrecognized',
      items: [],
      originalInput: input,
      parseErrors: []
    };

    // Clean the input
    const cleanInput = input.trim();

    // Find matching command pattern
    let commandMatch = null;
    let commandType: 'add_items' | 'create_list_with_items' = 'add_items';
    let itemsText = '';
    let listName: string | undefined;

    for (const cmdPattern of this.COMMAND_PATTERNS) {
      const match = cleanInput.match(cmdPattern.pattern);
      if (match) {
        commandMatch = match;
        commandType = cmdPattern.type;
        itemsText = match[cmdPattern.itemsGroup].trim();
        listName = cmdPattern.listGroup !== null ? match[cmdPattern.listGroup].trim() : undefined;
        break;
      }
    }

    if (!commandMatch) {
      console.log('🎯 NO COMMAND PATTERN MATCHED');
      return result; // Returns 'unrecognized'
    }

    console.log('🎯 COMMAND MATCHED:', { commandType, itemsText, listName });

    // Set command type and list name
    result.command = commandType;
    result.listName = listName;

    // Split items by comma and parse each one
    const itemTokens = this.splitCommaItems(itemsText);
    console.log('🎯 SPLIT ITEMS:', itemTokens);

    for (const token of itemTokens) {
      const parsedItem = this.parseSingleItemFromToken(token);
      if (parsedItem) {
        result.items.push(parsedItem);
      } else {
        result.parseErrors.push(`Konnte "${token}" nicht interpretieren`);
      }
    }

    console.log('🎯 FINAL PARSE RESULT:', result);
    return result;
  }

  /**
   * 🔍 Smart comma splitting that preserves "Menge" constructs
   * Handles: "Bananen, 2kg Würste, Milch Menge 1 Liter" 
   */
  private splitCommaItems(itemsText: string): string[] {
    console.log('🔍 SPLITTING COMMA ITEMS:', itemsText);
    
    const items: string[] = [];
    
    // Simple split by comma, then clean each item
    const rawItems = itemsText.split(/\s*,\s*/);
    
    for (let i = 0; i < rawItems.length; i++) {
      let currentItem = rawItems[i].trim();
      
      // Check if this looks like an incomplete "Menge" pattern
      // E.g., if we have "Milch Menge" and the next item is "1 Liter"
      if (i < rawItems.length - 1) {
        const nextItem = rawItems[i + 1].trim();
        
        // Pattern: current item ends with "Menge" and next item starts with number/amount
        if (currentItem.toLowerCase().endsWith('menge') && /^\d+/.test(nextItem)) {
          // Combine them: "Milch Menge" + "1 Liter" = "Milch Menge 1 Liter"
          currentItem = `${currentItem} ${nextItem}`;
          i++; // Skip the next item since we've consumed it
          console.log('🔍 COMBINED MENGE PATTERN:', currentItem);
        }
      }
      
      if (currentItem) {
        items.push(currentItem);
      }
    }
    
    console.log('🔍 SPLIT RESULT:', items);
    return items;
  }

  /**
   * 🎯 Parse a single item token using existing quantity extraction logic
   */
  private parseSingleItemFromToken(token: string): ParsedItem | null {
    console.log('🎯 PARSING SINGLE TOKEN:', token);
    
    if (!token.trim()) {
      return null;
    }

    // Use enhanced quantity extraction logic for tokens
    const quantityResult = this.extractQuantityFromToken(token);
    
    console.log('🎯 QUANTITY EXTRACTION RESULT:', quantityResult);
    
    // Determine confidence based on pattern matching
    let confidence: 'high' | 'medium' | 'low' = 'high';
    
    if (!quantityResult.itemName.trim()) {
      confidence = 'low';
    } else if (quantityResult.quantity && quantityResult.unit) {
      confidence = 'high';
    } else if (quantityResult.quantity) {
      confidence = 'medium';
    }

    return {
      itemName: quantityResult.itemName,
      quantity: quantityResult.quantity,
      unit: quantityResult.unit,
      originalText: token,
      confidence
    };
  }

  /**
   * 🔍 Modified quantity extraction for individual tokens (not full commands)
   */
  private extractQuantityFromToken(token: string): QuantityExtractionResult {
    console.log('🔍 EXTRACTING QUANTITY FROM TOKEN:', token);
    
    const cleanToken = token.trim();

    for (const patternDef of this.TOKEN_QUANTITY_PATTERNS) {
      const match = cleanToken.match(patternDef.pattern);
      
      if (match) {
        console.log(`🔍 MATCHED PATTERN ${patternDef.type}:`, match);
        
        const itemName = match[patternDef.itemGroup].trim();
        const quantity = match[patternDef.quantityGroup].trim();
        const unit = patternDef.unitGroup && match[patternDef.unitGroup] ? match[patternDef.unitGroup].trim() : undefined;
        
        // Combine quantity and unit if both exist
        const fullQuantity = unit ? `${quantity} ${unit}` : quantity;
        
        return {
          itemName,
          quantity: fullQuantity,
          unit
        };
      }
    }

    console.log('🔍 NO QUANTITY PATTERN MATCHED, RETURNING TOKEN AS ITEM NAME');
    
    // No pattern matched - return the token as item name
    return { 
      itemName: cleanToken 
    };
  }

  // ========================================
  // VALIDATION METHODS
  // ========================================

  /**
   * Validate if input contains multiple items (comma-separated)
   */
  hasMultipleItems(input: string): boolean {
    return input.includes(',') && input.split(',').length > 1;
  }

  /**
   * Validate if a quantity string is valid
   */
  isValidQuantity(quantity: string): boolean {
    if (!quantity) return false;
    
    // Check if it matches any quantity pattern
    const quantityRegex = /^\d+(?:[.,]\d+)?\s*(?:kg|g|gramm|liter|l|ml|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)?$/i;
    return quantityRegex.test(quantity.trim());
  }

  /**
   * Extract numeric value from quantity
   */
  extractNumericValue(quantity: string): number | null {
    if (!quantity) return null;
    
    const match = quantity.match(/^(\d+(?:[.,]\d+)?)/);
    if (match) {
      return parseFloat(match[1].replace(',', '.'));
    }
    
    return null;
  }

  /**
   * Extract unit from quantity
   */
  extractUnit(quantity: string): string | null {
    if (!quantity) return null;
    
    const match = quantity.match(/\d+(?:[.,]\d+)?\s*(.+)$/);
    if (match) {
      const unit = match[1].trim().toLowerCase();
      return QUANTITY_UNITS.find(u => u.toLowerCase() === unit) || null;
    }
    
    return null;
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Clean item name from command artifacts
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

  /**
   * Normalize quantity format
   */
  normalizeQuantity(quantity: string): string {
    if (!quantity) return '';
    
    // Replace comma with dot for decimal numbers
    return quantity.replace(/(\d+),(\d+)/, '$1.$2');
  }

  /**
   * Get parsing statistics for debugging
   */
  getParsingStats(input: string): {
    hasMultipleItems: boolean;
    itemCount: number;
    hasQuantities: boolean;
    commandType: string;
  } {
    const hasMultiple = this.hasMultipleItems(input);
    
    if (hasMultiple) {
      const result = this.parseMultipleItems(input);
      return {
        hasMultipleItems: true,
        itemCount: result.items.length,
        hasQuantities: result.items.some(item => item.quantity),
        commandType: result.command
      };
    } else {
      const extraction = this.extractQuantity(input);
      return {
        hasMultipleItems: false,
        itemCount: 1,
        hasQuantities: !!extraction.quantity,
        commandType: 'single_item'
      };
    }
  }
}