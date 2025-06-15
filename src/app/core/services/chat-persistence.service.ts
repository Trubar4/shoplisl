// src/app/core/services/chat-persistence.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

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
}