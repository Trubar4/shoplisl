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

    // TEMP DEBUG: Test specific patterns
    if (cleanedInput.includes('Flaschen')) {
      console.log('🔍 DEBUG: Input contains "Flaschen"');
      console.log('🔍 DEBUG: Testing pattern 2 (unit_start)');
      const testPattern = /^(\d+(?:[.,]\d+)?\s*(?:kg|g|gramm|liter|l|ml|el|tl|esslöffel|teelöffel|stück|stk|pack|packung|paket|pakete|dose|dosen|becher|flasche|flaschen|tube|schachtel|kasten|bund|glas|gläser))\s+(.+)$/i;
      const testMatch = cleanedInput.match(testPattern);
      console.log('🔍 DEBUG: Pattern 2 match result:', testMatch);
    }
    
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
   * 🎯 Enhanced: Parse comma-separated items with text number support and smart decimal comma detection
   */
  parseMultipleItems(input: string) {
    const cleanInput = input
      .replace(/^(füge|hinzu|erstelle|liste|rezept:?)\s*/gi, '')
      .replace(/\s+(hinzu|zu|in)(\s+\w+)?\s*$/gi, '')
      .trim();

    // Extract list name from original input
    let listName: string | undefined;
    let command: 'add_items' | 'create_list_with_items' = 'add_items';

    // Check for list creation patterns
    const createListMatch = input.match(/erstelle\s+liste\s+(.+?)\s+mit\s+(.+)/i);
    if (createListMatch) {
      listName = createListMatch[1].trim();
      command = 'create_list_with_items';
    } else {
      // Check for "zu [listname] hinzu" pattern
      const addToListMatch = input.match(/zu\s+(.+?)\s+hinzu/i);
      if (addToListMatch) {
        listName = addToListMatch[1].trim();
      }
    }

    // IMPROVED: Use smart comma splitting that preserves decimal commas
    if (cleanInput.includes(',') || cleanInput.includes(';')) {
      const parts = this.splitCommaItems(cleanInput);

      // POST-PROCESS: Check each part for conjunctions
      const finalParts: string[] = [];
      const conjunctions = ['und', 'sowie', 'außerdem'];

      parts.forEach(part => {
        const hasConjunction = conjunctions.some(conj => part.toLowerCase().includes(` ${conj} `));

        if (hasConjunction) {
          // Further split this part by conjunctions
          const subParts = part.split(new RegExp(`\\s+(${conjunctions.join('|')})\\s+`, 'gi'))
            .filter((subPart, index) => index % 2 === 0) // Remove conjunction words
            .map(subPart => subPart.trim())
            .filter(subPart => subPart.length > 0);

          finalParts.push(...subParts);
        } else {
          finalParts.push(part);
        }
      });

      const items = finalParts.map(item => {
        const extraction = this.extractQuantity(item);
        return {
          itemName: extraction.itemName,
          quantity: extraction.quantity,
          originalText: item,
          confidence: 'high' as const
        };
      });

      return {
        command,
        items: items,
        listName,
        originalInput: input,
        parseErrors: []
      };
    }
  
    // NEW: Space-separated with quantities
    const quantityPattern = /(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|el|tl|prise|stück|stk|pack|dose|flasche|becher|gramm|liter)?\s+([a-zA-ZäöüÄÖÜß][a-zA-ZäöüÄÖÜß\s]*?)(?=\s+\d|$)/gi;
    const matches = [...cleanInput.matchAll(quantityPattern)];
    
    if (matches.length >= 2) {
      const items = matches.map(match => ({
        itemName: match[3].trim(),
        quantity: `${match[1]}${match[2] ? ' ' + match[2] : ''}`,
        originalText: match[0],
        confidence: 'high' as const
      }));
      
      return {
        command,
        items: items,
        listName,
        originalInput: input,
        parseErrors: []
      };
    }
  
    // NEW: Natural language patterns
    const conjunctions = ['und', 'sowie', 'außerdem'];
    const hasConjunctions = conjunctions.some(conj => cleanInput.toLowerCase().includes(` ${conj} `));
    
    if (hasConjunctions) {
      const parts = cleanInput.split(new RegExp(`\\s+(${conjunctions.join('|')})\\s+`, 'gi'))
        .filter((part, index) => index % 2 === 0)
        .filter(part => part.trim().length > 0);
      
      if (parts.length >= 2) {
        const items = parts.map(part => {
          const extraction = this.extractQuantity(part.trim());
          return {
            itemName: extraction.itemName,
            quantity: extraction.quantity,
            originalText: part.trim(),
            confidence: 'medium' as const
          };
        });
        
        return {
          command,
          items: items,
          listName,
          originalInput: input,
          parseErrors: []
        };
      }
    }
  
    // Fallback to existing logic
    return {
      command: 'unrecognized' as const,
      items: [],
      listName: undefined,
      originalInput: input,
      parseErrors: ['No multiple items detected']
    };
  }

  /**
 * 🔍 Check if a comma is a decimal separator (like "0,5") vs item separator
 */
