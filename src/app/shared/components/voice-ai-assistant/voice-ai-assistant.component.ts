// src/app/shared/components/voice-ai-assistant/voice-ai-assistant.component.ts
// Complete Organized Voice AI Assistant with Recipe Skip Support

import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, Observable } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConversationContext } from '../../../core/models';

// Angular Material imports
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';

// Application services
import { 
  AIService, 
  AIExecutionResult, 
  PendingAction,
  MultiItemPendingAction,
  DisambiguationOption
} from '../../../core/services/ai';
import { ChatPersistenceService } from '../../../core/services/chat-persistence.service';
import { DepartmentService } from '../../../core/services/department.service';

// ========================================
// INTERFACES
// ========================================
interface ChatMessage {
  text: string;
  type: 'user' | 'assistant' | 'error' | 'system';
  timestamp: Date;
  actionData?: any;
}

@Component({
  selector: 'app-voice-ai-assistant',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, 
    MatInputModule, MatFormFieldModule, MatProgressSpinnerModule, MatSnackBarModule, 
    MatToolbarModule, MatDialogModule, MatTooltipModule, MatChipsModule
  ],
  templateUrl: './voice-ai-assistant.component.html',
  styleUrls: ['./voice-ai-assistant.component.scss']
})
export class VoiceAIAssistantComponent implements OnInit, OnDestroy {
  
  // ========================================
  // VIEW REFERENCES
  // ========================================
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  
  // ========================================
  // OBSERVABLE STREAMS
  // ========================================
  messages$: Observable<ChatMessage[]>;
  disambiguation$: Observable<any>;
  
  // ========================================
  // COMPONENT STATE
  // ========================================
  currentMessage = '';
  isProcessing = false;
  isRecording = false;
  private isSpeaking = false;
  
  // ========================================
  // INPUT TRACKING & AUDIO FEEDBACK
  // ========================================
  private lastInputSource: 'voice' | 'text' = 'text';
  private shouldProvideAudioFeedback = false;
  
  // ========================================
  // SPEECH SERVICES
  // ========================================
  private recognition: any;
  private synthesis: SpeechSynthesis;
  
  // ========================================
  // LIFECYCLE MANAGEMENT
  // ========================================
  private destroy$ = new Subject<void>();

  constructor(
    public aiService: AIService,
    public chatPersistence: ChatPersistenceService,
    public departmentService: DepartmentService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.synthesis = window.speechSynthesis;
    
    // Initialize data streams
    this.messages$ = this.chatPersistence.messages$;
    this.disambiguation$ = this.chatPersistence.disambiguation$;
    
    this.initializeSpeechRecognition();
  }

