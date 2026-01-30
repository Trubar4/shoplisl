// src/app/core/services/chat-persistence.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ConversationContext } from '../models';
import { LoggerService } from './logger.service';

interface ChatMessage {
  text: string;
  type: 'user' | 'assistant' | 'error' | 'system';
  timestamp: Date;
  actionData?: any;
}

interface DisambiguationState {
  message: string;
  options: DisambiguationOption[];
  pendingAction: PendingAction;
}

interface DisambiguationOption {
  id: string;
  displayName: string;
  type: 'new' | 'existing';
  article?: any;
  confidence: number;
  department?: string;
  icon?: string;
}

interface PendingAction {
  type: 'add_item' | 'create_list';
  originalInput: string;
  itemName: string;
  extractedQuantity?: string;
  listName?: string;
  suggestedDepartment?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatPersistenceService {
  private readonly STORAGE_KEY = 'shoplisl-ai-chat';
  private readonly DISAMBIGUATION_KEY = 'shoplisl-ai-disambiguation';
  private readonly MAX_MESSAGES = 100; // Limit stored messages to prevent memory issues

  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  private disambiguationSubject = new BehaviorSubject<DisambiguationState | null>(null);

  public messages$ = this.messagesSubject.asObservable();
  public disambiguation$ = this.disambiguationSubject.asObservable();

  constructor(private logger: LoggerService) {
    this.loadFromStorage();
  }

  /**
   * Add a new message to the chat
   */
  addMessage(text: string, type: 'user' | 'assistant' | 'error' | 'system'): void {
    const message: ChatMessage = {
      text,
      type,
      timestamp: new Date()
    };

    const currentMessages = this.messagesSubject.value;
    const updatedMessages = [...currentMessages, message];

    // Keep only the latest MAX_MESSAGES
    if (updatedMessages.length > this.MAX_MESSAGES) {
      updatedMessages.splice(0, updatedMessages.length - this.MAX_MESSAGES);
    }

    this.messagesSubject.next(updatedMessages);
    this.saveToStorage();
  }

  /**
   * Set disambiguation state
   */
  setDisambiguation(state: DisambiguationState | null): void {
    this.disambiguationSubject.next(state);
    this.saveDisambiguationToStorage();
  }

  /**
   * Get current messages
   */
  getMessages(): ChatMessage[] {
    return this.messagesSubject.value;
  }

  /**
   * Get current disambiguation state
   */
  getDisambiguation(): DisambiguationState | null {
    return this.disambiguationSubject.value;
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messagesSubject.next([]);
    this.setDisambiguation(null);
    this.saveToStorage();
  }

  /**
   * Add welcome message if chat is empty
   */
  initializeIfEmpty(): void {
    const currentMessages = this.messagesSubject.getValue();
    if (currentMessages.length === 0) {
      this.addMessage(
        '👋 <strong>Willkommen beim ShopLisl AI Assistent!</strong><br><br>' +
        'Sage "Hilfe" für verfügbare Befehle.',
        'assistant'
      );
    }
  }
  

  /**
   * Save messages to localStorage
   */
  private saveToStorage(): void {
    try {
      const messages = this.messagesSubject.value;
      const serializedMessages = messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp.toISOString()
      }));
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(serializedMessages));
    } catch (error) {
      this.logger.warn('chat', 'Failed to save chat to localStorage:', error);
    }
  }

  /**
   * Save disambiguation state to localStorage
   */
  private saveDisambiguationToStorage(): void {
    try {
      const state = this.disambiguationSubject.value;
      if (state) {
        localStorage.setItem(this.DISAMBIGUATION_KEY, JSON.stringify(state));
      } else {
        localStorage.removeItem(this.DISAMBIGUATION_KEY);
      }
    } catch (error) {
      this.logger.warn('chat', 'Failed to save disambiguation to localStorage:', error);
    }
  }

  /**
   * Load messages from localStorage
   */
  private loadFromStorage(): void {
    try {
      // Load messages
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const messages: ChatMessage[] = parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));

        // Filter out very old messages (older than 7 days)
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        const recentMessages = messages.filter(msg => msg.timestamp > oneWeekAgo);
        
        this.messagesSubject.next(recentMessages);
      }

      // Load disambiguation state
      const disambiguationStored = localStorage.getItem(this.DISAMBIGUATION_KEY);
      if (disambiguationStored) {
        const disambiguationState = JSON.parse(disambiguationStored);
        this.disambiguationSubject.next(disambiguationState);
      }
    } catch (error) {
      this.logger.warn('chat', 'Failed to load chat from localStorage:', error);
      // Clear corrupted data
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.DISAMBIGUATION_KEY);
    }
  }

  /**
   * Get chat summary for debugging
   */
  getChatSummary(): { messageCount: number; oldestMessage?: Date; newestMessage?: Date } {
    const messages = this.getMessages();
    
    if (messages.length === 0) {
      return { messageCount: 0 };
    }

    const timestamps = messages.map(m => m.timestamp);
    
    return {
      messageCount: messages.length,
      oldestMessage: new Date(Math.min(...timestamps.map(t => t.getTime()))),
      newestMessage: new Date(Math.max(...timestamps.map(t => t.getTime())))
    };
  }

  /**
   * Export chat history as text (for user backup)
   */
  exportChatHistory(): string {
    const messages = this.getMessages();
    
    return messages.map(msg => {
      const time = msg.timestamp.toLocaleString('de-DE');
      const sender = msg.type === 'user' ? 'Du' : 'AI';
      return `[${time}] ${sender}: ${msg.text}`;
    }).join('\n\n');
  }

  /**
   * Import chat history from text
   */
  importChatHistory(text: string): boolean {
    try {
      // Simple import - just add as system message
      const timestamp = new Date();
      this.addMessage(`Importierte Nachrichten:\n\n${text}`, 'system');
      return true;
    } catch (error) {
      this.logger.error('chat', 'Failed to import chat history:', error);
      return false;
    }
  }

  // ========================================
