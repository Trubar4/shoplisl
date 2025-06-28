// src/app/shared/components/voice-ai-assistant/voice-ai-assistant.component.ts
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

// Application services - Import with explicit types
import { 
  AIService, 
  AIExecutionResult, 
  DisambiguationOption,
  PendingAction,
  MultiItemPendingAction,
  isMultiItemPendingAction
} from '../../../core/services/ai';
import { ChatPersistenceService } from '../../../core/services/chat-persistence.service';
import { DepartmentService } from '../../../core/services/department.service';

// Interfaces
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
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatToolbarModule,
    MatDialogModule,
    MatTooltipModule,
    MatChipsModule
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
  // OBSERVABLE DATA STREAMS
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
  // NEW: INPUT SOURCE TRACKING & AUDIO FEEDBACK
  // ========================================
  private lastInputSource: 'voice' | 'text' = 'text';
  private shouldProvideAudioFeedback = false;
  
  // ========================================
  // SPEECH RECOGNITION & SYNTHESIS
  // ========================================
  private recognition: any;
  private synthesis: SpeechSynthesis;
  
  // ========================================
  // LIFECYCLE MANAGEMENT
  // ========================================
  private destroy$ = new Subject<void>();

  constructor(
    public aiService: AIService,  // ✅ PUBLIC - template can access
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
    
    // ENHANCED: Check for restored conversation context
    setTimeout(() => {
      const context = this.chatPersistence.getConversationContext();
      if (context?.waitingForArticles) {
        console.log('🔄 Restored conversation context for:', context.waitingForArticles.listName);
        // Show restored conversation state
        this.chatPersistence.addMessage(
          `🔄 Unterhaltung wiederhergestellt: Warte auf Artikel für "${context.waitingForArticles.listName}"`, 
          'system'
        );
      }
    }, 500);
    
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

  // ========================================
  // ENHANCED MESSAGE HANDLING WITH CONVERSATION CONTEXT
  // ========================================
  async sendMessage(): Promise<void> {
    if (!this.currentMessage.trim() || this.isProcessing) return;

    const userMessage = this.currentMessage.trim();
    
    console.log('💬 SEND MESSAGE CALLED');
    console.log('💬 USER MESSAGE:', userMessage);
    console.log('💬 INPUT SOURCE:', this.lastInputSource);
    console.log('💬 SHOULD PROVIDE AUDIO:', this.shouldProvideAudioFeedback);
    
    // Clear any existing disambiguation
    this.chatPersistence.setDisambiguation(null);
    
    this.chatPersistence.addMessage(userMessage, 'user');
    this.currentMessage = '';
    this.isProcessing = true;

    try {
      console.log('💬 CALLING AI SERVICE WITH:', userMessage);
      
      // ENHANCED: Check for continuation keywords first
      if (this.checkForContinuationKeywords(userMessage)) {
        console.log('💬 Continuation keyword detected');
        const result = await this.handleContinuationKeywords(userMessage);
        await this.handleAIResult(result);
        return;
      }
      
      // CRITICAL: Check for COMMANDS first, BEFORE conversation context
      const lowerInput = userMessage.toLowerCase().trim();
      
      // 1. Handle system commands (bypass conversation)
      if (lowerInput.includes('hilfe') || 
          lowerInput.includes('help') ||
          lowerInput.includes('test') ||
          lowerInput.includes('api key') ||
          lowerInput.includes('zeige liste')) {
        console.log('💬 System command detected - bypassing conversation');
        const result = await this.aiService.executeCommand(userMessage);
        await this.handleAIResult(result);
        return;
      }
      
      // 2. Handle list creation commands (bypass conversation)
      if (lowerInput.includes('erstelle') && lowerInput.includes('liste')) {
        console.log('💬 List creation command detected - bypassing conversation');
        // Clear any existing conversation context first
        this.chatPersistence.clearConversationContext();
        
        const result = await this.aiService.executeCommand(userMessage);
        await this.handleAIResult(result);
        return;
      }
      
      // 3. Handle explicit "Füge ... hinzu" commands (bypass conversation)
      if (lowerInput.includes('füge') && lowerInput.includes('hinzu')) {
        console.log('💬 Explicit add command detected - bypassing conversation');
        const result = await this.aiService.executeCommand(userMessage);
        await this.handleAIResult(result);
        return;
      }
      
      // 4. NOW check for conversation context (only for simple inputs)
      const isInConversation = this.isInActiveConversation();
      console.log('💬 In active conversation:', isInConversation);
      
      if (isInConversation) {
        const targetList = this.chatPersistence.getCurrentTargetList();
        if (targetList) {
          console.log('💬 Processing in conversation for list:', targetList.listName);
          
          // Check for conversation end
          if (lowerInput === 'nein' || lowerInput === 'fertig' || 
              lowerInput === 'stop' || lowerInput === 'ende' ||
              lowerInput === 'nein danke' || lowerInput === 'nicht mehr') {
            
            this.chatPersistence.clearConversationContext();
            this.chatPersistence.addMessage('👍 Fertig! Du kannst jederzeit neue Befehle eingeben.', 'assistant');
            this.isProcessing = false;
            return;
          }
          
          // CRITICAL: Process as article for current list (only for simple inputs)
          const enhancedInput = `Füge ${userMessage} zu ${targetList.listName} hinzu`;
          console.log('💬 Enhanced input for conversation:', enhancedInput);
          
          const result = await this.aiService.executeCommand(enhancedInput);
          
          // FORCE conversation context if not present
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
            result.followUpPrompt = result.followUpPrompt || 
              `Möchtest du noch weitere Artikel zu "${targetList.listName}" hinzufügen?`;
          }
          
          await this.handleAIResult(result);
          return;
        }
      }
      
      // 5. Regular processing (no conversation context)
      console.log('💬 Regular command processing');
      const startTime = Date.now();
      const result = await this.aiService.executeCommand(userMessage);
      const endTime = Date.now();
      
      console.log('💬 AI SERVICE COMPLETED IN:', endTime - startTime, 'ms');
      console.log('💬 AI SERVICE RESULT:', result);
      
      await this.handleAIResult(result);
      
    } catch (error) {
      console.error('💬 AI ERROR:', error);
      this.chatPersistence.addMessage(
        `❌ Entschuldigung, ein Fehler ist aufgetreten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}\n\n💡 Versuche es mit:\n• "Hilfe" für verfügbare Befehle\n• "Test" für System-Status`, 
        'error'
      );
    } finally {
      this.isProcessing = false;
      // Reset input source for next input
      this.lastInputSource = 'text';
      this.shouldProvideAudioFeedback = false;
      this.scrollToBottom();
    }
  }

  // ========================================
  // NEW: CONTINUATION KEYWORD HANDLING
  // ========================================

  /**
   * Check for continuation keywords
   */
  private checkForContinuationKeywords(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    const continuationKeywords = ['und', 'weiters', 'außerdem', 'zusätzlich', 'noch'];
    
    return continuationKeywords.some(keyword => 
      lowerInput.startsWith(keyword + ' ') || 
      lowerInput === keyword
    );
  }

  /**
   * Handle continuation keywords
   */
  private async handleContinuationKeywords(input: string): Promise<AIExecutionResult> {
    const context = this.chatPersistence.getConversationContext();
    
    // Check if we have a recent list action to continue with
    if (context?.lastAction && context.lastAction.listId) {
      const timeSince = Date.now() - context.lastAction.timestamp.getTime();
      const maxAge = 10 * 60 * 1000; // 10 minutes
      
      if (timeSince < maxAge) {
        // Extract the actual items after the continuation keyword
        const lowerInput = input.toLowerCase().trim();
        let itemsText = input;
        
        // Remove continuation keywords
        const continuationKeywords = ['und', 'weiters', 'außerdem', 'zusätzlich', 'noch'];
        for (const keyword of continuationKeywords) {
          if (lowerInput.startsWith(keyword + ' ')) {
            itemsText = input.substring(keyword.length + 1).trim();
            break;
          } else if (lowerInput === keyword) {
            // Just the keyword - ask what to add
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
          // Set conversation context for the target list
          this.chatPersistence.setConversationContext({
            lastAction: context.lastAction,
            waitingForArticles: {
              listId: context.lastAction.listId,
              listName: context.lastAction.listName,
              prompt: 'Continuation mode'
            }
          });
          
          // Process as contextual article addition
          const enhancedInput = `Füge ${itemsText} zu ${context.lastAction.listName} hinzu`;
          return await this.aiService.executeCommand(enhancedInput);
        }
      }
    }
    
    // No valid context for continuation
    return {
      success: false,
      message: '💡 Keine kürzliche Liste gefunden zum Fortsetzen.\n\nVerwende Fortsetzungs-Wörter wie "und" oder "weiters" nur nach dem Hinzufügen von Artikeln zu einer Liste.\n\nBeispiel:\n1. "Füge Milch zu Spar hinzu"\n2. "Und Brot" (fügt Brot zur selben Liste hinzu)'
    };
  }

  // ========================================
  // ENHANCED INPUT SOURCE TRACKING
  // ========================================

  /**
   * Handle text input (reset audio feedback)
   */
  onTextInput(): void {
    this.lastInputSource = 'text';
    this.shouldProvideAudioFeedback = false;
  }

  sendQuickMessage(message: string): void {
    this.chatPersistence.setDisambiguation(null);
    this.currentMessage = message;
    this.sendMessage();
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

    // ENHANCED: Force conversation context for list creation
    if (result.success && result.listId && result.message.includes('Liste') && result.message.includes('erstellt')) {
      console.log('🤖 DETECTED LIST CREATION - FORCING CONVERSATION CONTEXT');
      
      // Extract list name from message
      const listNameMatch = result.message.match(/Liste "([^"]+)" wurde erstellt/);
      const listName = listNameMatch ? listNameMatch[1] : 'Neue Liste';
      
      if (!result.conversationContext) {
        result.conversationContext = {
          lastAction: {
            type: 'list_created',
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
      }
      
      if (!result.followUpPrompt) {
        result.followUpPrompt = `Möchtest du jetzt Artikel zu "${listName}" hinzufügen?`;
      }
      
      console.log('🤖 FORCED conversation context:', result.conversationContext);
      console.log('🤖 FORCED follow-up prompt:', result.followUpPrompt);
    }

    // CRITICAL: Always update conversation context first
    if (result.conversationContext) {
      console.log('🤖 UPDATING CONVERSATION CONTEXT');
      this.chatPersistence.setConversationContext(result.conversationContext);
      
      // Also sync with AI service if needed
      this.chatPersistence.synchronizeWithAIService(result.conversationContext);
    }

    // Handle follow-up prompts BEFORE any other action
    if (result.success && result.followUpPrompt) {
      console.log('🤖 ADDING FOLLOW-UP PROMPT:', result.followUpPrompt);
      setTimeout(() => {
        this.chatPersistence.addMessage(result.followUpPrompt!, 'system');
        this.scrollToBottom();
      }, 1000);
    }

    // Handle successful actions (with better conversation awareness)
    if (result.success && result.listId) {
      // DELAY to let context update first
      setTimeout(() => {
        this.handleSuccessfulAction(result);
      }, 100);
    }

    // Handle suggestions
    if (result.suggestedAction === 'CREATE_LIST' && result.suggestedData) {
      this.handleSuggestion(result);
    }
  }

  private handleDisambiguation(result: AIExecutionResult): void {
    if (!result.disambiguationOptions || !result.pendingAction) {
      console.error('Invalid disambiguation data:', result);
      return;
    }

    // Type assertion to ensure compatibility with ChatPersistenceService
    const pendingAction = result.pendingAction as any;
    
    this.chatPersistence.setDisambiguation({
      message: result.message,
      options: result.disambiguationOptions,
      pendingAction: pendingAction
    });
  }

  private handleSuccessfulAction(result: AIExecutionResult): void {
    console.log('🎯 HANDLE SUCCESSFUL ACTION:', result);
    console.log('🎯 Should provide audio feedback:', this.shouldProvideAudioFeedback);
    
    // ENHANCED: Only speak if input came from voice
    if (this.shouldProvideAudioFeedback) {
      const messageToSpeak = result.message.split('\n')[0]
        .replace(/[✅❌🎯💡📝🛒🔑⚖️🎨📋]/g, '')
        .trim();
      
      if (messageToSpeak) {
        console.log('🔊 Providing audio feedback for voice input');
        this.speak(messageToSpeak);
      }
    } else {
      console.log('🔇 Skipping audio feedback for text input');
    }
    
    // ULTRA-STRICT: Check every possible conversation indicator
    const hasFollowUp = !!result.followUpPrompt;
    const resultHasConversation = !!result.conversationContext?.waitingForArticles;
    const persistenceHasConversation = this.chatPersistence.isWaitingForArticles();
    const messageHasConversation = result.message.includes('Möchtest du') || 
                                  result.message.includes('weitere Artikel') ||
                                  result.message.includes('hinzufügen?') ||
                                  result.message.includes('erstellt');
    const isListCreation = result.message.includes('Liste') && result.message.includes('erstellt');
    const isArticleAddition = result.message.includes('hinzugefügt');
    
    // CRITICAL: If it's list creation or article addition, ALWAYS stay for conversation
    const shouldStayInConversation = hasFollowUp || 
                                    resultHasConversation || 
                                    persistenceHasConversation ||
                                    messageHasConversation ||
                                    isListCreation ||
                                    isArticleAddition;
    
    console.log('🎯 NAVIGATION DECISION DETAILS:');
    console.log('🎯 - hasFollowUp:', hasFollowUp);
    console.log('🎯 - resultHasConversation:', resultHasConversation);
    console.log('🎯 - persistenceHasConversation:', persistenceHasConversation);
    console.log('🎯 - messageHasConversation:', messageHasConversation);
    console.log('🎯 - isListCreation:', isListCreation);
    console.log('🎯 - isArticleAddition:', isArticleAddition);
    console.log('🎯 - FINAL shouldStayInConversation:', shouldStayInConversation);
    
    // CRITICAL: Always ensure context is set
    if (result.conversationContext) {
      this.chatPersistence.setConversationContext(result.conversationContext);
    }
    
    // Stay in conversation mode - no navigation for now
    console.log('🎯 STAYING IN CONVERSATION MODE');
  }

  private handleSuggestion(result: AIExecutionResult): void {
    this.chatPersistence.addMessage(
      `Tipp: Sage "Erstelle Liste ${result.suggestedData!.listName}" um sie anzulegen.`, 
      'system'
    );
  }

  // ========================================
  // ENHANCED CONVERSATION CONTEXT METHODS
  // ========================================

  /**
   * Enhanced conversation status with more details
   */
  getEnhancedConversationStatus(): {
    isActive: boolean;
    listName?: string;
    mode: 'waiting' | 'recent' | 'none';
    timeInfo?: string;
  } {
    // Check multiple sources for conversation context
    let context = this.aiService.getConversationContext();
    const persistenceContext = this.chatPersistence.getConversationContext();
    
    // Use persistence context if AI service context is empty
    if (!context.waitingForArticles && !context.lastAction && persistenceContext) {
      context = persistenceContext;
    }
    
    if (context.waitingForArticles) {
      return {
        isActive: true,
        listName: context.waitingForArticles.listName,
        mode: 'waiting'
      };
    }
    
    if (context.lastAction) {
      const timeSince = Date.now() - context.lastAction.timestamp.getTime();
      const minutes = Math.floor(timeSince / 60000);
      
      // Consider recent if less than 10 minutes and less than 30 minutes for display
      if (timeSince < 10 * 60 * 1000) { // 10 minutes - can use continuation
        return {
          isActive: true,
          listName: context.lastAction.listName,
          mode: 'recent',
          timeInfo: `vor ${minutes}min`
        };
      } else if (timeSince < 30 * 60 * 1000) { // 30 minutes - show info but not active
        return {
          isActive: false,
          listName: context.lastAction.listName,
          mode: 'recent',
          timeInfo: `vor ${minutes}min`
        };
      }
    }
    
    return {
      isActive: false,
      mode: 'none'
    };
  }

  getConversationStatus(): string {
    const status = this.getEnhancedConversationStatus();
    
    if (status.mode === 'waiting' && status.listName) {
      return `Warte auf Artikel für "${status.listName}"`;
    }
    
    if (status.mode === 'recent' && status.listName && status.timeInfo) {
      return `"${status.listName}" ${status.timeInfo} - Fortsetzung mit "und" möglich`;
    }
    
    return 'Keine aktive Unterhaltung';
  }
  
  finishAddingArticles(): void {
    const context = this.aiService.getConversationContext();
    const persistenceContext = this.chatPersistence.getConversationContext();
    
    if (context.waitingForArticles || persistenceContext?.waitingForArticles) {
      console.log('🗣️ User manually finished adding articles');
      
      // Clear both contexts
      this.chatPersistence.clearConversationContext();
      
      // Send "nein" to trigger proper conversation end
      this.sendQuickMessage('nein');
    }
  }

  /**
   * Check if continuation keywords can be used
   */
  canUseContinuation(): boolean {
    const status = this.getEnhancedConversationStatus();
    return status.isActive && status.mode === 'recent';
  }

  /**
   * Get continuation examples based on current context
   */
  getContinuationExamples(): string[] {
    const status = this.getEnhancedConversationStatus();
    
    if (status.isActive && status.listName) {
      return [
        `und Milch`,
        `weiters Brot`,
        `außerdem 2kg Bananen`,
        `noch Käse`
      ];
    }
    
    return [
      'und [Artikel]',
      'weiters [Artikel]',
      'außerdem [Artikel]',
      'noch [Artikel]'
    ];
  }

  // ========================================
  // ENHANCED INPUT HELPER METHODS (PUBLIC FOR TEMPLATE)
  // ========================================

  /**
   * Get dynamic input placeholder based on conversation state
   */
  getInputPlaceholder(): string {
    if (this.isInActiveConversation()) {
      const context = this.chatPersistence.getConversationContext();
      if (context?.waitingForArticles) {
        return `Artikel für "${context.waitingForArticles.listName}" eingeben...`;
      }
      return 'Artikel eingeben oder "Fertig" sagen...';
    }
    
    return 'z.B. "Füge 2kg Bananen zu Spar hinzu" oder "Erstelle Liste REWE"';
  }

  /**
   * Get dynamic voice button tooltip
   */
  getVoiceTooltip(): string {
    if (this.isRecording) {
      return 'Aufnahme stoppen';
    }
    
    if (this.isInActiveConversation()) {
      return 'Artikel per Sprache hinzufügen';
    }
    
    return 'Sprachbefehl aufnehmen';
  }

  /**
   * Get dynamic send button tooltip
   */
  getSendTooltip(): string {
    if (this.isInActiveConversation()) {
      return 'Artikel zur Liste hinzufügen';
    }
    
    return 'Befehl senden';
  }

  // ========================================
  // ENHANCED DISAMBIGUATION METHODS
  // ========================================

  /**
   * Check if current disambiguation is for list selection
   */
  isListSelection(pendingAction: PendingAction | MultiItemPendingAction | null | undefined): boolean {
    if (!pendingAction) return false;
    return pendingAction.type === 'select_list';
  }

  /**
   * Get disambiguation header color based on type
   */
  getDisambiguationHeaderColor(disambiguation: any): string {
    if (this.isListSelection(disambiguation.pendingAction)) {
      return '#2196f3'; // Blue for list selection
    }
    return '#ff9800'; // Orange for article disambiguation
  }

  /**
   * Get disambiguation header icon based on type
   */
  getDisambiguationHeaderIcon(disambiguation: any): string {
    if (this.isListSelection(disambiguation.pendingAction)) {
      return 'playlist_add'; // List selection icon
    }
    return 'help_outline'; // Article disambiguation icon
  }

  /**
   * Get disambiguation header title based on type
   */
  getDisambiguationHeaderTitle(disambiguation: any): string {
    if (this.isListSelection(disambiguation.pendingAction)) {
      return 'Liste auswählen';
    }
    return 'Artikel auswählen';
  }

  /**
   * Enhanced disambiguation option selection
   */
  selectDisambiguationOption(option: DisambiguationOption): void {
    console.log('🎯 DISAMBIGUATION OPTION SELECTED:', option);
    
    const disambiguation = this.chatPersistence.getDisambiguation();
    if (!disambiguation) {
      console.error('🎯 No disambiguation available!');
      return;
    }

    const pendingAction = disambiguation.pendingAction;
    
    // Clear disambiguation immediately
    this.chatPersistence.setDisambiguation(null);
    
    // Generate choice text
    const choiceText = this.generateChoiceText(option, pendingAction);
    this.chatPersistence.addMessage(choiceText, 'user');
    this.isProcessing = true;

    // Process with enhanced conversation preservation
    this.aiService.handleDisambiguationChoice(pendingAction, option)
      .then((result: AIExecutionResult) => {
        console.log('🎯 DISAMBIGUATION RESULT:', result);
        
        // CRITICAL: Force conversation context if we were in conversation
        if (!result.conversationContext && this.isInActiveConversation()) {
          console.log('🎯 FORCING conversation context preservation');
          const currentContext = this.chatPersistence.getConversationContext() || 
                                this.aiService.getConversationContext();
          if (currentContext.waitingForArticles) {
            result.conversationContext = currentContext;
            result.followUpPrompt = result.followUpPrompt || 
              'Möchtest du noch weitere Artikel hinzufügen?';
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

  /**
   * Generate appropriate choice text for disambiguation
   */
  private generateChoiceText(option: DisambiguationOption, pendingAction: any): string {
    // Handle sequential multi-item disambiguation
    if (pendingAction.isMultiItemSequential) {
      const currentIndex = pendingAction.currentItemIndex;
      const totalItems = pendingAction.allItems.length;
      
      if (pendingAction.type === 'select_list') {
        return `Liste gewählt: ${option.displayName}`;
      } else {
        if (option.type === 'existing') {
          return `Artikel ${currentIndex + 1}/${totalItems}: ${option.displayName} (vorhandener Artikel)`;
        } else {
          return `Artikel ${currentIndex + 1}/${totalItems}: ${pendingAction.itemName} (neu erstellen)`;
        }
      }
    }
    
    // Handle regular multi-item disambiguation
    if ('items' in pendingAction && 'currentItemIndex' in pendingAction) {
      const items = pendingAction.items;
      const currentIndex = pendingAction.currentItemIndex;
      
      if (pendingAction.type === 'select_list') {
        return `Liste gewählt: ${option.displayName}`;
      } else if (Array.isArray(items) && typeof currentIndex === 'number' && currentIndex < items.length) {
        const currentItem = items[currentIndex];
        if (option.type === 'existing') {
          return `Artikel ${currentIndex + 1}/${items.length}: ${option.displayName} (vorhandener Artikel)`;
        } else if (currentItem && currentItem.itemName) {
          return `Artikel ${currentIndex + 1}/${items.length}: ${currentItem.itemName} (neu erstellen)`;
        } else {
          return `Neuen Artikel erstellen: ${option.displayName}`;
        }
      } else {
        return option.type === 'existing' ? 
          `Vorhandener Artikel: ${option.displayName}` : 
          `Neuen Artikel erstellen: ${option.displayName}`;
      }
    } else {
      // Handle single action
      if (pendingAction.type === 'select_list') {
        return `Liste gewählt: ${option.displayName}`;
      } else {
        if (option.type === 'existing') {
          return `Vorhandener Artikel: ${option.displayName}`;
        } else {
          return `Neuen Artikel erstellen: ${option.displayName}`;
        }
      }
    }
  }

  /**
   * Get action description for pending action - SAFE VERSION
   */
  getActionDescription(pendingAction: PendingAction | MultiItemPendingAction | null | undefined): string {
    if (!pendingAction) return 'Unbekannte Aktion';
    
    // Check for multi-item properties and access them directly
    if ('items' in pendingAction && 'currentItemIndex' in pendingAction) {
      const items = (pendingAction as any).items;
      const currentIndex = (pendingAction as any).currentItemIndex;
      
      if (Array.isArray(items) && typeof currentIndex === 'number' && currentIndex < items.length) {
        const currentItem = items[currentIndex];
        if (currentItem && currentItem.itemName) {
          return `Artikel ${currentIndex + 1}/${items.length}: "${currentItem.itemName}" verarbeiten`;
        }
      }
      return `Mehrere Artikel verarbeiten`;
    } else {
      // Handle as single action
      switch (pendingAction.type) {
        case 'add_item':
          return (pendingAction as any).listName ? 
            `Hinzufügen zu "${(pendingAction as any).listName}"` : 
            'Hinzufügen zur Liste';
        case 'create_list':
          return `Neue Liste "${(pendingAction as any).listName}" erstellen`;
        case 'select_list':
          return 'Zur ausgewählten Liste hinzufügen';
        default:
          return 'Unbekannte Aktion';
      }
    }
  }

  /**
   * Get default icon for disambiguation option
   */
  getDefaultIcon(option: DisambiguationOption): string {
    if (option.type === 'new') {
      return '✨'; // New item icon
    }
    return option.icon || '📦'; // Default icon
  }

  /**
   * Get list color for list selection options
   */
  getListColor(option: DisambiguationOption): string {
    return '#2196f3'; // Default blue
  }

  /**
   * Get action hint text for disambiguation options - SAFE VERSION
   */
  getActionHint(option: DisambiguationOption, pendingAction: PendingAction | MultiItemPendingAction | null | undefined): string {
    if (!pendingAction) return 'Unbekannte Aktion';
    
    const isListSelection = this.isListSelection(pendingAction);
    
    if (isListSelection) {
      // Check for multi-item safely
      if ('items' in pendingAction) {
        const items = (pendingAction as any).items;
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

  /**
   * Cancel disambiguation and clear pending action
   */
  cancelDisambiguation(): void {
    this.chatPersistence.setDisambiguation(null);
    this.chatPersistence.addMessage('Aktion abgebrochen.', 'system');
  }

  // ========================================
  // VOICE INPUT FUNCTIONALITY
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
      
      // CRITICAL: Mark this as voice input
      this.lastInputSource = 'voice';
      this.shouldProvideAudioFeedback = true;
      
      console.log('🎤 Voice input received:', transcript);
      console.log('🎤 Audio feedback will be provided');
      
      // Automatically send the voice message
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

  stopRecording(): void {
    if (this.recognition && this.isRecording) {
      this.recognition.stop();
    }
    this.isRecording = false;
  }

  // ========================================
  // TEXT-TO-SPEECH
  // ========================================
  private speak(text: string): void {
    if (!this.synthesis) return;
    
    console.log('🔊 SPEAK METHOD CALLED');
    console.log('🔊 ORIGINAL TEXT:', text);
    console.log('🔊 IS CURRENTLY SPEAKING:', this.isSpeaking);
    
    // Prevent multiple speech instances
    if (this.isSpeaking) {
      console.log('🔊 ALREADY SPEAKING - IGNORING NEW REQUEST');
      return;
    }
    
    this.synthesis.cancel();
    this.isSpeaking = true;
    
    // Clean the text before speaking
    const cleanText = text.split('\n')[0]
      .replace(/[✅❌🎯💡📝🛒🔑⚖️🎨📋]/g, '') // Remove emojis
      .replace(/^\s*/, '') // Remove leading whitespace
      .trim();
    
    console.log('🔊 CLEANED TEXT TO SPEAK:', cleanText);
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'de-DE';
    utterance.rate = 0.9;
    utterance.volume = 0.8;
    
    // Add comprehensive event listeners
    utterance.onstart = () => {
      console.log('🔊 SPEECH STARTED:', cleanText);
    };
    
    utterance.onend = () => {
      console.log('🔊 SPEECH ENDED');
      this.isSpeaking = false;
    };
    
    utterance.onerror = (event) => {
      console.error('🔊 SPEECH ERROR:', event);
      this.isSpeaking = false;
    };
    
    utterance.onpause = () => {
      console.log('🔊 SPEECH PAUSED');
    };
    
    utterance.onresume = () => {
      console.log('🔊 SPEECH RESUMED');
    };
    
    this.synthesis.speak(utterance);
  }

  // ========================================
  // QUICK COMMANDS & HELP
  // ========================================

  showLists(): void {
    this.sendQuickMessage('Zeige alle Listen');
  }

  createNewList(): void {
    this.currentMessage = 'Erstelle Liste ';
    // Focus input for user to complete the command
    setTimeout(() => {
      const inputElement = document.querySelector('input[matInput]') as HTMLInputElement;
      if (inputElement) {
        inputElement.focus();
        inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length);
      }
    }, 100);
  }

  /**
   * Enhanced help with conversation context awareness
   */
  showContextualHelp(): void {
    // Check both AI service and chat persistence for context
    let context = this.aiService.getConversationContext();
    const persistenceContext = this.chatPersistence.getConversationContext();
    
    if (!context.waitingForArticles && persistenceContext?.waitingForArticles) {
      context = persistenceContext;
    }
    
    if (context.waitingForArticles) {
      // Show context-specific help
      const helpMessage = `🗣️ Du befindest dich gerade in einer Unterhaltung!\n\n` +
        `📝 Ich warte darauf, dass du Artikel zu "${context.waitingForArticles.listName}" hinzufügst.\n\n` +
        `💡 Du kannst einfach sagen:\n` +
        `• "Milch" - Einfacher Artikelname\n` +
        `• "2kg Bananen" - Mit Menge\n` +
        `• "Brot, Wasser" - Mehrere Artikel gleichzeitig\n` +
        `• "Joghurt Menge 500g" - Mit Menge-Syntax\n\n` +
        `🔄 Fortsetzungs-Funktionen:\n` +
        `• "und [Artikel]" - Fügt zur zuletzt verwendeten Liste hinzu\n` +
        `• "weiters [Artikel]" - Österreichische Variante\n\n` +
        `🛑 Oder sage "Nein" / "Fertig" um die Unterhaltung zu beenden.\n\n` +
        `📋 Normale Befehle funktionieren auch weiterhin.`;
      
      this.chatPersistence.addMessage(helpMessage, 'assistant');
      return;
    }
    
    // Show normal help with continuation info
    const hasApiKey = this.aiService.hasApiKey();
    const summary = this.chatPersistence.getChatSummary();
    
    let helpMessage = '🤖 Shoplisl AI Assistant\n\n';
    
    if (hasApiKey) {
      helpMessage += '✅ Intelligente Features aktiv\n\n';
      helpMessage += '📝 Verfügbare Befehle:\n\n';
      helpMessage += '• "Füge [Artikel] hinzu"\n  → Fragt nach der Liste wenn nicht angegeben\n\n';
      helpMessage += '• "Füge [Artikel] zu [Liste] hinzu"\n  → Fügt direkt zur spezifizierten Liste hinzu\n\n';
      helpMessage += '⚖️ MENGEN-SYNTAX:\n';
      helpMessage += '• "Füge 2kg Bananen hinzu"\n';
      helpMessage += '• "Füge Schokolade Menge 2 Stück hinzu"\n\n';
      helpMessage += '🎯 MEHRERE ARTIKEL GLEICHZEITIG:\n';
      helpMessage += '• "Füge Bananen, Würste, Milch hinzu"\n';
      helpMessage += '• "Brot, Wasser" (im Unterhaltungsmodus)\n\n';
      helpMessage += '🔄 FORTSETZUNGS-FUNKTIONEN:\n';
      helpMessage += '• "und [Artikel]" - Fügt zur zuletzt verwendeten Liste hinzu\n';
      helpMessage += '• "weiters [Artikel]" - Österreichische Variante\n';
      helpMessage += '• Funktioniert 10 Minuten nach letzter Artikel-Hinzufügung\n\n';
      helpMessage += '• "Erstelle Liste [Name]"\n  → Neue Einkaufsliste\n\n';
      helpMessage += '🗣️ UNTERHALTUNGS-MODUS:\n';
      helpMessage += '• Nach dem Erstellen einer Liste oder Hinzufügen von Artikeln wirst du gefragt, ob du weitere Artikel hinzufügen möchtest\n';
      helpMessage += '• Du kannst dann einfach Artikelnamen eingeben ohne "Füge" und "hinzu"\n';
      helpMessage += '• Auch mehrere Artikel gleichzeitig: "Brot, Milch, Käse"\n';
      helpMessage += '• Sage "Nein" oder "Fertig" um die Unterhaltung zu beenden\n\n';
      helpMessage += '🔊 SPRACH-FEEDBACK:\n';
      helpMessage += '• Audio-Antworten nur bei Sprach-Eingabe\n';
      helpMessage += '• Text-Eingaben bekommen stille Antworten\n\n';
    } else {
      helpMessage += '⚙️ Basis-Funktionen verfügbar\n\n';
      helpMessage += '💡 Für intelligente Features:\n';
      helpMessage += '"set api key: gsk_YOUR_KEY_HERE"\n\n';
      helpMessage += '📝 Basis-Befehle:\n\n';
      helpMessage += '• "Füge [Artikel] hinzu" - Fragt nach Liste\n';
      helpMessage += '• "Füge [Artikel] zu [Liste] hinzu"\n';
      helpMessage += '• "Erstelle Liste [Name]"\n';
      helpMessage += '• "Zeige Listen" - Alle Listen anzeigen\n\n';
    }
    
    helpMessage += `📊 Chat Status: ${summary.messageCount} Nachrichten`;
    
    this.chatPersistence.addMessage(helpMessage, 'assistant');
  }

  // ========================================
  // ENHANCED QUICK ACTIONS
  // ========================================

  /**
   * Quick continuation actions
   */
  quickContinuation(keyword: string): void {
    const examples = ['Milch', 'Brot', '2kg Bananen', 'Käse'];
    const randomItem = examples[Math.floor(Math.random() * examples.length)];
    this.sendQuickMessage(`${keyword} ${randomItem}`);
  }

  /**
   * Show continuation help
   */
  showContinuationHelp(): void {
    const helpMessage = '🔄 **Fortsetzungs-Funktionen:**\n\n' +
      'Du kannst "und", "weiters", "außerdem" oder "noch" verwenden, um weitere Artikel zur zuletzt verwendeten Liste hinzuzufügen.\n\n' +
      '**Beispiel:**\n' +
      '1. "Füge Milch zu Spar hinzu"\n' +
      '2. "Und Brot"\n' +
      '3. "Weiters Käse"\n\n' +
      '**Zeitlimit:** 10 Minuten nach letzter Aktion\n' +
      '**Unterstützt:** Mengen, mehrere Artikel';
    
    this.chatPersistence.addMessage(helpMessage, 'assistant');
  }

  // ========================================
  // PWA & VIEWPORT HANDLING
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

  // ========================================
  // UTILITY METHODS
  // ========================================
  
  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  getChatStats(): string {
    const summary = this.chatPersistence.getChatSummary();
    const hasApiKey = this.aiService.hasApiKey();
    const conversationStatus = this.getConversationStatus();
    
    let stats = `${summary.messageCount} Nachrichten`;
    
    if (summary.oldestMessage) {
      stats += ` seit ${summary.oldestMessage.toLocaleDateString('de-DE')}`;
    }
    
    stats += ` • ${hasApiKey ? '🔑 AI Features aktiv' : '⚙️ Settings für AI Features'}`;
    
    // Add conversation context if active
    const context = this.aiService.getConversationContext();
    const persistenceContext = this.chatPersistence.getConversationContext();
    
    if (context.waitingForArticles || context.lastAction || 
        persistenceContext?.waitingForArticles || persistenceContext?.lastAction) {
      stats += ` • 🗣️ ${conversationStatus}`;
    }
    
    return stats;
  }

  isInActiveConversation(): boolean {
    // Check multiple sources for active conversation
    const aiServiceContext = this.aiService.getConversationContext();
    const persistenceContext = this.chatPersistence.getConversationContext();
    
    const hasAiServiceConversation = !!aiServiceContext.waitingForArticles;
    const hasPersistenceConversation = !!persistenceContext?.waitingForArticles;
    
    console.log('🔍 Conversation check:');
    console.log('🔍 - AI Service waiting:', hasAiServiceConversation);
    console.log('🔍 - Persistence waiting:', hasPersistenceConversation);
    
    return hasAiServiceConversation || hasPersistenceConversation;
  }

  // ========================================
  // DEBUGGING & TESTING METHODS
  // ========================================

  /**
   * Debug conversation state
   */
  debugConversationState(): void {
    console.log('🔍 DETAILED CONVERSATION STATE:');
    
    const aiContext = this.aiService.getConversationContext();
    const persistenceContext = this.chatPersistence.getConversationContext();
    const enhancedStatus = this.getEnhancedConversationStatus();
    
    console.log('🔍 AI Service context:', aiContext);
    console.log('🔍 Persistence context:', persistenceContext);
    console.log('🔍 Enhanced status:', enhancedStatus);
    console.log('🔍 Can use continuation:', this.canUseContinuation());
    console.log('🔍 Continuation examples:', this.getContinuationExamples());
    
    // Also log to chat for user visibility
    const debugInfo = `🔍 **Debug Information:**\n\n` +
      `**AI Service:** ${aiContext.waitingForArticles ? 'Wartend' : 'Nicht aktiv'}\n` +
      `**Persistence:** ${persistenceContext?.waitingForArticles ? 'Wartend' : 'Nicht aktiv'}\n` +
      `**Enhanced Status:** ${enhancedStatus.mode} (${enhancedStatus.isActive ? 'aktiv' : 'inaktiv'})\n` +
      `**Continuation:** ${this.canUseContinuation() ? 'Verfügbar' : 'Nicht verfügbar'}\n` +
      `**Liste:** ${enhancedStatus.listName || 'Keine'}\n` +
      `**Zeit:** ${enhancedStatus.timeInfo || 'N/A'}`;
    
    this.chatPersistence.addMessage(debugInfo, 'system');
  }

  /**
   * Test different conversation scenarios
   */
  testConversationScenario(scenario: 'list-creation' | 'article-addition' | 'continuation' | 'clear'): void {
    console.log('🧪 TESTING SCENARIO:', scenario);
    
    switch (scenario) {
      case 'clear':
        this.chatPersistence.clearConversationContext();
        this.chatPersistence.addMessage('🧹 Kontext gelöscht', 'system');
        break;
        
      case 'list-creation':
        this.sendQuickMessage('Erstelle Liste TestListe');
        break;
        
      case 'article-addition':
        this.sendQuickMessage('Füge Milch zu TestListe hinzu');
        break;
        
      case 'continuation':
        // First ensure we have a context
        const testContext = {
          lastAction: {
            type: 'article_added' as const,
            listId: 'test-123',
            listName: 'TestListe',
            articleName: 'Milch',
            timestamp: new Date()
          }
        };
        this.aiService.setConversationContext(testContext);
        this.chatPersistence.addMessage('🧪 Test-Kontext gesetzt', 'system');
        
        setTimeout(() => {
          this.sendQuickMessage('und Brot');
        }, 1000);
      }
  }

  /**
   * Test continuation functionality
   */
  testContinuation(): void {
    const testContext = {
      lastAction: {
        type: 'article_added' as const,
        listId: 'test-123',
        listName: 'Spar',
        articleName: 'Milch',
        timestamp: new Date()
      }
    };
    
    this.aiService.setConversationContext(testContext); // ✅ CORRECT
    this.sendQuickMessage('und Brot');
  }

  /**
   * Test voice vs text input
   */
  testAudioFeedback(): void {
    // Simulate voice input
    this.lastInputSource = 'voice';
    this.shouldProvideAudioFeedback = true;
    this.sendQuickMessage('Füge Milch hinzu');
    
    // Reset for next test
    setTimeout(() => {
      this.lastInputSource = 'text';
      this.shouldProvideAudioFeedback = false;
      this.sendQuickMessage('Füge Brot hinzu');
    }, 3000);
  }

  testListCreation(): void {
    console.log('🧪 TESTING LIST CREATION');
    this.debugConversationState();
    
    // Clear any existing context first
    this.chatPersistence.clearConversationContext();
    console.log('🧪 Cleared context');
    
    // Test list creation
    this.sendQuickMessage('Erstelle Liste TestListe');
  }

  clearAllContext(): void {
    console.log('🧹 CLEARING ALL CONTEXT');
    this.chatPersistence.clearConversationContext();
    this.chatPersistence.clearMessages();
    this.chatPersistence.initializeIfEmpty();
    this.debugConversationState();
  }

  // ========================================
  // DISAMBIGUATION HELPER METHODS
  // ========================================

  getDepartmentName(departmentId?: string): string {
    if (!departmentId) return 'Unbekannt';
    return this.departmentService.getDepartmentName(departmentId, 'german');
  }

  getDepartmentIcon(departmentId?: string): string {
    if (!departmentId) return '📦';
    return this.departmentService.getDepartmentIconPath(departmentId);
  }

  getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return 'primary';
    if (confidence >= 0.6) return 'warn';
    return 'accent';
  }

  getConfidenceText(confidence: number): string {
    const percentage = Math.round(confidence * 100);
    if (percentage >= 90) return `${percentage}% - Exakte Übereinstimmung`;
    if (percentage >= 70) return `${percentage}% - Sehr ähnlich`;
    if (percentage >= 50) return `${percentage}% - Ähnlich`;
    return `${percentage}% - Entfernt ähnlich`;
  }

  /**
   * HELPER: Set conversation context after successful article addition
   */
  private setConversationContextAfterArticleAddition(listId: string, listName: string, articleName: string): void {
    console.log('🎯 Setting conversation context for continuation:', { listId, listName, articleName });
    
    const testContext = {
      lastAction: {
        type: 'article_added' as const,
        listId: 'test-123', 
        listName: 'TestListe',
        articleName: 'Milch',
        timestamp: new Date()
      },
      waitingForArticles: {
        listId: 'test-123',
        listName: 'TestListe', 
        prompt: 'Test'
      }
    };
    
    // Then use it:
    this.aiService.setConversationContext(testContext);
  }

  // ========================================
  // TEMPLATE HELPER PROPERTIES & METHODS
  // ========================================
  get aiServicePublic() {
    return this.aiService;
  }
  
  public trackByOptionId(index: number, option: any): string {
    return option.id || index.toString();
  }

  // Make Math available in template
  Math = Math;
}