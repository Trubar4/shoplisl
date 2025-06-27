// src/app/core/services/chat-persistence.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ConversationContext } from '../models';

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

  constructor() {
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
    const messages = this.getMessages();
    if (messages.length === 0) {
      this.addMessage('Willkommen! Sage mir, was ich für dich tun kann.', 'system');
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
      console.warn('Failed to save chat to localStorage:', error);
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
      console.warn('Failed to save disambiguation to localStorage:', error);
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
      console.warn('Failed to load chat from localStorage:', error);
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
      console.error('Failed to import chat history:', error);
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
  console.log('💾 Setting conversation context:', context);
  this.conversationContextSubject.next(context);
  
  // Optionally persist to localStorage for session recovery
  if (context) {
    localStorage.setItem('shoplisl-conversation-context', JSON.stringify({
      ...context,
      lastAction: context.lastAction ? {
        ...context.lastAction,
        timestamp: context.lastAction.timestamp.toISOString()
      } : undefined
    }));
  } else {
    localStorage.removeItem('shoplisl-conversation-context');
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
    if (stored) {
      const parsed = JSON.parse(stored);
      
      // Convert timestamp back to Date
      if (parsed.lastAction?.timestamp) {
        parsed.lastAction.timestamp = new Date(parsed.lastAction.timestamp);
      }
      
      // Check if context is still valid (not too old)
      const maxAge = 30 * 60 * 1000; // 30 minutes
      if (parsed.lastAction?.timestamp && 
          Date.now() - parsed.lastAction.timestamp.getTime() < maxAge) {
        this.conversationContextSubject.next(parsed);
        console.log('💾 Restored conversation context:', parsed);
      } else {
        console.log('💾 Conversation context expired, clearing');
        localStorage.removeItem('shoplisl-conversation-context');
      }
    }
  } catch (error) {
    console.error('💾 Error loading conversation context:', error);
    localStorage.removeItem('shoplisl-conversation-context');
  }
}

/**
 * Clear conversation context
 */
clearConversationContext(): void {
  console.log('💾 Clearing conversation context');
  this.setConversationContext(null);
}

/**
 * Check if currently waiting for articles
 */
isWaitingForArticles(): boolean {
  const context = this.getConversationContext();
  return !!context?.waitingForArticles;
}

/**
 * Get current target list if waiting for articles
 */
getCurrentTargetList(): { listId: string; listName: string } | null {
  const context = this.getConversationContext();
  return context?.waitingForArticles || null;
}

// ========================================
// ENHANCED MESSAGE HANDLING
// ========================================

/**
 * Add message with conversation context awareness
 */
addMessageWithContext(text: string, type: 'user' | 'assistant' | 'error' | 'system', context?: ConversationContext): void {
  this.addMessage(text, type);
  
  if (context) {
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
    if (message.text.includes('Möchtest du')) {
      conversationMessages++;
    }
  });
  
  return {
    totalMessages: messages.length,
    conversationMessages,
    articlesAdded,
    listsCreated,
    currentContext: context
  };
}

// ========================================
// INITIALIZATION WITH CONTEXT
// ========================================

/**
 * Enhanced initialization that loads conversation context
 */
initializeWithContext(): void {
  this.loadConversationContext();
  this.initializeIfEmpty();
}

/**
 * Enhanced welcome message that considers conversation context
 */
private getEnhancedWelcomeMessage(): string {
  const context = this.getConversationContext();
  
  if (context?.waitingForArticles) {
    return `👋 Willkommen zurück!\n\n🗣️ Du warst dabei, Artikel zu "${context.waitingForArticles.listName}" hinzuzufügen.\n\n💡 Du kannst weitermachen oder einen neuen Befehl eingeben.`;
  }
  
  if (context?.lastAction) {
    const minutes = Math.floor((Date.now() - context.lastAction.timestamp.getTime()) / 60000);
    return `👋 Willkommen zurück!\n\n🕒 Vor ${minutes} Minuten hast du "${context.lastAction.listName}" ${context.lastAction.type === 'list_created' ? 'erstellt' : 'bearbeitet'}.\n\n💡 Was möchtest du als nächstes tun?`;
  }
  
  return '👋 Hallo! Ich bin dein AI Assistent für Einkaufslisten.\n\n💡 Sage "Hilfe" für verfügbare Befehle oder beginne direkt:\n• "Erstelle Liste Spar"\n• "Füge Milch hinzu"';
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
  
  if (context?.waitingForArticles) {
    content += `Aktiver Kontext: Warte auf Artikel für "${context.waitingForArticles.listName}"\n`;
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
}