// CONVERSATION CONTEXT PERSISTENCE
// ========================================

private conversationContextSubject = new BehaviorSubject<ConversationContext | null>(null);
public conversationContext$ = this.conversationContextSubject.asObservable();

/**
 * Set conversation context
 */
setConversationContext(context: ConversationContext | null): void {
  this.logger.debug('chat', '💾 Setting conversation context:', context);
  
  // Validate context before setting
  if (context) {
    // Ensure timestamp is valid
    if (context.lastAction?.timestamp && !(context.lastAction.timestamp instanceof Date)) {
      context.lastAction.timestamp = new Date(context.lastAction.timestamp);
    }
    
    // Validate required fields for waitingForArticles
    if (context.waitingForArticles && (!context.waitingForArticles.listId || !context.waitingForArticles.listName)) {
      this.logger.warn('chat', '💾 Invalid waitingForArticles context, clearing it');
      context.waitingForArticles = undefined;
    }
  }
  
  this.conversationContextSubject.next(context);
  
  // Persist to localStorage with enhanced error handling
  try {
    if (context) {
      const persistableContext = {
        ...context,
        lastAction: context.lastAction ? {
          ...context.lastAction,
          timestamp: context.lastAction.timestamp.toISOString()
        } : undefined
      };
      
      localStorage.setItem('shoplisl-conversation-context', JSON.stringify(persistableContext));
      this.logger.debug('chat', '💾 Conversation context persisted to localStorage');
    } else {
      localStorage.removeItem('shoplisl-conversation-context');
      this.logger.debug('chat', '💾 Conversation context cleared from localStorage');
    }
  } catch (error) {
    this.logger.error('chat', '💾 Error persisting conversation context:', error);
  }
}

/**
 * Get current conversation context
 */
getConversationContext(): ConversationContext | null {
  return this.conversationContextSubject.value;
}

/**
 * Load conversation context from localStorage
 */
