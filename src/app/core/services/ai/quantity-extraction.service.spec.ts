import { vi } from 'vitest';
import { QuantityExtractionService } from './quantity-extraction.service';

describe('QuantityExtractionService', () => {
  let service: QuantityExtractionService;

  // Mock LoggerService
  const loggerMock = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn()
  } as any;

  beforeEach(() => {
    // Direct instantiation instead of TestBed to avoid Angular DI issues
    service = new QuantityExtractionService(loggerMock);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // =========================================
  // GERMAN NUMBER FORMATS - DECIMALS WITH COMMA
  // =========================================

  describe('German Number Formats - Decimal Comma', () => {
    it('should extract German decimal with comma (0,5 Liter)', () => {
      const result = service.extractQuantity('0,5 Liter Milch');

      expect(result.itemName).toBe('Milch');
      expect(result.quantity).toContain('0,5');
      expect(result.quantity).toContain('Liter');
    });

    it('should extract German decimal (1,5kg Bananen)', () => {
      const result = service.extractQuantity('1,5kg Bananen');

      expect(result.itemName).toBe('Bananen');
      expect(result.quantity).toBe('1,5kg');
    });

    it('should extract German decimal with space (2,5 kg Äpfel)', () => {
      const result = service.extractQuantity('2,5 kg Äpfel');

      expect(result.itemName).toBe('Äpfel');
      expect(result.quantity).toContain('2,5');
    });

    it('should handle article name first with decimal (Mehl 0,5 kg)', () => {
      const result = service.extractQuantity('Mehl 0,5 kg');

      expect(result.itemName).toBe('Mehl');
      expect(result.quantity).toContain('0,5');
    });

    it('should handle "Menge" format with decimal (Milch Menge 1,5 Liter)', () => {
      const result = service.extractQuantity('Milch Menge 1,5 Liter');

      expect(result.itemName).toBe('Milch');
      expect(result.quantity).toContain('1,5');
    });
  });

  // =========================================
  // TEXT NUMBERS (GERMAN)
  // =========================================

  describe('Text Numbers (German)', () => {
    it('should convert "ein" to "1"', () => {
      const result = service.extractQuantity('ein kg Mehl');

      expect(result.itemName).toBe('Mehl');
      expect(result.quantity).toContain('1');
    });

    it('should convert "zwei" to "2"', () => {
      const result = service.extractQuantity('zwei Liter Milch');

      expect(result.itemName).toBe('Milch');
      expect(result.quantity).toContain('2');
    });

    it('should convert "drei" to "3"', () => {
      const result = service.extractQuantity('drei kg Bananen');

      expect(result.itemName).toBe('Bananen');
      expect(result.quantity).toContain('3');
    });

    it('should convert "fünf" to "5"', () => {
      const result = service.extractQuantity('fünf Stück Äpfel');

      expect(result.itemName).toBe('Äpfel');
      expect(result.quantity).toContain('5');
    });

    it('should handle "ein" with x notation (ein x Brot)', () => {
      const result = service.extractQuantity('ein x Brot');

      expect(result.itemName).toBe('Brot');
      expect(result.quantity).toContain('1');
    });

    it('should handle text numbers without units (drei Bananen)', () => {
      const result = service.extractQuantity('drei Bananen');

      expect(result.itemName).toBe('Bananen');
      expect(result.quantity).toBe('3');
    });

    it('should handle larger text numbers (zwanzig Äpfel)', () => {
      const result = service.extractQuantity('zwanzig Äpfel');

      expect(result.itemName).toBe('Äpfel');
      expect(result.quantity).toBe('20');
    });

    it('should handle article first format (Bananen drei kg)', () => {
      const result = service.extractQuantity('Bananen drei kg');

      expect(result.itemName).toBe('Bananen');
      expect(result.quantity).toContain('3');
    });
  });

  // =========================================
  // QUANTITY UNITS (GERMAN)
  // =========================================

  describe('Quantity Units (German)', () => {
    it('should extract kg unit', () => {
      const result = service.extractQuantity('2kg Mehl');

      expect(result.itemName).toBe('Mehl');
      expect(result.quantity).toBe('2kg');
    });

    it('should extract g (Gramm) unit', () => {
      const result = service.extractQuantity('500g Zucker');

      expect(result.itemName).toBe('Zucker');
      expect(result.quantity).toBe('500g');
    });

    it('should extract "gramm" spelled out', () => {
      const result = service.extractQuantity('250 gramm Butter');

      expect(result.itemName).toBe('Butter');
      expect(result.quantity).toContain('250');
      expect(result.quantity).toContain('gramm');
    });

    it('should extract Liter unit', () => {
      const result = service.extractQuantity('1 Liter Milch');

      expect(result.itemName).toBe('Milch');
      expect(result.quantity).toContain('1');
      expect(result.quantity).toContain('Liter');
    });

    it('should extract ml (Milliliter) unit', () => {
      const result = service.extractQuantity('500ml Saft');

      expect(result.itemName).toBe('Saft');
      expect(result.quantity).toBe('500ml');
    });

    it('should extract Stück unit', () => {
      const result = service.extractQuantity('3 Stück Eier');

      expect(result.itemName).toBe('Eier');
      expect(result.quantity).toContain('3');
      expect(result.quantity).toContain('Stück');
    });

    it('should extract Pack/Packung unit', () => {
      const result = service.extractQuantity('2 Pack Butter');

      expect(result.itemName).toBe('Butter');
      expect(result.quantity).toContain('2');
      expect(result.quantity).toContain('Pack');
    });

    it('should extract Dose unit', () => {
      const result = service.extractQuantity('1 Dose Tomaten');

      expect(result.itemName).toBe('Tomaten');
      expect(result.quantity).toContain('1');
      expect(result.quantity).toContain('Dose');
    });

    it('should extract Flasche unit', () => {
      const result = service.extractQuantity('2 Flaschen Wasser');

      expect(result.itemName).toBe('Wasser');
      expect(result.quantity).toContain('2');
      expect(result.quantity).toContain('Flaschen');
    });

    it('should extract EL (Esslöffel) unit', () => {
      const result = service.extractQuantity('2 EL Öl');

      expect(result.itemName).toBe('Öl');
      expect(result.quantity).toContain('2');
      expect(result.quantity).toContain('EL');
    });

    it('should extract TL (Teelöffel) unit', () => {
      const result = service.extractQuantity('1 TL Salz');

      expect(result.itemName).toBe('Salz');
      expect(result.quantity).toContain('1');
      expect(result.quantity).toContain('TL');
    });
  });

  // =========================================
  // QUANTITY PATTERNS
  // =========================================

  describe('Quantity Patterns', () => {
    it('should handle "Amount Unit Artikel" format (2kg Bananen)', () => {
      const result = service.extractQuantity('2kg Bananen');

      expect(result.itemName).toBe('Bananen');
      expect(result.quantity).toBe('2kg');
    });

    it('should handle "Amount x Artikel" format (3x Äpfel)', () => {
      const result = service.extractQuantity('3x Äpfel');

      expect(result.itemName).toBe('Äpfel');
      expect(result.quantity).toBe('3');
    });

    it('should handle "Artikel Amount Unit" format (Bananen 2kg)', () => {
      const result = service.extractQuantity('Bananen 2kg');

      expect(result.itemName).toBe('Bananen');
      expect(result.quantity).toBe('2kg');
    });

    it('should handle "Amount Artikel" format (2 Bananen)', () => {
      const result = service.extractQuantity('2 Bananen');

      expect(result.itemName).toBe('Bananen');
      expect(result.quantity).toBe('2');
    });

    it('should handle "Artikel Menge Amount" format (Milch Menge 1l)', () => {
      const result = service.extractQuantity('Milch Menge 1l');

      expect(result.itemName).toBe('Milch');
      expect(result.quantity).toBe('1l');
    });
  });

  // =========================================
  // SPECIAL CHARACTERS IN ARTICLE NAMES
  // =========================================

  describe('Special Characters in Article Names', () => {
    it('should handle umlauts (Äpfel, Öl, Würstchen)', () => {
      const result1 = service.extractQuantity('2kg Äpfel');
      expect(result1.itemName).toBe('Äpfel');

      const result2 = service.extractQuantity('500ml Öl');
      expect(result2.itemName).toBe('Öl');

      const result3 = service.extractQuantity('3 Würstchen');
      expect(result3.itemName).toBe('Würstchen');
    });

    it('should handle eszett ß (Soße)', () => {
      const result = service.extractQuantity('200g Soße');

      expect(result.itemName).toBe('Soße');
      expect(result.quantity).toBe('200g');
    });

    it('should handle hyphen in names (Bio-Milch)', () => {
      const result = service.extractQuantity('1 Liter Bio-Milch');

      expect(result.itemName).toBe('Bio-Milch');
    });

    it('should handle comma in quantity (1,5kg Mehl)', () => {
      const result = service.extractQuantity('1,5kg Mehl');

      expect(result.itemName).toBe('Mehl');
      expect(result.quantity).toBe('1,5kg');
    });

    it('should handle period in article name (Milch 3.5%)', () => {
      const result = service.extractQuantity('1 Liter Milch 3.5%');

      expect(result.itemName).toContain('Milch');
    });

    it('should handle colon in article name (Äpfel: Granny Smith)', () => {
      const result = service.extractQuantity('2kg Äpfel: Granny Smith');

      expect(result.itemName).toContain('Äpfel');
    });

    it('should handle underscore in article names', () => {
      const result = service.extractQuantity('1kg Test_Artikel');

      expect(result.itemName).toBe('Test_Artikel');
    });
  });

  // =========================================
  // MULTI-ITEM PARSING
  // =========================================

  describe('Multi-Item Parsing', () => {
    it('should parse comma-separated items (Milch, Brot, Butter)', () => {
      const result = service.parseMultipleItems('Milch, Brot, Butter');

      expect(result.items.length).toBe(3);
      expect(result.items[0].itemName).toBe('Milch');
      expect(result.items[1].itemName).toBe('Brot');
      expect(result.items[2].itemName).toBe('Butter');
    });

    it('should parse semicolon-separated items (500g Mehl; 2 Eier; 400ml Milch)', () => {
      const result = service.parseMultipleItems('500g Mehl; 2 Eier; 400ml Milch');

      expect(result.items.length).toBe(3);
      expect(result.items[0].itemName).toBe('Mehl');
      expect(result.items[0].quantity).toContain('500');
      expect(result.items[1].itemName).toBe('Eier');
      expect(result.items[2].itemName).toBe('Milch');
    });

    it('should preserve decimal comma in quantities (0,5kg Mehl, 1,5 Liter Milch)', () => {
      const result = service.parseMultipleItems('0,5kg Mehl, 1,5 Liter Milch');

      expect(result.items.length).toBe(2);
      expect(result.items[0].itemName).toBe('Mehl');
      expect(result.items[0].quantity).toContain('0,5');
      expect(result.items[1].itemName).toBe('Milch');
      expect(result.items[1].quantity).toContain('1,5');
    });

    it('should distinguish decimal comma from separator comma', () => {
      const result = service.parseMultipleItems('0,5kg Mehl, 2 Eier, 1,5l Milch');

      // Should split into 3 items, not 5
      expect(result.items.length).toBe(3);
      expect(result.items[0].quantity).toContain('0,5');
      expect(result.items[2].quantity).toContain('1,5');
    });

    it('should handle "und" conjunction (Milch und Brot)', () => {
      const result = service.parseMultipleItems('Milch und Brot');

      expect(result.items.length).toBe(2);
      expect(result.items[0].itemName).toBe('Milch');
      expect(result.items[1].itemName).toBe('Brot');
    });

    it('should handle mixed separators and conjunctions (Milch, Brot und Butter)', () => {
      const result = service.parseMultipleItems('Milch, Brot und Butter');

      expect(result.items.length).toBe(3);
      expect(result.items[0].itemName).toBe('Milch');
      expect(result.items[1].itemName).toBe('Brot');
      expect(result.items[2].itemName).toBe('Butter');
    });

    it('should extract quantities from each item in multi-item input', () => {
      const result = service.parseMultipleItems('2kg Mehl, 3 Eier, 500ml Milch');

      expect(result.items[0].quantity).toContain('2');
      expect(result.items[1].quantity).toBe('3');
      expect(result.items[2].quantity).toContain('500');
    });

    it('should handle text numbers in multi-item input', () => {
      const result = service.parseMultipleItems('zwei kg Mehl, drei Eier, ein Liter Milch');

      expect(result.items.length).toBe(3);
      expect(result.items[0].quantity).toContain('2');
      expect(result.items[1].quantity).toBe('3');
      expect(result.items[2].quantity).toContain('1');
    });
  });

  // =========================================
  // EDGE CASES
  // =========================================

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const result = service.extractQuantity('');

      expect(result.itemName).toBe('');
    });

    it('should handle whitespace-only input', () => {
      const result = service.extractQuantity('   ');

      expect(result.itemName).toBe('');
    });

    it('should handle input without quantity (just article name)', () => {
      const result = service.extractQuantity('Milch');

      expect(result.itemName).toBe('Milch');
      expect(result.quantity).toBeUndefined();
    });

    it('should handle very long article names', () => {
      const longName = 'A'.repeat(100);
      const result = service.extractQuantity(`1kg ${longName}`);

      expect(result.itemName).toBe(longName);
      expect(result.quantity).toBe('1kg');
    });

    it('should handle multiple spaces between quantity and article', () => {
      const result = service.extractQuantity('2kg     Mehl');

      expect(result.itemName).toBe('Mehl');
      expect(result.quantity).toBe('2kg');
    });

    it('should handle command prefix "Füge" (Füge 2kg Mehl hinzu)', () => {
      const result = service.extractQuantity('Füge 2kg Mehl hinzu');

      expect(result.itemName).toBe('Mehl');
      expect(result.quantity).toBe('2kg');
    });

    it('should handle command suffix "hinzu" (2kg Mehl hinzu)', () => {
      const result = service.extractQuantity('2kg Mehl hinzu');

      expect(result.itemName).toBe('Mehl');
      expect(result.quantity).toBe('2kg');
    });

    it('should handle full command (Füge 2kg Mehl zu Einkaufen hinzu)', () => {
      const result = service.extractQuantity('Füge 2kg Mehl zu Einkaufen hinzu');

      expect(result.itemName).toBe('Mehl');
      expect(result.quantity).toBe('2kg');
    });
  });

  // =========================================
  // VALIDATION METHODS
  // =========================================

  describe('Validation Methods', () => {
    it('should detect multiple items (comma-separated)', () => {
      const hasMultiple = service.hasMultipleItems('Milch, Brot, Butter');

      expect(hasMultiple).toBe(true);
    });

    it('should detect multiple items (semicolon-separated)', () => {
      const hasMultiple = service.hasMultipleItems('Mehl; Eier; Milch');

      expect(hasMultiple).toBe(true);
    });

    it('should detect multiple items (conjunction)', () => {
      const hasMultiple = service.hasMultipleItems('Milch und Brot');

      expect(hasMultiple).toBe(true);
    });

    it('should not detect multiple items for single item', () => {
      const hasMultiple = service.hasMultipleItems('Milch');

      expect(hasMultiple).toBe(false);
    });

    // TODO: Fix decimal comma validation logic
    it.skip('should not detect decimal comma as item separator', () => {
      const hasMultiple = service.hasMultipleItems('0,5kg Mehl');

      expect(hasMultiple).toBe(false);
    });

    it('should validate numeric quantities as valid', () => {
      expect(service.isValidQuantity('2kg')).toBe(true);
      expect(service.isValidQuantity('500g')).toBe(true);
      expect(service.isValidQuantity('1,5 Liter')).toBe(true);
    });

    it('should validate text number quantities as valid', () => {
      expect(service.isValidQuantity('zwei kg')).toBe(true);
      expect(service.isValidQuantity('drei Liter')).toBe(true);
    });

    it('should invalidate non-quantity strings', () => {
      expect(service.isValidQuantity('abc')).toBe(false);
      expect(service.isValidQuantity('Milch')).toBe(false);
    });

    it('should extract numeric value from quantity string', () => {
      expect(service.extractNumericValue('2kg')).toBe(2);
      expect(service.extractNumericValue('1,5 Liter')).toBe(1.5);
      expect(service.extractNumericValue('500g')).toBe(500);
    });

    it('should extract numeric value from text numbers', () => {
      expect(service.extractNumericValue('zwei kg')).toBe(2);
      expect(service.extractNumericValue('drei')).toBe(3);
    });

    it('should return null for invalid numeric values', () => {
      expect(service.extractNumericValue('abc')).toBeNull();
      expect(service.extractNumericValue('')).toBeNull();
    });
  });

  // =========================================
  // UTILITY METHODS
  // =========================================

  describe('Utility Methods', () => {
    it('should clean item name from command artifacts', () => {
      const cleaned = service.cleanItemName('Füge Milch hinzu');

      expect(cleaned).toBe('Milch');
    });

    it('should normalize quantity format (comma to dot)', () => {
      const normalized = service.normalizeQuantity('1,5kg');

      expect(normalized).toBe('1.5kg');
    });

    it('should normalize text numbers in quantity', () => {
      const normalized = service.normalizeQuantity('zwei kg');

      expect(normalized).toContain('2');
    });

    it('should get parsing statistics for single item', () => {
      const stats = service.getParsingStats('2kg Mehl');

      expect(stats.hasMultipleItems).toBe(false);
      expect(stats.itemCount).toBe(1);
      expect(stats.hasQuantities).toBe(true);
    });

    it('should get parsing statistics for multiple items', () => {
      const stats = service.getParsingStats('Milch, Brot, Butter');

      expect(stats.hasMultipleItems).toBe(true);
      expect(stats.itemCount).toBe(3);
    });

    it('should get parsing statistics for text numbers', () => {
      const stats = service.getParsingStats('zwei kg Mehl');

      expect(stats.hasTextNumbers).toBe(true);
      expect(stats.hasQuantities).toBe(true);
    });

    it('should provide list of supported text numbers', () => {
      const textNumbers = service.getSupportedTextNumbers();

      expect(textNumbers).toContain('ein');
      expect(textNumbers).toContain('zwei');
      expect(textNumbers).toContain('drei');
      expect(textNumbers.length).toBeGreaterThan(0);
    });
  });
});
