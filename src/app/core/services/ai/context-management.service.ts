// src/app/core/services/ai/context-management.service.ts
import { Injectable } from '@angular/core';
import { ConversationContext } from '../../models';

@Injectable({
  providedIn: 'root'
})
export class ContextManagementService {
  private conversationContext: ConversationContext = {};

  constructor() {}

  // ========================================
  // CONTEXT MANAGEMENT
  // ========================================

  setConversationContext(context: ConversationContext): void {
    console.log('🤖 Setting conversation context:', context);
    this.conversationContext = { ...context };
  }
  
  getConversationContext(): ConversationContext {
    return { ...this.conversationContext };
  }
  
  clearConversationContext(): void {
    console.log('🤖 Clearing conversation context');
    this.conversationContext = {};
  }

  // ========================================
  // CONTEXT QUERIES
  // ========================================

  isWaitingForArticles(): boolean {
    return !!this.conversationContext.waitingForArticles;
  }

  getWaitingForArticlesContext(): {
    listId: string;
    listName: string;
    prompt: string;
  } | undefined {
    return this.conversationContext.waitingForArticles;
  }

  getLastAction(): {
    type: string;
    listId: string;
    listName: string;
    articleName?: string;
    timestamp: Date;
  } | undefined {
    return this.conversationContext.lastAction;
  }

  // ========================================
  // CONTEXT UPDATES
  // ========================================

  updateContextForArticleAdded(
    listId: string, 
    listName: string, 
    articleName: string
  ): void {
    this.setConversationContext({
      lastAction: {
        type: 'article_added',
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
    });
  }

  updateContextForListCreated(
    listId: string,
    listName: string
  ): void {
    this.setConversationContext({
      lastAction: {
        type: 'list_created',
        listId: listId,
        listName: listName,
        articleName: undefined,
        timestamp: new Date()
      },
      waitingForArticles: {
        listId: listId,
        listName: listName,
        prompt: 'Möchtest du Artikel hinzufügen?'
      }
    });
  }

  // ========================================
  // CONTEXT VALIDATION
  // ========================================

  isContextValid(maxAgeMs: number = 10 * 60 * 1000): boolean {
    const lastAction = this.getLastAction();
    if (!lastAction) return false;
    
    const timeSince = Date.now() - lastAction.timestamp.getTime();
    return timeSince < maxAgeMs;
  }

  hasTargetList(): boolean {
    const context = this.getWaitingForArticlesContext();
    return !!(context?.listId && context?.listName);
  }

  getTargetList(): { listId: string; listName: string } | null {
    const context = this.getWaitingForArticlesContext();
    if (context?.listId && context?.listName) {
      return {
        listId: context.listId,
        listName: context.listName
      };
    }
    return null;
  }

  // ========================================
  // CONVERSATION STATE
  // ========================================

  preserveContext(): ConversationContext {
    return { ...this.conversationContext };
  }

  restoreContext(context: ConversationContext): void {
    this.conversationContext = { ...context };
  }

  mergeContext(partialContext: Partial<ConversationContext>): void {
    this.conversationContext = {
      ...this.conversationContext,
      ...partialContext
    };
  }
}