private loadConversationContext(): void {
  try {
    const stored = localStorage.getItem('shoplisl-conversation-context');
    if (!stored) {
      this.logger.debug('chat', '💾 No stored conversation context found');
      return;
    }
    
    const parsed = JSON.parse(stored);
    this.logger.debug('chat', '💾 Raw loaded context:', parsed);
    
    // Convert timestamp back to Date
    if (parsed.lastAction?.timestamp) {
      parsed.lastAction.timestamp = new Date(parsed.lastAction.timestamp);
    }
    
    // ENHANCED: More generous expiration time for conversation context
    const maxAge = 60 * 60 * 1000; // 60 minutes (was 30)
    const isExpired = parsed.lastAction?.timestamp && 
      Date.now() - parsed.lastAction.timestamp.getTime() > maxAge;
    
    if (isExpired) {
      this.logger.debug('chat', '💾 Conversation context expired, clearing');
      localStorage.removeItem('shoplisl-conversation-context');
      return;
    }
    
    // Validate and clean
    if (parsed.waitingForArticles) {
      if (!parsed.waitingForArticles.listId || !parsed.waitingForArticles.listName) {
        this.logger.debug('chat', '💾 Invalid waitingForArticles, removing');
        delete parsed.waitingForArticles;
      } else {
        this.logger.debug('chat', '💾 Valid conversation context found:', parsed.waitingForArticles);
      }
    }
    
    // Set if meaningful
    if (parsed.lastAction || parsed.waitingForArticles) {
      this.conversationContextSubject.next(parsed);
      this.logger.debug('chat', '💾 Restored conversation context');
    } else {
      localStorage.removeItem('shoplisl-conversation-context');
    }
    
  } catch (error) {
    this.logger.error('chat', '💾 Error loading conversation context:', error);
    localStorage.removeItem('shoplisl-conversation-context');
  }
}

/**
 * Clear conversation context
 */
clearConversationContext(): void {
  this.logger.debug('chat', '💾 Clearing conversation context');
  
  // Clear the subject
  this.conversationContextSubject.next(null);
  
  // Clear localStorage
  try {
    localStorage.removeItem('shoplisl-conversation-context');
    this.logger.debug('chat', '💾 Cleared conversation context from localStorage');
  } catch (error) {
    this.logger.error('chat', '💾 Error clearing conversation context from localStorage:', error);
  }
}

/**
 * Check if currently waiting for articles
 */
isWaitingForArticles(): boolean {
  const context = this.getConversationContext();
  const isWaiting = !!(context?.waitingForArticles?.listId && context?.waitingForArticles?.listName);
  
  this.logger.debug('chat', '💾 isWaitingForArticles check:', {
    hasContext: !!context,
    hasWaitingForArticles: !!context?.waitingForArticles,
    hasListId: !!context?.waitingForArticles?.listId,
    hasListName: !!context?.waitingForArticles?.listName,
    result: isWaiting
  });
  
  return isWaiting;
}

/**
 * Get current target list if waiting for articles
 */
getCurrentTargetList(): { listId: string; listName: string } | null {
  const context = this.getConversationContext();
  const waitingForArticles = context?.waitingForArticles;
  
  if (waitingForArticles?.listId && waitingForArticles?.listName) {
    return {
      listId: waitingForArticles.listId,
      listName: waitingForArticles.listName
    };
  }
  
  return null;
}

// ========================================
// ENHANCED MESSAGE HANDLING
// ========================================

/**
 * Add message with conversation context awareness
 */
addMessageWithContext(text: string, type: 'user' | 'assistant' | 'error' | 'system', context?: ConversationContext): void {
  // Add the message first
  this.addMessage(text, type);
  
  // Update context if provided and valid
  if (context) {
    this.logger.debug('chat', '💾 Adding message with new context:', context);
    this.setConversationContext(context);
  }
}

/**
 * Add system message for conversation transitions
 */
addConversationTransition(message: string): void {
  this.addMessage(`🗣️ ${message}`, 'system');
}

// ========================================
// CONVERSATION STATISTICS
// ========================================

/**
 * Get conversation statistics
 */
