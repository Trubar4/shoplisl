import { vi } from 'vitest';
import { ContextManagementService } from './context-management.service';
import { ConversationContext } from '../../models';

describe('ContextManagementService', () => {
  let service: ContextManagementService;

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
    service = new ContextManagementService(loggerMock);
  });

  afterEach(() => {
    // Clean up after each test
    service.clearConversationContext();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // =========================================
  // CONTEXT MANAGEMENT - BASIC OPERATIONS
  // =========================================

  describe('Context Management - Basic Operations', () => {
    it('should set and get conversation context', () => {
      const context: ConversationContext = {
        lastAction: {
          type: 'article_added',
          listId: 'list-1',
          listName: 'Einkaufen',
          articleName: 'Milch',
          timestamp: new Date()
        }
      };

      service.setConversationContext(context);
      const retrieved = service.getConversationContext();

      expect(retrieved.lastAction).toBeDefined();
      expect(retrieved.lastAction?.type).toBe('article_added');
      expect(retrieved.lastAction?.listName).toBe('Einkaufen');
      expect(retrieved.lastAction?.articleName).toBe('Milch');
    });

    it('should clear conversation context', () => {
      const context: ConversationContext = {
        lastAction: {
          type: 'article_added',
          listId: 'list-1',
          listName: 'Einkaufen',
          articleName: 'Milch',
          timestamp: new Date()
        }
      };

      service.setConversationContext(context);
      service.clearConversationContext();

      const retrieved = service.getConversationContext();
      expect(retrieved.lastAction).toBeUndefined();
      expect(retrieved.waitingForArticles).toBeUndefined();
    });

    it('should return empty context initially', () => {
      const context = service.getConversationContext();

      expect(context).toBeDefined();
      expect(context.lastAction).toBeUndefined();
      expect(context.waitingForArticles).toBeUndefined();
    });

    // TODO: Fix mock Observable behavior for immutability test
    it.skip('should preserve context immutably', () => {
      const context: ConversationContext = {
        lastAction: {
          type: 'article_added',
          listId: 'list-1',
          listName: 'Einkaufen',
          articleName: 'Milch',
          timestamp: new Date()
        }
      };

      service.setConversationContext(context);

      // Modify the original context
      context.lastAction!.articleName = 'Brot';

      // Retrieved context should not be affected
      const retrieved = service.getConversationContext();
      expect(retrieved.lastAction?.articleName).toBe('Milch');
    });
  });

  // =========================================
  // CONTEXT QUERIES
  // =========================================

  describe('Context Queries', () => {
    it('should detect when waiting for articles', () => {
      const context: ConversationContext = {
        waitingForArticles: {
          listId: 'list-1',
          listName: 'Einkaufen',
          prompt: 'Möchtest du noch weitere Artikel hinzufügen?'
        }
      };

      service.setConversationContext(context);

      expect(service.isWaitingForArticles()).toBe(true);
    });

    it('should detect when NOT waiting for articles', () => {
      service.clearConversationContext();

      expect(service.isWaitingForArticles()).toBe(false);
    });

    it('should get waiting for articles context', () => {
      const context: ConversationContext = {
        waitingForArticles: {
          listId: 'list-1',
          listName: 'Einkaufen',
          prompt: 'Test prompt'
        }
      };

      service.setConversationContext(context);
      const waitingContext = service.getWaitingForArticlesContext();

      expect(waitingContext).toBeDefined();
      expect(waitingContext?.listId).toBe('list-1');
      expect(waitingContext?.listName).toBe('Einkaufen');
      expect(waitingContext?.prompt).toBe('Test prompt');
    });

    it('should return undefined when not waiting for articles', () => {
      service.clearConversationContext();

      const waitingContext = service.getWaitingForArticlesContext();
      expect(waitingContext).toBeUndefined();
    });

    it('should get last action', () => {
      const timestamp = new Date();
      const context: ConversationContext = {
        lastAction: {
          type: 'article_added',
          listId: 'list-1',
          listName: 'Einkaufen',
          articleName: 'Milch',
          timestamp: timestamp
        }
      };

      service.setConversationContext(context);
      const lastAction = service.getLastAction();

      expect(lastAction).toBeDefined();
      expect(lastAction?.type).toBe('article_added');
      expect(lastAction?.listId).toBe('list-1');
      expect(lastAction?.listName).toBe('Einkaufen');
      expect(lastAction?.articleName).toBe('Milch');
      expect(lastAction?.timestamp).toBe(timestamp);
    });

    it('should return undefined when no last action exists', () => {
      service.clearConversationContext();

      const lastAction = service.getLastAction();
      expect(lastAction).toBeUndefined();
    });
  });

  // =========================================
  // CONTEXT UPDATES
  // =========================================

  describe('Context Updates', () => {
    it('should update context for article added', () => {
      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Milch');

      const context = service.getConversationContext();

      expect(context.lastAction).toBeDefined();
      expect(context.lastAction?.type).toBe('article_added');
      expect(context.lastAction?.listId).toBe('list-1');
      expect(context.lastAction?.listName).toBe('Einkaufen');
      expect(context.lastAction?.articleName).toBe('Milch');
      expect(context.lastAction?.timestamp).toBeInstanceOf(Date);

      expect(context.waitingForArticles).toBeDefined();
      expect(context.waitingForArticles?.listId).toBe('list-1');
      expect(context.waitingForArticles?.listName).toBe('Einkaufen');
      expect(context.waitingForArticles?.prompt).toContain('weitere Artikel');
    });

    it('should update context for list created', () => {
      service.updateContextForListCreated('list-2', 'Wocheneinkauf');

      const context = service.getConversationContext();

      expect(context.lastAction).toBeDefined();
      expect(context.lastAction?.type).toBe('list_created');
      expect(context.lastAction?.listId).toBe('list-2');
      expect(context.lastAction?.listName).toBe('Wocheneinkauf');
      expect(context.lastAction?.articleName).toBeUndefined();

      expect(context.waitingForArticles).toBeDefined();
      expect(context.waitingForArticles?.listId).toBe('list-2');
      expect(context.waitingForArticles?.listName).toBe('Wocheneinkauf');
      expect(context.waitingForArticles?.prompt).toContain('Artikel hinzufügen');
    });

    it('should preserve context across multiple updates', () => {
      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Milch');

      const firstContext = service.getConversationContext();
      const firstTimestamp = firstContext.lastAction?.timestamp;

      // Add another article
      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Brot');

      const secondContext = service.getConversationContext();

      expect(secondContext.lastAction?.articleName).toBe('Brot');
      expect(secondContext.lastAction?.listName).toBe('Einkaufen');
      expect(secondContext.lastAction?.timestamp).not.toBe(firstTimestamp);
    });
  });

  // =========================================
  // CONTEXT VALIDATION
  // =========================================

  describe('Context Validation', () => {
    it('should validate fresh context as valid', () => {
      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Milch');

      const isValid = service.isContextValid();
      expect(isValid).toBe(true);
    });

    it('should validate old context as invalid (beyond max age)', () => {
      const oldTimestamp = new Date(Date.now() - 11 * 60 * 1000); // 11 minutes ago

      const context: ConversationContext = {
        lastAction: {
          type: 'article_added',
          listId: 'list-1',
          listName: 'Einkaufen',
          articleName: 'Milch',
          timestamp: oldTimestamp
        }
      };

      service.setConversationContext(context);

      const isValid = service.isContextValid(); // Default: 10 minutes
      expect(isValid).toBe(false);
    });

    it('should validate context with custom max age', () => {
      const timestamp = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago

      const context: ConversationContext = {
        lastAction: {
          type: 'article_added',
          listId: 'list-1',
          listName: 'Einkaufen',
          articleName: 'Milch',
          timestamp: timestamp
        }
      };

      service.setConversationContext(context);

      const isValid5min = service.isContextValid(5 * 60 * 1000); // 5 minutes
      expect(isValid5min).toBe(true);

      const isValid2min = service.isContextValid(2 * 60 * 1000); // 2 minutes
      expect(isValid2min).toBe(false);
    });

    it('should return false when no context exists', () => {
      service.clearConversationContext();

      const isValid = service.isContextValid();
      expect(isValid).toBe(false);
    });

    it('should detect when has target list', () => {
      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Milch');

      expect(service.hasTargetList()).toBe(true);
    });

    it('should detect when does NOT have target list', () => {
      service.clearConversationContext();

      expect(service.hasTargetList()).toBe(false);
    });

    it('should get target list information', () => {
      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Milch');

      const targetList = service.getTargetList();

      expect(targetList).toBeDefined();
      expect(targetList?.listId).toBe('list-1');
      expect(targetList?.listName).toBe('Einkaufen');
    });

    it('should return null when no target list exists', () => {
      service.clearConversationContext();

      const targetList = service.getTargetList();
      expect(targetList).toBeNull();
    });
  });

  // =========================================
  // CONVERSATION STATE MANAGEMENT
  // =========================================

  describe('Conversation State Management', () => {
    it('should preserve context for later restoration', () => {
      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Milch');

      const preserved = service.preserveContext();

      expect(preserved.lastAction).toBeDefined();
      expect(preserved.lastAction?.articleName).toBe('Milch');
    });

    it('should restore preserved context', () => {
      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Milch');
      const preserved = service.preserveContext();

      service.clearConversationContext();
      expect(service.getConversationContext().lastAction).toBeUndefined();

      service.restoreContext(preserved);
      const restored = service.getConversationContext();

      expect(restored.lastAction).toBeDefined();
      expect(restored.lastAction?.articleName).toBe('Milch');
    });

    it('should merge partial context into existing context', () => {
      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Milch');

      const partialContext: Partial<ConversationContext> = {
        waitingForArticles: {
          listId: 'list-2',
          listName: 'Neuer Einkauf',
          prompt: 'New prompt'
        }
      };

      service.mergeContext(partialContext);

      const merged = service.getConversationContext();

      // Last action should still be there
      expect(merged.lastAction).toBeDefined();
      expect(merged.lastAction?.articleName).toBe('Milch');

      // Waiting context should be updated
      expect(merged.waitingForArticles?.listName).toBe('Neuer Einkauf');
    });

    it('should handle merging empty partial context', () => {
      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Milch');

      service.mergeContext({});

      const context = service.getConversationContext();

      // Context should remain unchanged
      expect(context.lastAction?.articleName).toBe('Milch');
    });
  });

  // =========================================
  // CONTEXT PRESERVATION ACROSS MULTIPLE COMMANDS
  // =========================================

  describe('Context Preservation Across Multiple Commands', () => {
    it('should maintain context when adding multiple articles to same list', () => {
      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Milch');

      expect(service.getTargetList()?.listName).toBe('Einkaufen');

      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Brot');

      expect(service.getTargetList()?.listName).toBe('Einkaufen');
      expect(service.getLastAction()?.articleName).toBe('Brot');
    });

    it('should update context when switching to different list', () => {
      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Milch');
      expect(service.getTargetList()?.listName).toBe('Einkaufen');

      service.updateContextForArticleAdded('list-2', 'Wocheneinkauf', 'Brot');
      expect(service.getTargetList()?.listName).toBe('Wocheneinkauf');
      expect(service.getTargetList()?.listId).toBe('list-2');
    });

    it('should maintain timestamp accuracy across updates', () => {
      const before = Date.now();

      service.updateContextForArticleAdded('list-1', 'Einkaufen', 'Milch');

      const after = Date.now();

      const timestamp = service.getLastAction()?.timestamp.getTime();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  // =========================================
  // EDGE CASES
  // =========================================

  describe('Edge Cases', () => {
    it('should handle empty list name', () => {
      service.updateContextForArticleAdded('list-1', '', 'Milch');

      const context = service.getConversationContext();
      expect(context.lastAction?.listName).toBe('');
    });

    it('should handle empty article name', () => {
      service.updateContextForArticleAdded('list-1', 'Einkaufen', '');

      const context = service.getConversationContext();
      expect(context.lastAction?.articleName).toBe('');
    });

    it('should handle very long list names', () => {
      const longName = 'A'.repeat(1000);
      service.updateContextForArticleAdded('list-1', longName, 'Milch');

      const context = service.getConversationContext();
      expect(context.lastAction?.listName).toBe(longName);
    });

    it('should handle special characters in names', () => {
      service.updateContextForArticleAdded('list-1', 'Einkauf & Haushalt', 'Öl, Essig & Salz');

      const context = service.getConversationContext();
      expect(context.lastAction?.listName).toBe('Einkauf & Haushalt');
      expect(context.lastAction?.articleName).toBe('Öl, Essig & Salz');
    });

    it('should handle context operations in rapid succession', () => {
      for (let i = 0; i < 100; i++) {
        service.updateContextForArticleAdded(`list-${i}`, `List ${i}`, `Article ${i}`);
      }

      const context = service.getConversationContext();
      expect(context.lastAction?.articleName).toBe('Article 99');
    });
  });
});
