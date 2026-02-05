// src/app/shared/components/voice-ai-assistant/services/voice-ai-context.service.ts
import { Injectable } from '@angular/core';
import { ConversationContext } from '../../../../core/models';
import { AIService } from '../../../../core/services/ai';
import { ChatPersistenceService } from '../../../../core/services/chat-persistence.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { environment } from '../../../../../environments/environment';

/**
 * VoiceAIContextService - Manages conversation context synchronization
 *
 * Extracted from VoiceAIAssistantComponent (Phase 2 refactoring) to:
 * - Centralize bidirectional context sync between AIService and ChatPersistence
 * - Cache context state for performance
 * - Reduce component complexity
 *
 * Key responsibilities:
 * - Bidirectional context synchronization
 * - Context caching with TTL
 * - Active conversation detection
 * - Context invalidation
 */
@Injectable({
  providedIn: 'root'
})
export class VoiceAIContextService {

  // Context caching
  private _cachedActiveConversation = false;
  private _lastContextCheck = 0;
  private _lastLoggedState: boolean | null = null;
  private _cachedContext: ConversationContext = {};
  private _lastContextSync = 0;

  // Cache durations
  private readonly CONTEXT_CACHE_DURATION = 500; // 500ms cache for conversation check
  private readonly CONTEXT_SYNC_CACHE_DURATION = 1000; // 1 second cache for context sync

  // Debug flag
  private verboseLogging = false;

  constructor(
    private aiService: AIService,
    private chatPersistence: ChatPersistenceService,
    private logger: LoggerService
  ) {}

  /**
   * Bidirectional context synchronization between services
   * Determines which context is more recent/complete and syncs to the other
   */
  syncContextBidirectional(): void {
    const chatContext = this.chatPersistence.getConversationContext();
    const aiContext = this.aiService.getConversationContext();

    // Determine which context is more recent/complete
    let sourceContext: ConversationContext | null = null;
    let targetService: 'chat' | 'ai' | null = null;

    if (chatContext?.waitingForArticles && !aiContext.waitingForArticles) {
      sourceContext = chatContext;
      targetService = 'ai';
    } else if (aiContext.waitingForArticles && !chatContext?.waitingForArticles) {
      sourceContext = aiContext;
      targetService = 'chat';
    } else if (chatContext?.lastAction && aiContext.lastAction) {
      const chatTime = chatContext.lastAction.timestamp.getTime();
      const aiTime = aiContext.lastAction.timestamp.getTime();

      if (chatTime > aiTime) {
        sourceContext = chatContext;
        targetService = 'ai';
      } else {
        sourceContext = aiContext;
        targetService = 'chat';
      }
    } else if (chatContext?.lastAction && !aiContext.lastAction) {
      sourceContext = chatContext;
      targetService = 'ai';
    } else if (aiContext.lastAction && !chatContext?.lastAction) {
      sourceContext = aiContext;
      targetService = 'chat';
    }

    // Perform synchronization (only log significant changes)
    if (sourceContext && targetService) {
      // Only log in development and when there's a meaningful change
      if (!environment.production && sourceContext.waitingForArticles) {
        this.logger.debug('voice', `🔄 SYNC: Context synced (${targetService === 'ai' ? 'chat -> AI' : 'AI -> chat'})`);
      }

      if (targetService === 'ai') {
        this.aiService.setConversationContext(sourceContext);
      } else {
        this.chatPersistence.setConversationContext(sourceContext);
      }

      this.invalidateCache();
    }
  }

  /**
   * Get current active context with proper fallbacks
   * Uses caching for performance
   */
  getCurrentActiveContext(): ConversationContext {
    const now = Date.now();

    // Only sync contexts if cache is expired
    if (now - this._lastContextSync > this.CONTEXT_SYNC_CACHE_DURATION) {
      this.syncContextBidirectional();

      const chatContext = this.chatPersistence.getConversationContext();
      const aiContext = this.aiService.getConversationContext();

      // Cache the most complete context
      if (chatContext?.waitingForArticles) {
        this._cachedContext = chatContext;
      } else if (aiContext.waitingForArticles) {
        this._cachedContext = aiContext;
      } else if (chatContext?.lastAction) {
        this._cachedContext = chatContext;
      } else if (aiContext.lastAction) {
        this._cachedContext = aiContext;
      } else {
        this._cachedContext = {};
      }

      this._lastContextSync = now;
    }

    return this._cachedContext;
  }

  /**
   * Check if there's an active conversation
   * Uses caching to prevent excessive recalculation
   */
  isInActiveConversation(): boolean {
    const now = Date.now();

    // Only recalculate if cache is expired
    if (now - this._lastContextCheck > this.CONTEXT_CACHE_DURATION) {
      const activeContext = this.getCurrentActiveContext();
      const newState = !!(activeContext.waitingForArticles?.listId && activeContext.waitingForArticles?.listName);

      // Only log if state actually changed
      if (this._lastLoggedState !== newState && !environment.production && this.verboseLogging) {
        this.logger.debug('voice', '🔄 CONTEXT: Active conversation state changed', {
          hasActiveContext: newState,
          waitingForArticles: activeContext.waitingForArticles,
          previousState: this._lastLoggedState
        });
        this._lastLoggedState = newState;
      }

      this._cachedActiveConversation = newState;
      this._lastContextCheck = now;
    }

    return this._cachedActiveConversation;
  }