getConversationStats(): {
  totalMessages: number;
  conversationMessages: number;
  articlesAdded: number;
  listsCreated: number;
  currentContext: ConversationContext | null;
  isActive: boolean;
} {
  const messages = this.messagesSubject.value;
  const context = this.getConversationContext();
  
  // Count different types of messages
  let conversationMessages = 0;
  let articlesAdded = 0;
  let listsCreated = 0;
  
  messages.forEach(message => {
    if (message.text.includes('hinzugefügt')) {
      articlesAdded++;
    }
    if (message.text.includes('Liste') && message.text.includes('erstellt')) {
      listsCreated++;
    }
    if (message.text.includes('Möchtest du') || message.text.includes('noch weitere')) {
      conversationMessages++;
    }
  });
  
  // FIXED: Ensure isActive is always boolean
  const isActive = this.isWaitingForArticles() || 
    (context?.lastAction ? (Date.now() - context.lastAction.timestamp.getTime() < 5 * 60 * 1000) : false);
  
  return {
    totalMessages: messages.length,
    conversationMessages,
    articlesAdded,
    listsCreated,
    currentContext: context,
    isActive: Boolean(isActive) // Ensure it's always boolean
  };
}

// ========================================
// INITIALIZATION WITH CONTEXT
// ========================================

/**
 * Enhanced initialization that loads conversation context
 */
initializeWithContext(): void {
  this.logger.debug('chat', '💾 Enhanced initialization with context...');
  
  // Load conversation context first
  this.loadConversationContext();
  
  const context = this.getConversationContext();
  this.logger.debug('chat', '💾 Loaded context:', context);
  
  // Initialize chat messages
  this.initializeIfEmpty();
  
  // Add context-aware message if needed
  const messages = this.getMessages();
  if (messages.length <= 1) {
    if (context?.waitingForArticles) {
      this.logger.debug('chat', '💾 Adding conversation restoration message');
      const welcomeMessage = `👋 Willkommen zurück!\n\n🗣️ Du warst dabei, Artikel zu "${context.waitingForArticles.listName}" hinzuzufügen.\n\n💡 Du kannst weitermachen oder "Nein" sagen um zu beenden.`;
      this.addMessage(welcomeMessage, 'system');
    } else if (context?.lastAction) {
      const minutes = Math.floor((Date.now() - context.lastAction.timestamp.getTime()) / 60000);
      if (minutes < 30) { // Only show if recent
        const welcomeMessage = `👋 Willkommen zurück!\n\n🕒 Vor ${minutes} Minuten: "${context.lastAction.listName}".\n\n💡 Sage "Hilfe" für Befehle.`;
        this.addMessage(welcomeMessage, 'system');
      }
    }
  }
}

/**
 * Enhanced welcome message that considers conversation context
 */
private getEnhancedWelcomeMessage(): string {
  const context = this.getConversationContext();
  
  if (context?.waitingForArticles) {
    return `👋 Willkommen zurück!\n\n🗣️ Du warst dabei, Artikel zu "${context.waitingForArticles.listName}" hinzuzufügen.\n\n💡 Du kannst weitermachen:\n• "Milch" - Einfacher Artikel\n• "Brot, Käse" - Mehrere Artikel\n• "2kg Bananen" - Mit Menge\n\nOder sage "Nein" um zu beenden.`;
  }
  
  if (context?.lastAction) {
    const minutes = Math.floor((Date.now() - context.lastAction.timestamp.getTime()) / 60000);
    const action = context.lastAction.type === 'list_created' ? 'erstellt' : 'bearbeitet';
    return `👋 Willkommen zurück!\n\n🕒 Vor ${minutes} Minuten hast du "${context.lastAction.listName}" ${action}.\n\n💡 Was möchtest du als nächstes tun?\n• "Zeige Listen"\n• "Erstelle Liste [Name]"\n• "Füge [Artikel] hinzu"`;
  }
  
  return '👋 Hallo! Ich bin dein AI Assistent für Einkaufslisten.\n\n💡 Sage "Hilfe" für verfügbare Befehle oder beginne direkt:\n• "Erstelle Liste Spar"\n• "Füge Milch hinzu"\n• "Brot, Wasser" (mehrere Artikel)';
}

