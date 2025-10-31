import { TestBed } from '@angular/core/testing';
import { AIMessagingService, ErrorSeverity, ErrorContext, ValidationRules } from './ai-messaging.service';
import { LoggerService } from '../logger.service';
import { AIServiceError } from './ai-models';

describe('AIMessagingService', () => {
  let service: AIMessagingService;
  let mockLogger: jasmine.SpyObj<LoggerService>;

  beforeEach(() => {
    // Create mock logger
    mockLogger = jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info', 'debug']);

    // Instantiate service directly with mock (bypass Angular DI for Vitest)
    service = new AIMessagingService(mockLogger as any);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // =========================================
  // SUGGESTION METHODS
  // =========================================

  describe('Suggestion Methods', () => {
    describe('suggestDepartment', () => {
      it('should suggest "bread" for bread-related items', () => {
        expect(service.suggestDepartment('Brot')).toBe('bread');
        expect(service.suggestDepartment('Brötchen')).toBe('bread');
        expect(service.suggestDepartment('Toast')).toBe('bread');
      });

      it('should suggest "fruit-vegetables" for produce', () => {
        expect(service.suggestDepartment('Banane')).toBe('fruit-vegetables');
        expect(service.suggestDepartment('Tomate')).toBe('fruit-vegetables');
        expect(service.suggestDepartment('Salat')).toBe('fruit-vegetables');
      });

      it('should suggest "dairy-products" for dairy', () => {
        expect(service.suggestDepartment('Milch')).toBe('dairy-products');
        expect(service.suggestDepartment('Käse')).toBe('dairy-products');
        expect(service.suggestDepartment('Joghurt')).toBe('dairy-products');
      });

      it('should return "miscellaneous" for unknown items', () => {
        expect(service.suggestDepartment('XYZ Unknown Item')).toBe('miscellaneous');
      });

      it('should be case-insensitive', () => {
        expect(service.suggestDepartment('MILCH')).toBe('dairy-products');
        expect(service.suggestDepartment('milch')).toBe('dairy-products');
      });
    });

    describe('suggestIcon', () => {
      it('should suggest correct icons for common items', () => {
        expect(service.suggestIcon('Banane')).toBe('🍌');
        expect(service.suggestIcon('Apfel')).toBe('🍎');
        expect(service.suggestIcon('Brot')).toBe('🍞');
        expect(service.suggestIcon('Milch')).toBe('🥛');
      });

      it('should return default icon for unknown items', () => {
        expect(service.suggestIcon('Unknown Item')).toBe('📦');
      });

      it('should be case-insensitive', () => {
        expect(service.suggestIcon('BANANE')).toBe('🍌');
      });
    });

    describe('suggestListColor', () => {
      it('should suggest store colors for known stores', () => {
        expect(service.suggestListColor('Spar')).toBe('#00A651');
        expect(service.suggestListColor('Billa')).toBe('#FF6B00');
        expect(service.suggestListColor('Hofer')).toBe('#E30613');
      });

      it('should return a default color for unknown stores', () => {
        const color = service.suggestListColor('Unknown Store');
        expect(color).toMatch(/^#[0-9A-F]{6}$/i);
      });

      it('should be case-insensitive', () => {
        expect(service.suggestListColor('SPAR')).toBe('#00A651');
      });
    });
  });

  // =========================================
  // HELP MESSAGES
  // =========================================

  describe('Help Messages', () => {
    it('should generate enhanced help message with API key', () => {
      const message = service.getEnhancedHelpMessage(true);
      expect(message).toContain('ShopLisl AI Assistent');
      expect(message).toContain('Verfügbare Befehle');
      expect(message).toContain('Rezept');
    });

    it('should generate basic help message without API key', () => {
      const message = service.getEnhancedHelpMessage(false);
      expect(message).toContain('ShopLisl AI Assistent');
      expect(message).toContain('Basis-Funktionen');
    });

    it('should provide contextual help when waiting for articles', () => {
      const message = service.getContextualHelpMessage(true, 'Einkaufen');
      expect(message).toContain('Einkaufen');
      expect(message).toContain('Unterhaltung');
    });

    it('should return enhanced help when not in conversation', () => {
      const message = service.getContextualHelpMessage(false);
      expect(message).toContain('ShopLisl AI Assistent');
    });
  });

  // =========================================
  // API KEY MESSAGES
  // =========================================

  describe('API Key Messages', () => {
    it('should generate API key success message', () => {
      const message = service.getApiKeySuccessMessage();
      expect(message).toContain('erfolgreich gespeichert');
      expect(message).toContain('aktiviert');
    });

    it('should generate API key error message', () => {
      const message = service.getApiKeyErrorMessage();
      expect(message).toContain('Ungültiger API Key');
      expect(message).toContain('gsk_');
    });

    it('should provide API key guidance', () => {
      const message = service.getNoApiKeyGuidance();
      expect(message).toContain('Groq API Key');
      expect(message).toContain('console.groq.com');
    });

    it('should show instructions with API key status', () => {
      const withKey = service.getApiKeyInstructions(true);
      expect(withKey).toContain('Konfiguriert');

      const withoutKey = service.getApiKeyInstructions(false);
      expect(withoutKey).toContain('nicht gesetzt');
    });
  });

  // =========================================
  // SUCCESS MESSAGES
  // =========================================

  describe('Success Messages', () => {
    it('should generate item added message', () => {
      const message = service.getItemAddedMessage('Milch', '1L', 'Einkaufen');
      expect(message).toContain('Milch');
      expect(message).toContain('1L');
      expect(message).toContain('Einkaufen');
    });

    it('should generate item added message without quantity', () => {
      const message = service.getItemAddedMessage('Brot', undefined, 'Einkaufen');
      expect(message).toContain('Brot');
      expect(message).toContain('Einkaufen');
      expect(message).not.toContain('undefined');
    });

    it('should generate contextual item added message', () => {
      const message = service.getContextualItemAddedMessage('Milch', '1L', 'Einkaufen');
      expect(message).toContain('Milch');
      expect(message).toContain('Fertig');
    });

    it('should generate list created message', () => {
      const message = service.getListCreatedMessage('Spar', 'Milch', '1L', 'grün');
      expect(message).toContain('Spar');
      expect(message).toContain('Milch');
      expect(message).toContain('grün');
    });

    it('should generate multi-item success message', () => {
      const items = [
        { itemName: 'Milch', quantity: '1L' },
        { itemName: 'Brot' }
      ];
      const message = service.getMultiItemSuccessMessage(2, items, 'Einkaufen');
      expect(message).toContain('2 Artikel');
      expect(message).toContain('Milch');
      expect(message).toContain('Brot');
      expect(message).toContain('Einkaufen');
    });
  });

  // =========================================
  // ERROR MESSAGES
  // =========================================

  describe('Error Messages', () => {
    it('should generate generic error message', () => {
      const message = service.getGenericErrorMessage('Test error');
      expect(message).toContain('Fehler');
      expect(message).toContain('Test error');
    });

    it('should generate parsing error message', () => {
      const message = service.getParsingErrorMessage('invalid input', ['Error 1', 'Error 2']);
      expect(message).toContain('invalid input');
      expect(message).toContain('Error 1');
      expect(message).toContain('Error 2');
    });

    it('should generate no lists found message', () => {
      const message = service.getNoListsFoundMessage();
      expect(message).toContain('Keine Listen');
      expect(message).toContain('Erstelle');
    });
  });

  // =========================================
  // DISAMBIGUATION MESSAGES
  // =========================================

  describe('Disambiguation Messages', () => {
    it('should generate disambiguation message for single item', () => {
      const message = service.getDisambiguationMessage('Milch');
      expect(message).toContain('Milch');
      expect(message).toContain('ähnliche Artikel');
    });

    it('should generate multi-item disambiguation message', () => {
      const message = service.getMultiItemDisambiguationMessage('Milch', 0, 3);
      expect(message).toContain('Milch');
      expect(message).toContain('1/3');
    });

    it('should generate list selection message', () => {
      const message = service.getListSelectionMessage('Milch', '1L');
      expect(message).toContain('Milch');
      expect(message).toContain('1L');
      expect(message).toContain('welcher Liste');
    });

    it('should generate multi-item list selection message', () => {
      const message = service.getMultiItemListSelectionMessage(5);
      expect(message).toContain('5 Artikel');
    });
  });

  // =========================================
  // CONVERSATIONAL PROMPTS
  // =========================================

  describe('Conversational Prompts', () => {
    it('should generate list created follow-up prompt', () => {
      const message = service.getListCreatedFollowUpPrompt('Einkaufen');
      expect(message).toContain('Einkaufen');
    });

    it('should generate article added follow-up prompt', () => {
      const message = service.getArticleAddedFollowUpPrompt('Milch', 'Einkaufen');
      expect(message).toContain('Einkaufen');
    });

    it('should generate multiple articles added follow-up', () => {
      const message = service.getMultipleArticlesAddedFollowUpPrompt(3, 'Einkaufen');
      expect(message).toContain('3 Artikel');
      expect(message).toContain('Einkaufen');
    });

    it('should generate conversation ended message', () => {
      const message = service.getConversationEndedMessage();
      expect(message).toContain('Verstanden');
    });

    it('should generate encouragement message', () => {
      const message = service.getEncouragementMessage('Einkaufen', 3);
      expect(message).toContain('Einkaufen');
      expect(message).toContain('3 Artikel');
    });

    it('should handle singular item count', () => {
      const message = service.getEncouragementMessage('Einkaufen', 1);
      expect(message).toContain('1 Artikel');
    });
  });

  // =========================================
  // UTILITY METHODS
  // =========================================

  describe('Utility Methods', () => {
    it('should return available colors', () => {
      const colors = service.getAvailableColors();
      expect(colors).toContain('rot');
      expect(colors).toContain('grün');
      expect(colors).toContain('blau');
    });

    it('should get department display names', () => {
      expect(service.getDepartmentDisplayName('bread')).toBe('Brot & Backwaren');
      expect(service.getDepartmentDisplayName('dairy-products')).toBe('Milchprodukte');
      expect(service.getDepartmentDisplayName('unknown')).toBe('Unbekannt');
    });

    it('should format stats', () => {
      const stats = { itemCount: 10, listCount: 3, commandCount: 25 };
      const message = service.formatStats(stats);
      expect(message).toContain('10');
      expect(message).toContain('3');
      expect(message).toContain('25');
    });

    it('should format timestamp', () => {
      const date = new Date('2025-10-31T14:30:00');
      const formatted = service.formatTimestamp(date);
      expect(formatted).toMatch(/\d{2}:\d{2}/);
    });

    it('should get confidence text', () => {
      expect(service.getConfidenceText(0.95)).toContain('Exakte');
      expect(service.getConfidenceText(0.75)).toContain('Sehr ähnlich');
      expect(service.getConfidenceText(0.55)).toContain('Ähnlich');
      expect(service.getConfidenceText(0.30)).toContain('Entfernt');
    });

    it('should get feature availability message', () => {
      const withKey = service.getFeatureAvailabilityMessage(true);
      expect(withKey).toContain('Premium-Features');

      const withoutKey = service.getFeatureAvailabilityMessage(false);
      expect(withoutKey).toContain('Basis-Features');
    });
  });

  // =========================================
  // ERROR HANDLING
  // =========================================

  describe('Error Handling', () => {
    it('should create AI service error', () => {
      const context: ErrorContext = {
        operation: 'test_operation',
        input: { test: 'data' },
        timestamp: new Date()
      };

      const originalError = new Error('Test error');
      const aiError = service.createAIServiceError(originalError, context);

      expect(aiError).toBeInstanceOf(AIServiceError);
      expect(aiError.message).toContain('test_operation');
    });

    it('should log errors with correct severity', () => {
      const context: ErrorContext = {
        operation: 'test',
        timestamp: new Date()
      };

      const error = new Error('Test error');
      service.logError(error, context, ErrorSeverity.MEDIUM);

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should log critical errors', () => {
      const context: ErrorContext = {
        operation: 'test',
        timestamp: new Date()
      };

      const error = new Error('Critical error');
      service.logError(error, context, ErrorSeverity.CRITICAL);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle disambiguation errors', () => {
      const result = service.handleDisambiguationError(new Error('Test'), 'Milch');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Milch');
    });

    it('should handle multi-item errors', () => {
      const items = [{ name: 'item1' }, { name: 'item2' }];
      const result = service.handleMultiItemError(new Error('Test'), items, 1);
      expect(result.success).toBe(false);
      expect(result.message).toContain('1 von 2');
    });

    it('should handle list operation errors', () => {
      const result = service.handleListOperationError(new Error('Test'), 'create', 'list-1');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Listen-Operation');
    });

    it('should handle API errors', () => {
      const result = service.handleAPIError(new Error('Network error'), '/api/test');
      expect(result.success).toBe(false);
    });
  });

  // =========================================
  // VALIDATION
  // =========================================

  describe('Validation', () => {
    it('should validate required fields', () => {
      const context: ErrorContext = {
        operation: 'test',
        timestamp: new Date()
      };

      const rule = ValidationRules.required('testField');

      expect(() => {
        service.validateInput('', [rule], context);
      }).toThrow();

      expect(() => {
        service.validateInput('value', [rule], context);
      }).not.toThrow();
    });

    it('should validate string length', () => {
      const context: ErrorContext = {
        operation: 'test',
        timestamp: new Date()
      };

      const minRule = ValidationRules.minLength('testField', 5);
      const maxRule = ValidationRules.maxLength('testField', 10);

      expect(() => {
        service.validateInput('abc', [minRule], context);
      }).toThrow();

      expect(() => {
        service.validateInput('abcdefghijk', [maxRule], context);
      }).toThrow();

      expect(() => {
        service.validateInput('abcdef', [minRule, maxRule], context);
      }).not.toThrow();
    });

    it('should validate arrays', () => {
      const context: ErrorContext = {
        operation: 'test',
        timestamp: new Date()
      };

      const isArrayRule = ValidationRules.isArray('testField');
      const notEmptyRule = ValidationRules.notEmpty('testField');

      expect(() => {
        service.validateInput('not an array', [isArrayRule], context);
      }).toThrow();

      expect(() => {
        service.validateInput([], [notEmptyRule], context);
      }).toThrow();

      expect(() => {
        service.validateInput(['item'], [isArrayRule, notEmptyRule], context);
      }).not.toThrow();
    });

    it('should validate IDs', () => {
      const context: ErrorContext = {
        operation: 'test',
        timestamp: new Date()
      };

      const idRule = ValidationRules.isValidId('testField');

      expect(() => {
        service.validateInput('invalid id with spaces', [idRule], context);
      }).toThrow();

      expect(() => {
        service.validateInput('valid-id-123', [idRule], context);
      }).not.toThrow();
    });
  });

  // =========================================
  // ASYNC ERROR HANDLING
  // =========================================

  describe('Async Error Handling', () => {
    it('should execute safely with fallback', async () => {
      const context: ErrorContext = {
        operation: 'test',
        timestamp: new Date()
      };

      const result = await service.safeExecute(
        () => Promise.reject(new Error('Test error')),
        context,
        'fallback value'
      );

      expect(result).toBe('fallback value');
    });

    it('should throw error when no fallback provided', async () => {
      const context: ErrorContext = {
        operation: 'test',
        timestamp: new Date()
      };

      await expect(
        service.safeExecute(
          () => Promise.reject(new Error('Test error')),
          context
        )
      ).rejects.toThrow();
    });

    it('should handle timeout', async () => {
      const context: ErrorContext = {
        operation: 'test',
        timestamp: new Date()
      };

      const slowOperation = () => new Promise(resolve => setTimeout(resolve, 1000));

      await expect(
        service.withTimeout(slowOperation, 100, context)
      ).rejects.toThrow();
    });
  });
});