private isDecimalComma(before: string, after: string): boolean {
  // Extract the last character before comma and first character after comma
  const charBefore = before.slice(-1);
  const charAfter = after.slice(0, 1);
  
  // It's a decimal comma if:
  // 1. There's a digit immediately before AND immediately after the comma
  // 2. AND the digit before is part of a number (not standalone)
  const isDigitBefore = /\d/.test(charBefore);
  const isDigitAfter = /\d/.test(charAfter);
  
  if (!isDigitBefore || !isDigitAfter) {
    return false;
  }
  
  // Additional check: make sure it's actually a decimal number
  // Look for patterns like "0,5" or "123,45" 
  const beforeMatch = before.match(/(\d+)$/);
  const afterMatch = after.match(/^(\d+)/);
  
  if (beforeMatch && afterMatch) {
    const numberBefore = beforeMatch[1];
    const numberAfter = afterMatch[1];
    
    // Typical decimal patterns: single digit before comma, 1-3 digits after
    // "0,5", "1,25", "12,345" etc.
    if (numberBefore.length <= 3 && numberAfter.length <= 3) {
      return true;
    }
  }
  
  return false;
}

  /**
   * 🔍 Smart comma splitting that preserves "Menge" constructs
   * Handles: "Bananen, zwei kg Würste, Milch Menge drei Liter" 
   */
  private splitCommaItems(itemsText: string): string[] {
    console.log('🔍 SPLITTING COMMA ITEMS:', itemsText);
    
    // Step 1: Check if we have semicolons - if so, use semicolon splitting (AI response format)
    if (itemsText.includes(';')) {
      console.log('🔍 Found semicolons - using semicolon splitting');
      const items = itemsText
        .split(/\s*;\s*/)
        .map(item => item.trim())
        .filter(item => item.length > 0);
      
      console.log('🔍 SEMICOLON SPLIT RESULT:', items);
      return items;
    }
    
    // Step 2: For comma-separated items, we need to be smart about decimal commas
    if (itemsText.includes(',')) {
      console.log('🔍 Found commas - analyzing for decimal vs separator commas');
      
      const items: string[] = [];
      let currentPosition = 0;
      
      // Find all comma positions
      const commas: number[] = [];
      for (let i = 0; i < itemsText.length; i++) {
        if (itemsText[i] === ',') {
          commas.push(i);
        }
      }
      
      if (commas.length === 0) {
        return [itemsText.trim()];
      }
      
      // Analyze each comma to determine if it's decimal or separator
      const separatorCommas: number[] = [];
      
      for (const commaPos of commas) {
        const before = itemsText.substring(Math.max(0, commaPos - 3), commaPos);
        const after = itemsText.substring(commaPos + 1, Math.min(itemsText.length, commaPos + 4));
        
        console.log(`🔍 Comma at ${commaPos}: "${before.slice(-1)},${after.slice(0, 1)}" - ${this.isDecimalComma(before, after) ? 'DECIMAL' : 'SEPARATOR'}`);
        
        // Check if this is a decimal comma (digit before AND digit after)
        if (!this.isDecimalComma(before, after)) {
          separatorCommas.push(commaPos);
        }
      }
      
      // Split only at separator commas
      if (separatorCommas.length > 0) {
        let lastPos = 0;
        
        for (const commaPos of separatorCommas) {
          const item = itemsText.substring(lastPos, commaPos).trim();
          if (item) {
            items.push(item);
          }
          lastPos = commaPos + 1;
        }
        
        // Add the last item
        const lastItem = itemsText.substring(lastPos).trim();
        if (lastItem) {
          items.push(lastItem);
        }
        
        console.log('🔍 SMART COMMA SPLIT RESULT:', items);
        return items.filter(item => item.length > 0);
      }
    }
    
    // Step 3: No separators found - return as single item
    console.log('🔍 No separators found - returning as single item');
    return [itemsText.trim()].filter(item => item.length > 0);
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
    // Remove command words to focus on content
    const cleanInput = input
      .replace(/^(füge|hinzu|erstelle|liste|rezept:?)\s*/gi, '')
      .replace(/\s+(hinzu|zu|in)(\s+\w+)?\s*$/gi, '')
      .trim();
    
    // Method 1: Comma/semicolon separated (existing)
    if (cleanInput.includes(',') || cleanInput.includes(';')) {
      return cleanInput.split(/[,;]/).length > 1;
    }
    
    // Method 2: NEW - Space-separated with quantities
    const quantityPattern = /(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|el|tl|prise|stück|stk|pack|dose|flasche|becher|gramm|liter)?\s+([a-zA-ZäöüÄÖÜß][a-zA-ZäöüÄÖÜß\s]*?)(?=\s+\d|$)/gi;
    const matches = [...cleanInput.matchAll(quantityPattern)];
    
    if (matches.length >= 2) {
      return true;
    }
    
    // Method 3: NEW - Natural language patterns
    const conjunctions = ['und', 'sowie', 'außerdem', 'dann', 'danach', 'noch'];
    const hasConjunctions = conjunctions.some(conj => cleanInput.toLowerCase().includes(` ${conj} `));
    
    if (hasConjunctions) {
      const parts = cleanInput.split(new RegExp(`\\s+(${conjunctions.join('|')})\\s+`, 'gi'))
        .filter((part, index) => index % 2 === 0)
        .filter(part => part.trim().length > 0);
      
      return parts.length >= 2;
    }
    
    return false;
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