// ========================================
// CONVERSATION FLOW HELPERS
// ========================================

/**
 * Add follow-up prompt as system message
 */
addFollowUpPrompt(prompt: string): void {
  setTimeout(() => {
    this.addMessage(prompt, 'system');
  }, 1000);
}

/**
 * Handle conversation ending
 */
handleConversationEnd(): void {
  this.logger.debug('chat', '💾 Handling conversation end');
  
  const context = this.getConversationContext();
  if (context?.waitingForArticles) {
    this.logger.debug('chat', '💾 Ending active conversation for list:', context.waitingForArticles.listName);
  }
  
  this.clearConversationContext();
  this.addMessage('👍 Unterhaltung beendet. Du kannst jederzeit neue Befehle eingeben!', 'system');
}

/**
 * Export conversation with context
 */
exportConversationWithContext(): string {
  const messages = this.messagesSubject.value;
  const context = this.getConversationContext();
  const stats = this.getConversationStats();
  
  let content = `Shoplisl AI Chat Export\n`;
  content += `Exportiert am: ${new Date().toLocaleString('de-DE')}\n`;
  content += `Nachrichten: ${stats.totalMessages}\n`;
  content += `Listen erstellt: ${stats.listsCreated}\n`;
  content += `Artikel hinzugefügt: ${stats.articlesAdded}\n`;
  content += `Konversationen: ${stats.conversationMessages}\n`;
  content += `Aktive Unterhaltung: ${stats.isActive ? 'Ja' : 'Nein'}\n`;
  
  if (context?.waitingForArticles) {
    content += `Aktiver Kontext: Warte auf Artikel für "${context.waitingForArticles.listName}"\n`;
  } else if (context?.lastAction) {
    const minutes = Math.floor((Date.now() - context.lastAction.timestamp.getTime()) / 60000);
    content += `Letzter Kontext: "${context.lastAction.listName}" vor ${minutes} Minuten\n`;
  }
  
  content += `\n${'='.repeat(50)}\n\n`;
  
  messages.forEach(message => {
    const time = message.timestamp.toLocaleTimeString('de-DE');
    const type = message.type === 'user' ? '👤' : 
                message.type === 'assistant' ? '🤖' : 
                message.type === 'system' ? '⚙️' : '❌';
    content += `[${time}] ${type} ${message.text}\n\n`;
  });
  
  return content;
}
  /**
   * NEW: Synchronize with AI service context
   */
  synchronizeWithAIService(aiServiceContext: ConversationContext): void {
    const currentContext = this.getConversationContext();
    
    // Only update if AI service context is more recent or more complete
    if (!currentContext || 
        (aiServiceContext.lastAction && 
        (!currentContext.lastAction || 
          aiServiceContext.lastAction.timestamp > currentContext.lastAction.timestamp))) {
      
      this.logger.debug('chat', '💾 Synchronizing with AI service context:', aiServiceContext);
      this.setConversationContext(aiServiceContext);
    }
  }

  /**
   * NEW: Validate context consistency
   */
  validateContextConsistency(): { isValid: boolean; issues: string[] } {
    const context = this.getConversationContext();
    const issues: string[] = [];
    
    if (!context) {
      return { isValid: true, issues: [] };
    }
    
    // Check lastAction validity
    if (context.lastAction) {
      if (!context.lastAction.timestamp || !(context.lastAction.timestamp instanceof Date)) {
        issues.push('Invalid lastAction timestamp');
      }
      
      if (!context.lastAction.type || !context.lastAction.listName) {
        issues.push('Missing required lastAction fields');
      }
    }
    
    // Check waitingForArticles validity
    if (context.waitingForArticles) {
      if (!context.waitingForArticles.listId || !context.waitingForArticles.listName) {
        issues.push('Missing required waitingForArticles fields');
      }
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
}