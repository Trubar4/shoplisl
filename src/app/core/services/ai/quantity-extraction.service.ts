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
  // TEXT NUMBER MAPPINGS (NEW)
  // ========================================

  private readonly TEXT_NUMBERS: { [key: string]: string } = {
    'ein': '1', 'eine': '1', 'einer': '1', 'eines': '1', 'einem': '1', 'einen': '1',
    'zwei': '2', 'zwo': '2',
    'drei': '3',
    'vier': '4',
    'fünf': '5', 'fuenf': '5',
    'sechs': '6',
    'sieben': '7',
    'acht': '8',
    'neun': '9',
    'zehn': '10',
    'elf': '11',
    'zwölf': '12', 'zwoelf': '12',
    'dreizehn': '13', 'dreizehen': '13',
    'vierzehn': '14', 'vierzehen': '14',
    'fünfzehn': '15', 'fuenfzehn': '15', 'fünfzehen': '15', 'fuenfzehen': '15',
    'sechzehn': '16', 'sechzehen': '16',
    'siebzehn': '17', 'siebzehen': '17',
    'achtzehn': '18', 'achtzehen': '18',
    'neunzehn': '19', 'neunzehen': '19',
    'zwanzig': '20'
  };

  // ========================================
  // QUANTITY PATTERNS (ENHANCED)
  // ========================================

  private readonly QUANTITY_PATTERNS: QuantityPattern[] = [
    // NEW: Pattern for text numbers with units: "drei kg Bananen", "zwei liter Milch"
    { 
      pattern: new RegExp(`^(${Object.keys(this.TEXT_NUMBERS).join('|')})\\s+(kg|g|gramm|liter|l|ml|el|tl|esslöffel|teelöffel|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)\\s+(.+)$`, 'i'),
      type: 'text_unit_item',
      itemGroup: 3,
      quantityGroup: 1,
      unitGroup: 2
    },
    // NEW: Pattern for "Artikel text_number Unit": "Bananen drei kg"
    { 
      pattern: new RegExp(`^(.+?)\\s+(${Object.keys(this.TEXT_NUMBERS).join('|')})\\s+(kg|g|gramm|liter|l|ml|el|tl|esslöffel|teelöffel|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)$`, 'i'),
      type: 'item_text_unit',
      itemGroup: 1,
      quantityGroup: 2,
      unitGroup: 3
    },
    // NEW: Pattern for "Artikel Menge text_number Unit": "Milch Menge drei Liter"
    { 
      pattern: new RegExp(`^(.+?)\\s+menge\\s+(${Object.keys(this.TEXT_NUMBERS).join('|')})\\s+(kg|g|gramm|liter|l|ml|el|tl|esslöffel|teelöffel|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)$`, 'i'),
      type: 'item_menge_text_unit',
      itemGroup: 1,
      quantityGroup: 2,
      unitGroup: 3
    },
    // NEW: Pattern for "text_number x Artikel": "drei x Bananen"
    { 
      pattern: new RegExp(`^(${Object.keys(this.TEXT_NUMBERS).join('|')})\\s*x\\s+(.+)$`, 'i'),
      type: 'text_x_item',
      itemGroup: 2,
      quantityGroup: 1
    },
    // NEW: Pattern for "text_number Artikel": "drei Bananen"
    { 
      pattern: new RegExp(`^(${Object.keys(this.TEXT_NUMBERS).join('|')})\\s+(.+)$`, 'i'),
      type: 'text_item',
      itemGroup: 2,
      quantityGroup: 1
    },
    // EXISTING: Pattern 1: "Artikel Menge Amount Unit" → "Milch Menge 1l"
    { 
      pattern: /^(.+?)\s+menge\s+(\d+(?:[.,]\d+)?\s*(?:kg|g|gramm|liter|l|ml|el|tl|esslöffel|teelöffel|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser))$/i,
      type: 'item_menge_amount',
      itemGroup: 1,
      quantityGroup: 2
    },
    // EXISTING: Pattern 2: "Amount Unit Artikel" → "2kg Bananen", "500ml Milch"
    { 
      pattern: /^(\d+(?:[.,]\d+)?\s*(?:kg|g|gramm|liter|l|ml|el|tl|esslöffel|teelöffel|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser))\s+(.+)$/i,
      type: 'unit_start',
      itemGroup: 2,
      quantityGroup: 1
    },
    // EXISTING: Pattern 3: "Amount x Artikel" → "2x Bananen", "3 x Äpfel"
    { 
      pattern: /^(\d+(?:[.,]\d+)?)\s*x\s+(.+)$/i,
      type: 'x_notation',
      itemGroup: 2,
      quantityGroup: 1
    },
    // EXISTING: Pattern 4: "Artikel Amount Unit" → "Bananen 2kg", "Milch 1 Liter"
    { 
      pattern: /^(.+?)\s+(\d+(?:[.,]\d+)?\s*(?:kg|g|gramm|liter|l|ml|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser))$/i,
      type: 'unit_end',
      itemGroup: 1,
      quantityGroup: 2
    },
    // EXISTING: Pattern 5: "Amount Artikel" → "2 Bananen", "3 Äpfel"
    { 
      pattern: /^(\d+(?:[.,]\d+)?)\s+(.+)$/i,
      type: 'number_start',
      itemGroup: 2,
      quantityGroup: 1
    }
  ];

  // ========================================
  // TOKEN QUANTITY PATTERNS (ENHANCED)
  // ========================================

  private readonly TOKEN_QUANTITY_PATTERNS: QuantityPattern[] = [
    // NEW: Text number patterns for tokens
    { 
      pattern: new RegExp(`^(${Object.keys(this.TEXT_NUMBERS).join('|')})\\s+(kg|g|gramm|liter|l|ml|el|tl|esslöffel|teelöffel|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)\\s+(.+)$`, 'i'),
      type: 'text_unit_item',
      itemGroup: 3,
      quantityGroup: 1,
      unitGroup: 2
    },
    { 
      pattern: new RegExp(`^(.+?)\\s+(${Object.keys(this.TEXT_NUMBERS).join('|')})\\s+(kg|g|gramm|liter|l|ml|el|tl|esslöffel|teelöffel|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)$`, 'i'),
      type: 'item_text_unit',
      itemGroup: 1,
      quantityGroup: 2,
      unitGroup: 3
    },
    { 
      pattern: new RegExp(`^(.+?)\\s+menge\\s+(${Object.keys(this.TEXT_NUMBERS).join('|')})\\s+(kg|g|gramm|liter|l|ml|el|tl|esslöffel|teelöffel|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)$`, 'i'),
      type: 'item_menge_text_unit',
      itemGroup: 1,
      quantityGroup: 2,
      unitGroup: 3
    },
    { 
      pattern: new RegExp(`^(${Object.keys(this.TEXT_NUMBERS).join('|')})\\s*x\\s+(.+)$`, 'i'),
      type: 'text_x_item',
      itemGroup: 2,
      quantityGroup: 1,
      unitGroup: null
    },
    { 
      pattern: new RegExp(`^(${Object.keys(this.TEXT_NUMBERS).join('|')})\\s+(.+)$`, 'i'),
      type: 'text_item',
      itemGroup: 2,
      quantityGroup: 1,
      unitGroup: null
    },
    // EXISTING: Pattern 1: "Artikel Menge Amount Unit" → "Milch Menge 1 Liter"
    { 
      pattern: /^(.+?)\s+menge\s+(\d+(?:[.,]\d+)?)\s*(kg|g|gramm|liter|l|ml|el|tl|esslöffel|teelöffel|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)?$/i,
      type: 'item_menge_amount_unit',
      itemGroup: 1,
      quantityGroup: 2,
      unitGroup: 3
    },
    // EXISTING: Pattern 2: "Amount Unit Artikel" → "2kg Bananen", "500ml Milch"
    { 
      pattern: /^(\d+(?:[.,]\d+)?)\s*(kg|g|gramm|liter|l|ml|el|tl|esslöffel|teelöffel|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)\s+(.+)$/i,
      type: 'amount_unit_item',
      itemGroup: 3,
      quantityGroup: 1,
      unitGroup: 2
    },
    // EXISTING: Pattern 3: "Amount x Artikel" → "2x Bananen", "3 x Äpfel"
    { 
      pattern: /^(\d+(?:[.,]\d+)?)\s*x\s+(.+)$/i,
      type: 'amount_x_item',
      itemGroup: 2,
      quantityGroup: 1,
      unitGroup: null
    },
    // EXISTING: Pattern 4: "Artikel Amount Unit" → "Bananen 2kg", "Milch 1 Liter"
    { 
      pattern: /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(kg|g|gramm|liter|l|ml|el|tl|esslöffel|teelöffel|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)$/i,
      type: 'item_amount_unit',
      itemGroup: 1,
      quantityGroup: 2,
      unitGroup: 3
    },
    // EXISTING: Pattern 5: "Amount Artikel" → "2 Bananen", "3 Äpfel"
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
  // HELPER METHODS (NEW)
  // ========================================

  /**
   * 🔍 Convert text numbers to digits
   */
  private convertTextToNumber(textNumber: string): string {
    const lowerText = textNumber.toLowerCase().trim();
    return this.TEXT_NUMBERS[lowerText] || textNumber;
  }

  /**
   * 🔍 Process quantity that might contain text numbers
   */
  private processQuantity(quantity: string, unit?: string): string {
    const convertedNumber = this.convertTextToNumber(quantity);
    
    if (unit) {
      return `${convertedNumber} ${unit}`;
    }
    
    return convertedNumber;
  }

  // ========================================
  // SINGLE ITEM QUANTITY EXTRACTION (ENHANCED)
  // ========================================

  /**
   * 🔍 ENHANCED: Extract quantity with text number support
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
      const { pattern, type, itemGroup, quantityGroup, unitGroup } = this.QUANTITY_PATTERNS[i];
      const match = cleanedInput.match(pattern);
      
      if (match) {
        console.log(`🔍 MATCHED PATTERN ${type}:`, match);
        
        const itemName = match[itemGroup].trim();
        const rawQuantity = match[quantityGroup].trim();
        const unit = unitGroup && match[unitGroup] ? match[unitGroup].trim() : undefined;
        
        // Process quantity (convert text numbers to digits)
        const processedQuantity = this.processQuantity(rawQuantity, unit);

        console.log('🔍 EXTRACTED:', { itemName, quantity: processedQuantity, originalInput });
        
        return {
          itemName: itemName,
          quantity: processedQuantity
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
  // MULTI-ITEM PARSING (ENHANCED)
  // ========================================

  /**
   * 🎯 Enhanced: Parse comma-separated items with text number support
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
   * Handles: "Bananen, zwei kg Würste, Milch Menge drei Liter" 
   */
  private splitCommaItems(itemsText: string): string[] {
    console.log('🔍 SPLITTING COMMA ITEMS:', itemsText);
    
    const items: string[] = [];
    
    // Simple split by comma, then clean each item
    const rawItems = itemsText.split(/\s*,\s*/);
    
    for (let i = 0; i < rawItems.length; i++) {
      let currentItem = rawItems[i].trim();
      
      // Check if this looks like an incomplete "Menge" pattern
      // E.g., if we have "Milch Menge" and the next item is "drei Liter"
      if (i < rawItems.length - 1) {
        const nextItem = rawItems[i + 1].trim();
        
        // Pattern: current item ends with "Menge" and next item starts with number/text number/amount
        if (currentItem.toLowerCase().endsWith('menge') && (/^\d+/.test(nextItem) || this.startsWithTextNumber(nextItem))) {
          // Combine them: "Milch Menge" + "drei Liter" = "Milch Menge drei Liter"
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
   * 🔍 Check if text starts with a text number
   */
  private startsWithTextNumber(text: string): boolean {
    const lowerText = text.toLowerCase().trim();
    return Object.keys(this.TEXT_NUMBERS).some(textNum => 
      lowerText.startsWith(textNum + ' ')
    );
  }

  /**
   * 🎯 Parse a single item token using enhanced quantity extraction logic
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
   * 🔍 Modified quantity extraction for individual tokens with text number support
   */
  private extractQuantityFromToken(token: string): QuantityExtractionResult {
    console.log('🔍 EXTRACTING QUANTITY FROM TOKEN:', token);
    
    const cleanToken = token.trim();

    for (const patternDef of this.TOKEN_QUANTITY_PATTERNS) {
      const match = cleanToken.match(patternDef.pattern);
      
      if (match) {
        console.log(`🔍 MATCHED PATTERN ${patternDef.type}:`, match);
        
        const itemName = match[patternDef.itemGroup].trim();
        const rawQuantity = match[patternDef.quantityGroup].trim();
        const unit = patternDef.unitGroup && match[patternDef.unitGroup] ? match[patternDef.unitGroup].trim() : undefined;
        
        // Convert text numbers to digits
        const convertedQuantity = this.convertTextToNumber(rawQuantity);
        
        // Combine quantity and unit if both exist
        const fullQuantity = unit ? `${convertedQuantity} ${unit}` : convertedQuantity;
        
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
   * Enhanced: Validate if a quantity string is valid (including text numbers)
   */
  isValidQuantity(quantity: string): boolean {
    if (!quantity) return false;
    
    // Check if it matches any quantity pattern (numeric or text)
    const quantityRegex = /^\d+(?:[.,]\d+)?\s*(?:kg|g|gramm|liter|l|ml|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)?$/i;
    const textNumberRegex = new RegExp(`^(${Object.keys(this.TEXT_NUMBERS).join('|')})\\s*(?:kg|g|gramm|liter|l|ml|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser)?$`, 'i');
    
    return quantityRegex.test(quantity.trim()) || textNumberRegex.test(quantity.trim());
  }

  /**
   * Enhanced: Extract numeric value from quantity (handles text numbers)
   */
  extractNumericValue(quantity: string): number | null {
    if (!quantity) return null;
    
    // First try to extract numeric value directly
    const match = quantity.match(/^(\d+(?:[.,]\d+)?)/);
    if (match) {
      return parseFloat(match[1].replace(',', '.'));
    }
    
    // Try to find text number and convert it
    const lowerQuantity = quantity.toLowerCase().trim();
    for (const [textNum, digit] of Object.entries(this.TEXT_NUMBERS)) {
      if (lowerQuantity.startsWith(textNum)) {
        return parseFloat(digit);
      }
    }
    
    return null;
  }

  /**
   * Extract unit from quantity
   */
  extractUnit(quantity: string): string | null {
    if (!quantity) return null;
    
    const match = quantity.match(/(?:\d+(?:[.,]\d+)?|[a-z]+)\s*(.+)$/i);
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
    
    // Convert text numbers to digits first
    let normalized = quantity;
    for (const [textNum, digit] of Object.entries(this.TEXT_NUMBERS)) {
      const regex = new RegExp(`\\b${textNum}\\b`, 'gi');
      normalized = normalized.replace(regex, digit);
    }
    
    // Replace comma with dot for decimal numbers
    return normalized.replace(/(\d+),(\d+)/, '$1.$2');
  }

  /**
   * Get parsing statistics for debugging
   */
  getParsingStats(input: string): {
    hasMultipleItems: boolean;
    itemCount: number;
    hasQuantities: boolean;
    hasTextNumbers: boolean;
    commandType: string;
  } {
    const hasMultiple = this.hasMultipleItems(input);
    const hasTextNumbers = Object.keys(this.TEXT_NUMBERS).some(textNum => 
      input.toLowerCase().includes(textNum)
    );
    
    if (hasMultiple) {
      const result = this.parseMultipleItems(input);
      return {
        hasMultipleItems: true,
        itemCount: result.items.length,
        hasQuantities: result.items.some(item => item.quantity),
        hasTextNumbers,
        commandType: result.command
      };
    } else {
      const extraction = this.extractQuantity(input);
      return {
        hasMultipleItems: false,
        itemCount: 1,
        hasQuantities: !!extraction.quantity,
        hasTextNumbers,
        commandType: 'single_item'
      };
    }
  }

  /**
   * Get all supported text numbers for debugging/help
   */
  getSupportedTextNumbers(): string[] {
    return Object.keys(this.TEXT_NUMBERS);
  }
}