  // ========================================
  // LIFECYCLE HOOKS
  // ========================================
  ngOnInit(): void {
    this.initializeChat();
    this.setupPWAViewport();
    this.setupMessageScrolling();
    this.checkRestoredContext();
    this.logChatStatus();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  // ========================================
  // INITIALIZATION METHODS
  // ========================================
  private initializeChat(): void {
    this.chatPersistence.initializeWithContext();
  }

  private setupMessageScrolling(): void {
    this.messages$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      setTimeout(() => this.scrollToBottom(), 100);
    });
  }

  private checkRestoredContext(): void {
    setTimeout(() => {
      const context = this.chatPersistence.getConversationContext();
      if (context?.waitingForArticles) {
        console.log('🔄 Restored conversation context for:', context.waitingForArticles.listName);
        this.chatPersistence.addMessage(
          `🔄 Unterhaltung wiederhergestellt: Warte auf Artikel für "${context.waitingForArticles.listName}"`, 
          'system'
        );
      }
    }, 500);
  }

  private logChatStatus(): void {
    const summary = this.chatPersistence.getChatSummary();
    console.log('💬 Chat loaded:', summary);
  }

  private cleanup(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopRecording();

    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('resize', this.setupPWAViewport);
      window.removeEventListener('orientationchange', this.setupPWAViewport);
    }
  }

  // ========================================
  // CORE MESSAGING METHODS
  // ========================================
  async sendMessage(): Promise<void> {
    if (!this.currentMessage.trim() || this.isProcessing) return;

    const userMessage = this.currentMessage.trim();
    const lowerInput = userMessage.toLowerCase().trim();
    
    console.log('💬 ENHANCED SEND MESSAGE CALLED');
    console.log('💬 USER MESSAGE:', userMessage);
    
    // Clear disambiguation
    this.chatPersistence.setDisambiguation(null);
    this.chatPersistence.addMessage(userMessage, 'user');
    this.currentMessage = '';
    this.isProcessing = true;

    try {
      // CRITICAL: Special handling for recipe commands
      if (lowerInput.startsWith('rezept:') || lowerInput.startsWith('rezept ')) {
        console.log('🍳 RECIPE DETECTED - Using enhanced context preservation');
        await this.processRecipeWithContextPreservation(userMessage);
        return;
      }
      
      // Handle continuation keywords
      if (this.checkForContinuationKeywords(userMessage)) {
        const result = await this.handleContinuationKeywords(userMessage);
        await this.handleAIResult(result);
        return;
      }
      
      // System commands
      if (lowerInput.includes('hilfe') || lowerInput.includes('help') ||
          lowerInput.includes('test') || lowerInput.includes('api key') ||
          lowerInput.includes('zeige liste')) {
        const result = await this.aiService.executeCommand(userMessage);
        await this.handleAIResult(result);
        return;
      }
      
      // List creation
      if (lowerInput.includes('erstelle') && lowerInput.includes('liste')) {
        this.chatPersistence.clearConversationContext();
        const result = await this.aiService.executeCommand(userMessage);
        await this.handleAIResult(result);
        return;
      }
      
      // Explicit add commands
      if (lowerInput.includes('füge') && lowerInput.includes('hinzu')) {
        const result = await this.aiService.executeCommand(userMessage);
        await this.handleAIResult(result);
        return;
      }
      
      // Conversation mode
      if (this.isInActiveConversation()) {
        const targetList = this.chatPersistence.getCurrentTargetList();
        if (targetList) {
          // End conversation check
          if (lowerInput === 'nein' || lowerInput === 'fertig' || 
              lowerInput === 'stop' || lowerInput === 'ende') {
            this.chatPersistence.clearConversationContext();
            this.chatPersistence.addMessage('👍 Fertig! Du kannst jederzeit neue Befehle eingeben.', 'assistant');
            this.isProcessing = false;
            return;
          }
          
          // Process as article
          const enhancedInput = `Füge ${userMessage} zu ${targetList.listName} hinzu`;
          const result = await this.aiService.executeCommand(enhancedInput);
          
          // Force context if lost
          if (result.success && !result.conversationContext) {
            result.conversationContext = {
              lastAction: {
                type: 'article_added',
                listId: targetList.listId,
                listName: targetList.listName,
                articleName: userMessage,
                timestamp: new Date()
              },
              waitingForArticles: {
                listId: targetList.listId,
                listName: targetList.listName,
                prompt: 'Möchtest du noch weitere Artikel hinzufügen?'
              }
            };
          }
          
          await this.handleAIResult(result);
          return;
        }
      }
      
      // Regular processing
      const result = await this.aiService.executeCommand(userMessage);
      await this.handleAIResult(result);
      
    } catch (error) {
      console.error('💬 AI ERROR:', error);
      this.chatPersistence.addMessage(
        `❌ Entschuldigung, ein Fehler ist aufgetreten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`, 
        'error'
      );
    } finally {
      this.isProcessing = false;
      this.scrollToBottom();
    }
  }

  private async handleAIResult(result: AIExecutionResult): Promise<void> {
    console.log('🤖 HANDLE AI RESULT:', result);
    
    // Add main message
    this.chatPersistence.addMessage(result.message, result.success ? 'assistant' : 'error');

    // Handle disambiguation first
    if (result.needsUserInput && result.disambiguationOptions && result.pendingAction) {
      console.log('🤖 SHOWING DISAMBIGUATION');
      this.handleDisambiguation(result);
      return;
    }

    // CRITICAL: Always update conversation context FIRST
    if (result.conversationContext) {
      console.log('🤖 UPDATING CONVERSATION CONTEXT');
      this.chatPersistence.setConversationContext(result.conversationContext);
      this.chatPersistence.synchronizeWithAIService(result.conversationContext);
    }

    // ENHANCED: Force conversation context for list creation
    if (result.success && result.listId && result.message.includes('Liste') && result.message.includes('erstellt')) {
      console.log('🤖 DETECTED LIST CREATION - FORCING CONVERSATION CONTEXT');
      
      const listNameMatch = result.message.match(/Liste "([^"]+)" wurde erstellt/);
      const listName = listNameMatch ? listNameMatch[1] : 'Neue Liste';
      
      if (!result.conversationContext) {
        const forcedContext: ConversationContext = {
          lastAction: {
            type: 'list_created' as const,
            listId: result.listId,
            listName: listName,
            articleName: '',
            timestamp: new Date()
          },
          waitingForArticles: {
            listId: result.listId,
            listName: listName,
            prompt: 'Möchtest du Artikel hinzufügen?'
          }
        };
        
        this.chatPersistence.setConversationContext(forcedContext);
        this.chatPersistence.synchronizeWithAIService(forcedContext);
        
        result.followUpPrompt = result.followUpPrompt || 
          `Möchtest du jetzt Artikel zu "${listName}" hinzufügen?`;
      }
    }

    // Handle follow-up prompts
    if (result.success && result.followUpPrompt) {
      console.log('🤖 ADDING FOLLOW-UP PROMPT:', result.followUpPrompt);
      setTimeout(() => {
        this.chatPersistence.addMessage(result.followUpPrompt!, 'system');
        this.scrollToBottom();
      }, 1000);
    }

    // Handle successful actions
    if (result.success && result.listId) {
      setTimeout(() => {
        this.handleSuccessfulAction(result);
      }, 100);
    }
  }

  // ========================================
  // RECIPE PROCESSING METHODS
  // ========================================
  private async processRecipeWithContextPreservation(userMessage: string): Promise<void> {
    console.log('🍳 PROCESSING RECIPE WITH CONTEXT PRESERVATION');
    
    // Step 1: Capture current context from ALL sources
    const aiContext = this.aiService.getConversationContext();
    const chatContext = this.chatPersistence.getConversationContext();
    
    console.log('🍳 STEP 1 - Current contexts:');
    console.log('🍳 - AI Context:', JSON.stringify(aiContext, null, 2));
    console.log('🍳 - Chat Context:', JSON.stringify(chatContext, null, 2));
    
    // Step 2: Determine the active list context
    let targetListName = null;
    let targetListId = null;
    
    if (aiContext.waitingForArticles) {
      targetListName = aiContext.waitingForArticles.listName;
      targetListId = aiContext.waitingForArticles.listId;
      console.log('🍳 - Found target from AI context:', targetListName);
    } else if (chatContext?.waitingForArticles) {
      targetListName = chatContext.waitingForArticles.listName;
      targetListId = chatContext.waitingForArticles.listId;
      console.log('🍳 - Found target from chat context:', targetListName);
    } else if (aiContext.lastAction) {
      const timeSince = Date.now() - aiContext.lastAction.timestamp.getTime();
      if (timeSince < 10 * 60 * 1000) {
        targetListName = aiContext.lastAction.listName;
        targetListId = aiContext.lastAction.listId;
        console.log('🍳 - Found target from AI last action:', targetListName);
      }
    } else if (chatContext?.lastAction) {
      const timeSince = Date.now() - chatContext.lastAction.timestamp.getTime();
      if (timeSince < 10 * 60 * 1000) {
        targetListName = chatContext.lastAction.listName;
        targetListId = chatContext.lastAction.listId;
        console.log('🍳 - Found target from chat last action:', targetListName);
      }
    }
    
    // Step 3: Log the final target
    console.log('🍳 STEP 2 - Final target determination:');
    console.log('🍳 - Target List Name:', targetListName);
    console.log('🍳 - Target List ID:', targetListId);
    
    // Step 4: Create forced context if we have a target
    if (targetListName && targetListId) {
      const forcedContext: ConversationContext = {
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
      
      console.log('🍳 STEP 3 - Setting forced context in AI service:', forcedContext);
      this.aiService.setConversationContext(forcedContext);
      this.chatPersistence.setConversationContext(forcedContext);
    }
    
    // Step 5: Process the recipe
    console.log('🍳 STEP 4 - Processing recipe command');
    const result = await this.aiService.executeCommand(userMessage);
    
    // Step 6: Verify context preservation
    const newAiContext = this.aiService.getConversationContext();
    const newChatContext = this.chatPersistence.getConversationContext();
    
    console.log('🍳 STEP 5 - Context after processing:');
    console.log('🍳 - New AI Context:', JSON.stringify(newAiContext, null, 2));
    console.log('🍳 - New Chat Context:', JSON.stringify(newChatContext, null, 2));
    
    // Step 7: Force context restoration if lost
    if (targetListName && targetListId && 
        (!result.conversationContext || !result.conversationContext.waitingForArticles)) {
      console.log('🍳 STEP 6 - FORCING context restoration');
      
      result.conversationContext = {
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
      
      result.followUpPrompt = result.followUpPrompt || 
        `Möchtest du noch weitere Artikel zu "${targetListName}" hinzufügen?`;
    }
    
    await this.handleAIResult(result);
  }

  // ========================================
  // CONVERSATION CONTEXT METHODS
  // ========================================
  getConversationStatus(): string {
    const aiContext = this.aiService.getConversationContext();
    const chatContext = this.chatPersistence.getConversationContext();
    
    console.log('🔍 GET CONVERSATION STATUS CALLED');
    console.log('🔍 AI Service Context:', JSON.stringify(aiContext, null, 2));
    console.log('🔍 Chat Persistence Context:', JSON.stringify(chatContext, null, 2));
    
    // Check multiple sources for conversation context
    let activeContext = null;
    let source = 'none';
    
    if (aiContext.waitingForArticles) {
      activeContext = aiContext.waitingForArticles;
      source = 'AI Service';
    } else if (chatContext?.waitingForArticles) {
      activeContext = chatContext.waitingForArticles;
      source = 'Chat Persistence';
    } else if (aiContext.lastAction) {
      const timeSince = Date.now() - aiContext.lastAction.timestamp.getTime();
      if (timeSince < 10 * 60 * 1000) { // 10 minutes
        const minutes = Math.floor(timeSince / 60000);
        return `"${aiContext.lastAction.listName}" vor ${minutes}min - Fortsetzung mit "und" möglich`;
      }
    } else if (chatContext?.lastAction) {
      const timeSince = Date.now() - chatContext.lastAction.timestamp.getTime();
      if (timeSince < 10 * 60 * 1000) { // 10 minutes
        const minutes = Math.floor(timeSince / 60000);
        return `"${chatContext.lastAction.listName}" vor ${minutes}min - Fortsetzung mit "und" möglich`;
      }
    }
    
    if (activeContext) {
      console.log(`🔍 Active context found in ${source}:`, activeContext);
      return `Warte auf Artikel für "${activeContext.listName}"`;
    }
    
    console.log('🔍 No active conversation context found');
    return 'Keine aktive Unterhaltung';
  }

  isInActiveConversation(): boolean {
    const aiServiceContext = this.aiService.getConversationContext();
    const persistenceContext = this.chatPersistence.getConversationContext();
    
    const hasAiServiceConversation = !!aiServiceContext.waitingForArticles;
    const hasPersistenceConversation = !!persistenceContext?.waitingForArticles;
    
    return hasAiServiceConversation || hasPersistenceConversation;
  }

  finishAddingArticles(): void {
    const context = this.aiService.getConversationContext();
    const persistenceContext = this.chatPersistence.getConversationContext();
    
    if (context.waitingForArticles || persistenceContext?.waitingForArticles) {
      console.log('🗣️ User manually finished adding articles');
      this.chatPersistence.clearConversationContext();
      this.sendQuickMessage('nein');
    }
  }

  // ========================================
  // CONTINUATION HANDLING
  // ========================================
  private checkForContinuationKeywords(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    const continuationKeywords = ['und', 'weiters', 'außerdem', 'zusätzlich', 'noch'];
    
    return continuationKeywords.some(keyword => 
      lowerInput.startsWith(keyword + ' ') || 
      lowerInput === keyword
    );
  }

  private async handleContinuationKeywords(input: string): Promise<AIExecutionResult> {
    const context = this.chatPersistence.getConversationContext();
    
    if (context?.lastAction && context.lastAction.listId) {
      const timeSince = Date.now() - context.lastAction.timestamp.getTime();
      const maxAge = 10 * 60 * 1000; // 10 minutes
      
      if (timeSince < maxAge) {
        const lowerInput = input.toLowerCase().trim();
        let itemsText = input;
        
        const continuationKeywords = ['und', 'weiters', 'außerdem', 'zusätzlich', 'noch'];
        for (const keyword of continuationKeywords) {
          if (lowerInput.startsWith(keyword + ' ')) {
            itemsText = input.substring(keyword.length + 1).trim();
            break;
          } else if (lowerInput === keyword) {
            return {
              success: true,
              message: `Was möchtest du noch zu "${context.lastAction.listName}" hinzufügen?`,
              conversationContext: {
                ...context,
                waitingForArticles: {
                  listId: context.lastAction.listId,
                  listName: context.lastAction.listName,
                  prompt: 'Continuation mode activated'
                }
              }
            };
          }
        }
        
        if (itemsText.trim()) {
          this.chatPersistence.setConversationContext({
            lastAction: context.lastAction,
            waitingForArticles: {
              listId: context.lastAction.listId,
              listName: context.lastAction.listName,
              prompt: 'Continuation mode'
            }
          });
          
          const enhancedInput = `Füge ${itemsText} zu ${context.lastAction.listName} hinzu`;
          return await this.aiService.executeCommand(enhancedInput);
        }
      }
    }
    
    return {
      success: false,
      message: '💡 Keine kürzliche Liste gefunden zum Fortsetzen.\n\nVerwende Fortsetzungs-Wörter wie "und" oder "weiters" nur nach dem Hinzufügen von Artikeln zu einer Liste.'
    };
  }

  // ========================================
  // DISAMBIGUATION METHODS
  // ========================================
  private handleDisambiguation(result: AIExecutionResult): void {
    if (!result.disambiguationOptions || !result.pendingAction) {
      console.error('Invalid disambiguation data:', result);
      return;
    }

    console.log('🎯 HANDLING DISAMBIGUATION WITH SKIP OPTIONS');
    console.log('🎯 Original options:', result.disambiguationOptions);
    console.log('🎯 Pending action:', result.pendingAction);

    // CRITICAL: Always ensure skip option is present with German label
    const hasSkipOption = result.disambiguationOptions.some(opt => opt.type === 'skip');
    
    if (!hasSkipOption && result.pendingAction) {
      console.log('🍳 ADDING German skip option to disambiguation');
      result.disambiguationOptions.push({
        id: 'skip_item',
        displayName: `"${result.pendingAction.itemName}" überspringen`,
        type: 'skip' as const,
        confidence: 1.0,
        icon: '⏭️',
        skipReason: 'Bereits zu Hause vorhanden'
      });
    } else if (result.pendingAction) {
      // CRITICAL: Ensure existing skip options have proper German labels
      result.disambiguationOptions.forEach(option => {
        if (option.type === 'skip') {
          option.displayName = `"${result.pendingAction!.itemName}" überspringen`;
          option.skipReason = option.skipReason || 'Bereits zu Hause vorhanden';
          option.icon = '⏭️';
        }
      });
    }

    console.log('🎯 FINAL options with skip:', result.disambiguationOptions);

    // Convert options to avoid type conflicts
    const compatibleOptions = result.disambiguationOptions.map((option: any) => ({
      id: option.id,
      displayName: option.displayName,
      type: option.type,
      article: option.article,
      confidence: option.confidence,
      department: option.department,
      icon: option.icon,
      skipReason: option.skipReason
    }));
    
    this.chatPersistence.setDisambiguation({
      message: result.message,
      options: compatibleOptions as any[],
      pendingAction: result.pendingAction as any
    });
  }

  selectDisambiguationOption(option: any): void {
    console.log('🎯 DISAMBIGUATION OPTION SELECTED:', option);
    
    const disambiguation = this.chatPersistence.getDisambiguation();
    if (!disambiguation) {
      console.error('🎯 No disambiguation available!');
      return;
    }

    const pendingAction = disambiguation.pendingAction;
    
    // CRITICAL: Handle SKIP option with German messaging
    if (option.type === 'skip') {
      console.log('⏭️ Processing skip option with German labels');
      this.handleSkipArticleWithGermanLabels(pendingAction, option);
      return;
    }
    
    // Clear disambiguation for non-skip options
    this.chatPersistence.setDisambiguation(null);
    
    // Generate choice text
    const choiceText = this.generateChoiceTextWithGerman(option, pendingAction);
    this.chatPersistence.addMessage(choiceText, 'user');
    this.isProcessing = true;

    // Process with conversation preservation
    this.aiService.handleDisambiguationChoice(pendingAction, option)
      .then((result: AIExecutionResult) => {
        console.log('🎯 DISAMBIGUATION RESULT:', result);
        
        // Preserve conversation context
        if (!result.conversationContext && this.isInActiveConversation()) {
          console.log('🎯 PRESERVING conversation context');
          const currentContext = this.chatPersistence.getConversationContext() || 
                                this.aiService.getConversationContext();
          if (currentContext.waitingForArticles) {
            result.conversationContext = currentContext;
            result.followUpPrompt = result.followUpPrompt || 
              `Möchtest du noch weitere Artikel zu "${currentContext.waitingForArticles.listName}" hinzufügen?`;
          }
        }
        
        this.handleAIResult(result);
      })
      .catch((error: any) => {
        console.error('🎯 DISAMBIGUATION ERROR:', error);
        this.chatPersistence.addMessage(
          `❌ Fehler: ${error.message || 'Unbekannter Fehler'}`, 
          'error'
        );
      })
      .finally(() => {
        this.isProcessing = false;
        this.scrollToBottom();
      });
  }

  cancelDisambiguation(): void {
    this.chatPersistence.setDisambiguation(null);
    this.chatPersistence.addMessage('Aktion abgebrochen.', 'system');
  }

  // ========================================
  // SKIP FUNCTIONALITY METHODS
  // ========================================
  private handleSkipArticleWithGermanLabels(pendingAction: any, option: any): void {
    console.log('⏭️ Enhanced German skip handling for:', pendingAction.itemName);
    
    // Clear disambiguation immediately
    this.chatPersistence.setDisambiguation(null);
    
    // Generate German skip message
    let skipMessage = `⏭️ "${pendingAction.itemName}" übersprungen`;
    
    if (option.skipReason) {
      skipMessage += ` (${option.skipReason})`;
    } else {
      skipMessage += ' (bereits vorhanden)';
    }
    
    // Add progress info for sequential processing
    if (this.isSequentialRecipeProcessing(pendingAction)) {
      const current = this.getCurrentItemIndex(pendingAction) + 1;
      const total = this.getTotalItems(pendingAction);
      const remaining = total - current;
      
      if (remaining > 0) {
        skipMessage += ` - ${remaining} weitere Zutat${remaining === 1 ? '' : 'en'} verbleibend`;
      }
    }
    
    this.chatPersistence.addMessage(skipMessage, 'user');
    this.isProcessing = false;
    
    // Show German continuation message
    if (this.isSequentialRecipeProcessing(pendingAction)) {
      const remaining = this.getTotalItems(pendingAction) - this.getCurrentItemIndex(pendingAction) - 1;
      
      if (remaining > 0) {
        this.chatPersistence.addMessage(
          `⏭️ Zutat übersprungen. Verarbeite die nächste Zutat (${remaining} verbleibend)...`, 
          'assistant'
        );
      } else {
        this.chatPersistence.addMessage(
          '🍳 Rezept-Verarbeitung abgeschlossen! Alle Zutaten wurden verarbeitet.', 
          'assistant'
        );
      }
    } else {
      const context = this.chatPersistence.getConversationContext();
      if (context?.waitingForArticles) {
        this.chatPersistence.addMessage(
          `⏭️ Zutat übersprungen. Du kannst weitere Artikel zu "${context.waitingForArticles.listName}" hinzufügen.`, 
          'assistant'
        );
      } else {
        this.chatPersistence.addMessage(
          '⏭️ Artikel übersprungen. Du kannst weitere Artikel hinzufügen.',
          'assistant'
        );
      }
    }
  }

  async skipAllRemaining(pendingAction: any): Promise<void> {
    if (!this.isSequentialRecipeProcessing(pendingAction)) return;
    
    console.log('⏭️ Alle verbleibenden Zutaten überspringen');
    
    // Clear disambiguation
    this.chatPersistence.setDisambiguation(null);
    
    const remaining = this.getTotalItems(pendingAction) - this.getCurrentItemIndex(pendingAction);
    
    // Add German message
    this.chatPersistence.addMessage(
      `⏭️ Alle ${remaining} verbleibenden Zutaten übersprungen`, 
      'user'
    );
    
    this.isProcessing = true;
    
    try {
      // Create result for skipping all
      const result = await this.handleSkipAllRemainingWithGerman(pendingAction);
      await this.handleAIResult(result);
    } catch (error) {
      console.error('⏭️ Error skipping all items:', error);
      this.chatPersistence.addMessage('❌ Fehler beim Überspringen der Artikel', 'error');
    } finally {
      this.isProcessing = false;
    }
  }

  private async handleSkipAllRemainingWithGerman(pendingAction: any): Promise<AIExecutionResult> {
    const { allItems, currentItemIndex, processedItems, conversationListId } = pendingAction;
    
    // Mark all remaining items as skipped
    const updatedProcessedItems = [...processedItems];
    
    for (let i = currentItemIndex; i < allItems.length; i++) {
      updatedProcessedItems.push({
        originalText: allItems[i],
        skipped: true,
        reason: 'alle_übersprungen'
      });
    }
    
    // Build German summary
    const successfulItems = updatedProcessedItems.filter(item => !item.skipped && !item.failed);
    const skippedItems = updatedProcessedItems.filter(item => item.skipped);
    
    let message = '🍳 **Rezept-Verarbeitung abgeschlossen**\n\n';
    
    if (successfulItems.length > 0) {
      const addedSummary = successfulItems
        .map(item => `"${item.article?.name || item.originalText}"`)
        .join(', ');
      message += `✅ **${successfulItems.length} Artikel hinzugefügt:**\n${addedSummary}\n\n`;
    }
    
    if (skippedItems.length > 0) {
      const skippedSummary = skippedItems
        .map(item => `"${item.originalText}"`)
        .join(', ');
      message += `⏭️ **${skippedItems.length} Artikel übersprungen:**\n${skippedSummary}\n\n`;
    }
    
    // Maintain conversation context
    const context = this.chatPersistence.getConversationContext();
    let conversationContext = context;
    
    if (context?.waitingForArticles) {
      message += `📋 **Liste "${context.waitingForArticles.listName}" ist bereit für den Einkauf!**`;
      
      conversationContext = {
        lastAction: {
          type: 'article_added' as const,
          listId: context.waitingForArticles.listId,
          listName: context.waitingForArticles.listName,
          articleName: `Rezept (${successfulItems.length} Artikel)`,
          timestamp: new Date()
        },
        waitingForArticles: {
          listId: context.waitingForArticles.listId,
          listName: context.waitingForArticles.listName,
          prompt: 'Möchtest du noch weitere Artikel hinzufügen?'
        }
      };
    }
    
    return {
      success: true,
      message: message,
      listId: conversationContext?.waitingForArticles?.listId,
      conversationContext: conversationContext || undefined,
      followUpPrompt: 'Möchtest du noch weitere Artikel hinzufügen oder ein neues Rezept verarbeiten?'
    };
  }

  // ========================================
  // VOICE INPUT METHODS
  // ========================================
  toggleVoiceInput(): void {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startVoiceRecording();
    }
  }

  private initializeSpeechRecognition(): void {
    if (!this.isSpeechRecognitionSupported()) {
      console.warn('Speech recognition not supported');
      return;
    }

    const SpeechRecognition = this.getSpeechRecognitionClass();
    this.recognition = new SpeechRecognition();
    this.configureSpeechRecognition();
  }

  private isSpeechRecognitionSupported(): boolean {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }

  private getSpeechRecognitionClass(): any {
    return (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
  }

  private configureSpeechRecognition(): void {
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'de-DE';
    
    this.recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      this.currentMessage = transcript;
      this.isRecording = false;
      
      // Mark as voice input for audio feedback
      this.lastInputSource = 'voice';
      this.shouldProvideAudioFeedback = true;
      
      console.log('🎤 Voice input received:', transcript);
      setTimeout(() => this.sendMessage(), 500);
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      this.isRecording = false;
      this.handleSpeechError(event.error);
    };

    this.recognition.onend = () => {
      this.isRecording = false;
    };
  }

  private handleSpeechError(error: string): void {
    let errorMessage = 'Spracherkennung fehlgeschlagen.';
    
    switch (error) {
      case 'no-speech':
        errorMessage = 'Keine Sprache erkannt. Versuche es erneut.';
        break;
      case 'not-allowed':
        errorMessage = 'Mikrofon-Berechtigung erforderlich.';
        break;
    }
    
    this.snackBar.open(errorMessage, 'OK', { duration: 3000 });
  }

  private startVoiceRecording(): void {
    if (!this.recognition) {
      this.snackBar.open('Spracherkennung nicht unterstützt', 'OK', { duration: 3000 });
      return;
    }

    this.isRecording = true;
    this.currentMessage = '';
    
    try {
      this.recognition.start();
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      this.isRecording = false;
      this.snackBar.open('Spracherkennung konnte nicht gestartet werden', 'OK', { duration: 3000 });
    }
  }

  private stopRecording(): void {
    if (this.recognition && this.isRecording) {
      this.recognition.stop();
    }
    this.isRecording = false;
  }

  private speak(text: string): void {
    if (!this.synthesis || this.isSpeaking) return;
    
    this.synthesis.cancel();
    this.isSpeaking = true;
    
    const cleanText = text.split('\n')[0]
      .replace(/[✅❌🎯💡📝🛒🔑⚖️🎨📋]/g, '')
      .trim();
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'de-DE';
    utterance.rate = 0.9;
    utterance.volume = 0.8;
    
    utterance.onend = () => {
      this.isSpeaking = false;
    };
    
    utterance.onerror = () => {
      this.isSpeaking = false;
    };
    
    this.synthesis.speak(utterance);
  }

  // ========================================
  // UI HELPER METHODS
  // ========================================
  onTextInput(): void {
    this.lastInputSource = 'text';
    this.shouldProvideAudioFeedback = false;
  }

  sendQuickMessage(message: string): void {
    this.chatPersistence.setDisambiguation(null);
    this.currentMessage = message;
    this.sendMessage();
  }

  /**
   * Check if continuation keywords can be used
   */
  canUseContinuation(): boolean {
    const context = this.chatPersistence.getConversationContext();
    
    if (context?.lastAction) {
      const timeSince = Date.now() - context.lastAction.timestamp.getTime();
      return timeSince < 10 * 60 * 1000; // 10 minutes
    }
    
    return false;
  }

  /**
   * Quick continuation actions
   */
  quickContinuation(keyword: string): void {
    const examples = ['Milch', 'Brot', '2kg Bananen', 'Käse'];
    const randomItem = examples[Math.floor(Math.random() * examples.length)];
    this.sendQuickMessage(`${keyword} ${randomItem}`);
  }

  onEnterKey(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.ctrlKey) {
      keyboardEvent.preventDefault();
      this.sendMessage();
    }
  }

  getInputPlaceholder(): string {
    if (this.isInActiveConversation()) {
      const context = this.chatPersistence.getConversationContext();
      if (context?.waitingForArticles) {
        return `Artikel für "${context.waitingForArticles.listName}"`;
      }
      return 'Artikel eingeben';
    }
    return 'z.B. "Füge Milch hinzu" oder "Hilfe"';
  }

  getVoiceTooltip(): string {
    if (this.isRecording) {
      return 'Aufnahme stoppen';
    }
    if (this.isInActiveConversation()) {
      return 'Artikel per Sprache hinzufügen';
    }
    return 'Sprachbefehl aufnehmen';
  }

  getSendTooltip(): string {
    if (this.isInActiveConversation()) {
      return 'Artikel zur Liste hinzufügen';
    }
    return 'Befehl senden';
  }

  // ========================================
  // DISAMBIGUATION UI HELPERS
  // ========================================
  isRecipeProcessing(pendingAction: any): boolean {
    if (!pendingAction) return false;
    return pendingAction.isFromRecipe || 
           pendingAction.isMultiItemSequential ||
           (pendingAction.originalInput && pendingAction.originalInput.toLowerCase().includes('rezept')) ||
           (pendingAction.allItems && pendingAction.allItems.length > 3);
  }

  isSequentialRecipeProcessing(pendingAction: any): boolean {
    return pendingAction?.isMultiItemSequential && 
           pendingAction?.allItems &&
           pendingAction?.currentItemIndex !== undefined;
  }

  getRegularOptions(options: any[]): any[] {
    return options?.filter(option => option.type !== 'skip') || [];
  }

  getSkipOptions(options: any[]): any[] {
    return options?.filter(option => option.type === 'skip') || [];
  }

  getSkipReason(option: any, pendingAction: any): string {
    if (option.skipReason) {
      return option.skipReason;
    }
    if (this.isRecipeProcessing(pendingAction)) {
      return 'Bereits zu Hause vorhanden oder nicht benötigt';
    }
    return 'Nicht hinzufügen';
  }

  getCurrentItemIndex(pendingAction: any): number {
    return pendingAction?.currentItemIndex || 0;
  }

  getTotalItems(pendingAction: any): number {
    return pendingAction?.allItems?.length || 1;
  }

  getProgressPercentage(pendingAction: any): number {
    if (!this.isSequentialRecipeProcessing(pendingAction)) return 0;
    const current = this.getCurrentItemIndex(pendingAction) + 1;
    const total = this.getTotalItems(pendingAction);
    return Math.round((current / total) * 100);
  }

  canSkipAll(pendingAction: any): boolean {
    if (!this.isSequentialRecipeProcessing(pendingAction)) return false;
    const current = this.getCurrentItemIndex(pendingAction);
    const total = this.getTotalItems(pendingAction);
    return (total - current) >= 3;
  }

  getDisambiguationHeaderColor(disambiguation: any): string {
    if (disambiguation.pendingAction?.type === 'select_list') {
      return '#2196f3';
    }
    return '#ff9800';
  }

  getDisambiguationHeaderIcon(disambiguation: any): string {
    if (disambiguation.pendingAction?.type === 'select_list') {
      return 'playlist_add';
    }
    return 'help_outline';
  }

  getDisambiguationHeaderTitle(disambiguation: any): string {
    if (disambiguation.pendingAction?.type === 'select_list') {
      return 'Liste auswählen';
    }
    return 'Artikel auswählen';
  }

  getActionDescription(pendingAction: any): string {
    if (!pendingAction) return 'Unbekannte Aktion';
    
    if ('items' in pendingAction && 'currentItemIndex' in pendingAction) {
      const items = pendingAction.items;
      const currentIndex = pendingAction.currentItemIndex;
      
      if (Array.isArray(items) && typeof currentIndex === 'number' && currentIndex < items.length) {
        const currentItem = items[currentIndex];
        if (currentItem && currentItem.itemName) {
          return `Artikel ${currentIndex + 1}/${items.length}: "${currentItem.itemName}" verarbeiten`;
        }
      }
      return `Mehrere Artikel verarbeiten`;
    } else {
      switch (pendingAction.type) {
        case 'add_item':
          return pendingAction.listName ? 
            `Hinzufügen zu "${pendingAction.listName}"` : 
            'Hinzufügen zur Liste';
        case 'create_list':
          return `Neue Liste "${pendingAction.listName}" erstellen`;
        case 'select_list':
          return 'Zur ausgewählten Liste hinzufügen';
        default:
          return 'Unbekannte Aktion';
      }
    }
  }

  getDefaultIcon(option: any): string {
    if (option.type === 'new') {
      return '✨';
    }
    if (option.type === 'skip') {
      return '⏭️';
    }
    return option.icon || '📦';
  }

  getActionHint(option: any, pendingAction: any): string {
    if (!pendingAction) return 'Unbekannte Aktion';
    
    if (option.type === 'skip') {
      return 'Überspringen';
    }
    
    const isListSelection = pendingAction?.type === 'select_list';
    
    if (isListSelection) {
      if ('items' in pendingAction) {
        const items = pendingAction.items;
        if (Array.isArray(items) && items.length > 1) {
          return `${items.length} Artikel zu "${option.displayName}" hinzufügen`;
        }
      }
      return `Zu "${option.displayName}" hinzufügen`;
    }
  
    if (option.type === 'existing') {
      return 'Vorhandenen Artikel verwenden';
    } else {
      return 'Neuen Artikel erstellen';
    }
  }

  getDepartmentName(departmentId?: string): string {
    if (!departmentId) return 'Unbekannt';
    return this.departmentService.getDepartmentName(departmentId, 'german');
  }

  getConfidenceText(confidence: number): string {
    const percentage = Math.round(confidence * 100);
    if (percentage >= 90) return `${percentage}% - Exakte Übereinstimmung`;
    if (percentage >= 70) return `${percentage}% - Sehr ähnlich`;
    if (percentage >= 50) return `${percentage}% - Ähnlich`;
    return `${percentage}% - Entfernt ähnlich`;
  }

  private generateChoiceTextWithGerman(option: DisambiguationOption, pendingAction: any): string {
    if (option.type === 'skip') {
      return `⏭️ "${pendingAction.itemName}" übersprungen`;
    }
    
    if (this.isSequentialRecipeProcessing(pendingAction)) {
      const current = this.getCurrentItemIndex(pendingAction) + 1;
      const total = this.getTotalItems(pendingAction);
      
      if (option.type === 'existing') {
        return `🍳 Zutat ${current}/${total}: ${option.displayName} (vorhandener Artikel gewählt)`;
      } else {
        return `🍳 Zutat ${current}/${total}: "${pendingAction.itemName}" (neuen Artikel erstellen)`;
      }
    }
    
    if (option.type === 'existing') {
      return `Vorhandener Artikel gewählt: ${option.displayName}`;
    } else {
      return `Neuen Artikel erstellen: ${pendingAction.itemName}`;
    }
  }

  private handleSuccessfulAction(result: AIExecutionResult): void {
    if (this.shouldProvideAudioFeedback) {
      const messageToSpeak = result.message.split('\n')[0]
        .replace(/[✅❌🎯💡📝🛒🔑⚖️🎨📋]/g, '')
        .trim();
      
      if (messageToSpeak) {
        this.speak(messageToSpeak);
      }
    }
    
    if (result.conversationContext) {
      this.chatPersistence.setConversationContext(result.conversationContext);
    }
  }

  // ========================================
  // NAVIGATION & ACTIONS
  // ========================================
  onBack(): void {
    this.router.navigate(['/lists']);
  }
  
  clearChat(): void {
    this.chatPersistence.clearMessages();
    this.chatPersistence.initializeIfEmpty();
    this.snackBar.open('Chat geleert', '', { duration: 1500 });
  }

  exportChat(): void {
    const chatHistory = this.chatPersistence.exportConversationWithContext();
    this.downloadChatFile(chatHistory);
    this.snackBar.open('Chat exportiert', '', { duration: 1500 });
  }

  private downloadChatFile(content: string): void {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shoplisl-chat-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  showContextualHelp(): void {
    const hasApiKey = this.aiService.hasApiKey();
    const helpMessage = this.aiService.aiResponse.getEnhancedHelpMessage(hasApiKey);
    this.chatPersistence.addMessage(helpMessage, 'assistant');
  }

  showRecipeHelp(): void {
    const helpMessage = '🍳 <strong>Rezept-Feature</strong><br><br>' +
      '• "Rezept: 500g Mehl, 2 Eier, 250ml Milch"<br>' +
      '• Erkennt deutsche Maßeinheiten automatisch<br>' +
      '• Filtert Überschriften und Anweisungen heraus<br>' +
      '• ⏭️ Skip-Option für vorhandene Zutaten<br>' +
      '• Funktioniert mit Copy-Paste aus Rezept-Websites';
    
    this.chatPersistence.addMessage(helpMessage, 'assistant');
  }

  // ========================================
  // PWA & UTILITY METHODS
  // ========================================
  private setupPWAViewport(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.setViewportHeight();
    this.setupViewportListeners();
    this.handlePWAMode();
    this.handleMobileKeyboard();
  }

  private setViewportHeight(): void {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  private setupViewportListeners(): void {
    const updateViewport = () => {
      this.setViewportHeight();
    };

    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', () => {
      setTimeout(updateViewport, 100);
    });
  }

  private handlePWAMode(): void {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      console.log('🔧 PWA mode detected - applying viewport fixes');
      document.body.style.setProperty('--pwa-bottom-padding', 'calc(75px + env(safe-area-inset-bottom, 0px))');
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 300);
    }
  }

  private handleMobileKeyboard(): void {
    let initialViewportHeight = window.innerHeight;

    const handleViewportChange = () => {
      const currentHeight = window.innerHeight;
      const keyboardHeight = initialViewportHeight - currentHeight;

      if (keyboardHeight > 150) {
        document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
        document.body.classList.add('keyboard-open');
      } else {
        document.documentElement.style.setProperty('--keyboard-height', '0px');
        document.body.classList.remove('keyboard-open');
      }
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('focus', () => {
      initialViewportHeight = window.innerHeight;
    }, true);
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  public trackByOptionId(index: number, option: any): string {
    return option.id || index.toString();
  }

  // ========================================
  // DEBUG & TESTING METHODS
  // ========================================
  forceTestContext(): void {
    const testContext: ConversationContext = {
      lastAction: {
        type: 'list_created' as const,
        listId: 'test-123',
        listName: 'Spar',
        articleName: '',
        timestamp: new Date()
      },
      waitingForArticles: {
        listId: 'test-123',
        listName: 'Spar',
        prompt: 'Test'
      }
    };
    
    console.log('🧪 SETTING TEST CONTEXT:', testContext);
    this.aiService.setConversationContext(testContext);
    this.chatPersistence.setConversationContext(testContext);
    
    this.chatPersistence.addMessage(
      '🧪 Test-Kontext gesetzt: Warte auf Artikel für "Spar"', 
      'system'
    );
  }

  checkContextSources(): void {
    const aiContext = this.aiService.getConversationContext();
    const chatContext = this.chatPersistence.getConversationContext();
    const status = this.getConversationStatus();
    
    const report = `🔍 **Kontext-Bericht:**\n\n` +
      `**AI Service:**\n` +
      `- Waiting: ${!!aiContext.waitingForArticles}\n` +
      `- List: ${aiContext.waitingForArticles?.listName || 'Keine'}\n` +
      `- Last Action: ${aiContext.lastAction?.listName || 'Keine'}\n\n` +
      `**Chat Persistence:**\n` +
      `- Waiting: ${!!chatContext?.waitingForArticles}\n` +
      `- List: ${chatContext?.waitingForArticles?.listName || 'Keine'}\n` +
      `- Last Action: ${chatContext?.lastAction?.listName || 'Keine'}\n\n` +
      `**Status:** ${status}`;
    
    this.chatPersistence.addMessage(report, 'system');
  }

  testRecipeWithContext(): void {
    this.forceTestContext();
    setTimeout(() => {
      this.sendQuickMessage('Rezept: Milch, Brot, Käse');
    }, 1000);
  }

  testSkipFunctionality(): void {
    console.log('🧪 TESTING SKIP FUNCTIONALITY');
    
    const testOptions: any[] = [
      {
        id: 'existing_1',
        displayName: 'Milch (Ja! Vollmilch)',
        type: 'existing' as const,
        confidence: 0.9,
        icon: '🥛'
      },
      {
        id: 'new_1',
        displayName: 'Neuen Artikel "Milch" erstellen',
        type: 'new' as const,
        confidence: 1.0,
        icon: '✨'
      },
      {
        id: 'skip_item',
        displayName: '"Milch" überspringen',
        type: 'skip' as const,
        confidence: 1.0,
        icon: '⏭️',
        skipReason: 'Bereits zu Hause vorhanden'
      }
    ];
    
    const testPendingAction: any = {
      type: 'add_item' as const,
      itemName: 'Milch',
      originalInput: 'Rezept: Milch, Brot, Käse',
      isFromRecipe: true,
      isMultiItemSequential: true,
      currentItemIndex: 0,
      allItems: ['Milch', 'Brot', 'Käse'],
      conversationListId: 'test-list-123'
    };
    
    this.chatPersistence.setDisambiguation({
      message: '🍳 Zutat 1/3: "Milch"\n\nIch habe ähnliche Artikel gefunden. Welchen möchtest du verwenden?\n\n⏭️ Du kannst Zutaten überspringen, die du bereits hast.',
      options: testOptions,
      pendingAction: testPendingAction
    });
    
    this.chatPersistence.addMessage('🧪 Test-Disambiguation mit Skip-Option erstellt', 'system');
  }

  clearAllContexts(): void {
    this.aiService.clearConversationContext();
    this.chatPersistence.clearConversationContext();
    this.chatPersistence.addMessage('🧹 Alle Kontexte gelöscht', 'system');
  }

  // Make Math available in template
  Math = Math;
}