  /**
   * Get the current target list from context
   */
  getCurrentTargetList(): { listId: string; listName: string } | null {
    const activeContext = this.getCurrentActiveContext();

    if (activeContext.waitingForArticles) {
      return {
        listId: activeContext.waitingForArticles.listId,
        listName: activeContext.waitingForArticles.listName
      };
    }

    return null;
  }

  /**
   * Get conversation status message for UI
   */
  getConversationStatus(): string {
    const activeContext = this.getCurrentActiveContext();

    // Check for active conversation context
    if (activeContext.waitingForArticles) {
      return `Sie können direkt weitere Artikel zu "${activeContext.waitingForArticles.listName}" hinzufügen`;
    }

    // Check for recent last action
    if (activeContext.lastAction) {
      const timeSince = Date.now() - activeContext.lastAction.timestamp.getTime();
      if (timeSince < 10 * 60 * 1000) { // 10 minutes
        const minutes = Math.floor(timeSince / 60000);
        return `Fortsetzung für "${activeContext.lastAction.listName}" möglich (vor ${minutes}min)`;
      }
    }

    return 'Keine aktive Unterhaltung';
  }

  /**
   * Check if continuation is possible (recent action within 10 minutes)
   */
  canUseContinuation(): boolean {
    const activeContext = this.getCurrentActiveContext();

    if (activeContext.lastAction) {
      const timeSince = Date.now() - activeContext.lastAction.timestamp.getTime();
      return timeSince < 10 * 60 * 1000; // 10 minutes
    }

    return false;
  }

  /**
   * Set context in both services
   */
  setContext(context: ConversationContext): void {
    this.chatPersistence.setConversationContext(context);
    this.aiService.setConversationContext(context);
    this.invalidateCache();
  }

  /**
   * Clear contexts in both services
   */
  clearAllContexts(): void {
    this.logger.debug('voice', '🗑️ Clearing all contexts');
    this.chatPersistence.clearConversationContext();
    this.aiService.clearConversationContext();
    this.invalidateCache();
  }

  /**
   * Invalidate all caches
   */
  invalidateCache(): void {
    this._lastContextCheck = 0;
    this._lastContextSync = 0;
  }

  /**
   * Toggle verbose logging for debugging
   */
  toggleVerboseLogging(): void {
    this.verboseLogging = !this.verboseLogging;
    this.logger.info('voice', `🔧 Verbose context logging ${this.verboseLogging ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check for continuation keywords in input
   */
  checkForContinuationKeywords(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    const continuationKeywords = ['und', 'weiters', 'außerdem', 'zusätzlich', 'noch', 'dann', 'danach'];

    return continuationKeywords.some(keyword =>
      lowerInput.startsWith(keyword + ' ') ||
      lowerInput === keyword
    );
  }

  /**
   * Extract item text from continuation input
   */
  extractContinuationItem(input: string): string {
    const lowerInput = input.toLowerCase().trim();
    const continuationKeywords = ['und', 'weiters', 'außerdem', 'zusätzlich', 'noch'];

    for (const keyword of continuationKeywords) {
      if (lowerInput.startsWith(keyword + ' ')) {
        return input.substring(keyword.length + 1).trim();
      }
    }

    return input;
  }

  /**
   * Create a preserved context for recipe processing
   */
  createRecipeContext(targetListId: string, targetListName: string): ConversationContext {
    return {
      lastAction: {
        type: 'article_added' as const,
        listId: targetListId,
        listName: targetListName,
        articleName: 'Rezept',
        timestamp: new Date()
      },
      waitingForArticles: {
        listId: targetListId,
        listName: targetListName,
        prompt: 'Rezept-Verarbeitung'
      }
    };
  }

  /**
   * Create context for list creation
   */
  createListCreatedContext(listId: string, listName: string): ConversationContext {
    return {
      lastAction: {
        type: 'list_created' as const,
        listId: listId,
        listName: listName,
        articleName: '',
        timestamp: new Date()
      },
      waitingForArticles: {
        listId: listId,
        listName: listName,
        prompt: 'Möchtest du Artikel hinzufügen?'
      }
    };
  }

  /**
   * Create context for article addition
   */
  createArticleAddedContext(listId: string, listName: string, articleName: string): ConversationContext {
    return {
      lastAction: {
        type: 'article_added' as const,
        listId: listId,
        listName: listName,
        articleName: articleName,
        timestamp: new Date()
      },
      waitingForArticles: {
        listId: listId,
        listName: listName,
        prompt: 'Möchtest du noch weitere Artikel hinzufügen?'
      }
    };
  }
}
