// src/app/shared/components/voice-ai-assistant/voice-ai-assistant.component.ts - FIXED VERSION
import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Inject, PLATFORM_ID, AfterViewInit } from '@angular/core';
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
import { LoggerService } from '../../../core/services/logger.service';
import { environment } from '../../../../environments/environment';

// Application services
import {
  AIService,
  AIExecutionResult,
  PendingAction,
  MultiItemPendingAction,
  DisambiguationOption,
  ActionButton
} from '../../../core/services/ai';
import { ChatPersistenceService } from '../../../core/services/chat-persistence.service';
import { DepartmentService } from '../../../core/services/department.service';

// Voice assistant services
import { VoiceInputService } from './services/voice-input.service';
import { VoiceOutputService } from './services/voice-output.service';
import { ChatUIService } from './services/chat-ui.service';
import { DisambiguationUIService } from './services/disambiguation-ui.service';

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
export class VoiceAIAssistantComponent implements OnInit, OnDestroy, AfterViewInit {
  
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  
  // Observable streams
  messages$: Observable<ChatMessage[]>;
  disambiguation$: Observable<any>;
  
  // Component state
  currentMessage = '';
  isProcessing = false;
  private isProcessingMessage = false;
  currentActionButtons: ActionButton[] = [];

  // Input tracking & audio feedback
  private lastInputSource: 'voice' | 'text' = 'text';
  private shouldProvideAudioFeedback = false;
  
  // Lifecycle management
  private destroy$ = new Subject<void>();

  private _cachedActiveConversation: boolean = false;
  private _lastContextCheck: number = 0;
  private _lastLoggedState: boolean | null = null;
  private readonly CONTEXT_CACHE_DURATION = 500; // 500ms cache for conversation check
  private verboseLogging = false; // Set to true only when debugging
  private _cachedContext: ConversationContext = {};
  private _lastContextSync: number = 0;
  private readonly CONTEXT_SYNC_CACHE_DURATION = 1000; // 1 second cache for context sync


  constructor(
    public aiService: AIService,
    public chatPersistence: ChatPersistenceService,
    public departmentService: DepartmentService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Inject(PLATFORM_ID) private platformId: Object,
    private logger: LoggerService,
    public voiceInput: VoiceInputService,
    public voiceOutput: VoiceOutputService,
    public chatUI: ChatUIService,
    public disambiguationUI: DisambiguationUIService
  ) {
    this.messages$ = this.chatPersistence.messages$;
    this.disambiguation$ = this.chatPersistence.disambiguation$;
  }

  ngOnInit(): void {
    this.initializeChat();
    this.chatUI.initializePWAViewport();
    this.setupMessageScrolling();
    this.setupVoiceInputSubscriptions();
    this.checkRestoredContext();
    this.logChatStatus();

    // ADDED: Configure logger for less noise
    this.logger.disableTopic('context'); // Disable context logging by default

    // Enable context logging only when needed (for debugging)
    // this.logger.enableTopic('context'); // Uncomment for debugging

    setTimeout(() => this.chatUI.scrollToBottom(this.messagesContainer, true), 10);

    // Handle deep link parameters from Siri Shortcuts
    this.handleDeepLinkParameters();
  }

  /**
   * Set up voice input service subscriptions
   */
  private setupVoiceInputSubscriptions(): void {
    // Subscribe to voice results
    this.voiceInput.voiceResult$
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.currentMessage = result.transcript;
        this.lastInputSource = 'voice';
        this.shouldProvideAudioFeedback = true;
        console.log('🎤 Voice input received:', result.transcript);
        setTimeout(() => this.sendMessage(), 500);
      });

    // Subscribe to voice errors
    this.voiceInput.voiceError$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => {
        this.snackBar.open(error.message, 'OK', { duration: 3000 });
      });
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  ngAfterViewInit(): void {
    // Ensure scroll container is available and scroll to bottom
    setTimeout(() => {
      if (this.messagesContainer) {
        this.chatUI.scrollToBottom(this.messagesContainer, true);
      }
    }, 30);
  }

  onContentChange(): void {
    // Call this method whenever content dynamically changes
    this.chatUI.scrollToBottomDelayed(this.messagesContainer, 50);
  }

  // ========================================
  // INITIALIZATION - FIXED
  // ========================================

  private initializeChat(): void {
    this.chatPersistence.initializeWithContext();
    // FIXED: Ensure initial context sync
    this.syncContextBidirectional();
  }

  private setupMessageScrolling(): void {
    this.messages$.pipe(takeUntil(this.destroy$)).subscribe((messages) => {
      // Scroll whenever messages update
      this.chatUI.scrollToBottomDelayed(this.messagesContainer, 50);

      // Additional scroll for dynamic content
      this.chatUI.scrollToBottomDelayed(this.messagesContainer, 200);
    });
  }
  

  private checkRestoredContext(): void {
    setTimeout(() => {
      // FIXED: Check both sources and sync
      this.syncContextBidirectional();
      
      const context = this.chatPersistence.getConversationContext();
      if (context?.waitingForArticles) {
        console.log('🔄 Restored conversation context for:', context.waitingForArticles.listName);
      }
    }, 500);
  }

  private logChatStatus(): void {
    const summary = this.chatPersistence.getChatSummary();
    console.log('💬 Chat loaded:', summary);
  }

  /**
   * Handle deep link parameters from Siri Shortcuts or other sources
   * Supports: ?add=ItemName or ?command=FullCommand
   * Intelligently detects if input is already a complete command (German/English)
   */
  private handleDeepLinkParameters(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const addItem = urlParams.get('add');
    const command = urlParams.get('command');

    if (addItem || command) {
      // Construct message to send
      let messageToSend: string;
      if (command) {
        messageToSend = command;
      } else if (addItem) {
        // Check if the input is already a complete command (German or English)
        const lowerInput = addItem.toLowerCase().trim();
        const isCompleteCommand =
          lowerInput.startsWith('füge ') ||
          lowerInput.startsWith('add ') ||
          lowerInput.startsWith('erstelle ') ||
          lowerInput.startsWith('create ') ||
          lowerInput.includes(' hinzu') ||
          lowerInput.includes(' to ');

        if (isCompleteCommand) {
          // Use as-is if it's already a complete command
          messageToSend = addItem;
        } else {
          // Auto-format simple item names as "add" command in German
          messageToSend = `Füge ${addItem} hinzu`;
        }
      } else {
        return; // Safety check
      }

      console.log('📱 Deep link detected:', messageToSend);

      // Wait for services to initialize before processing
      setTimeout(() => {
        this.currentMessage = messageToSend;
        this.lastInputSource = 'text'; // Don't provide audio feedback for deep links
        this.sendMessage();

        // Clean URL after processing to avoid re-triggering on reload
        window.history.replaceState({}, '', window.location.pathname);
      }, 1500); // 1.5s delay ensures all services are ready
    }
  }

  private cleanup(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.voiceInput.cleanup();
    this.voiceOutput.cleanup();
    this.chatUI.cleanup();
  }

  // ========================================
  // CONTEXT SYNCHRONIZATION - FIXED
  // ========================================

  /**
   * FIXED: Bidirectional context synchronization between services
   */
  private syncContextBidirectional(): void {
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
        console.log(`🔄 SYNC: Context synced (${targetService === 'ai' ? 'chat -> AI' : 'AI -> chat'})`);
      }
      
      if (targetService === 'ai') {
        this.aiService.setConversationContext(sourceContext);
      } else {
        this.chatPersistence.setConversationContext(sourceContext);
      }
      
      this.invalidateConversationCache();
      this._lastContextSync = 0; // Force context recache on next access
    }
  }

  /**
   * FIXED: Enhanced context check with proper fallbacks
   */
  private getCurrentActiveContext(): ConversationContext {
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

  // ========================================
  // CORE MESSAGING - FIXED
  // ========================================

  async sendMessage(): Promise<void> {
    if (!this.currentMessage.trim() || this.isProcessing || this.isProcessingMessage) return;

    // CRITICAL: Prevent double execution
    if (this.isProcessingMessage) {
      console.log('🚫 Already processing message, ignoring duplicate call');
      return;
    }
    
    this.isProcessingMessage = true; // Set flag immediately
    
    const userMessage = this.currentMessage.trim();
    const lowerInput = userMessage.toLowerCase().trim();
    
    console.log('🔍 DEBUG: sendMessage() called at:', new Date().toLocaleTimeString());
    console.log('🔍 DEBUG: Input:', userMessage);
    
    // SIMPLIFIED: Just sync once and ensure AI service gets the context
    this.syncContextBidirectional();
    const currentContext = this.getCurrentActiveContext();
    console.log('🔄 CURRENT CONTEXT:', currentContext);
    
    // CRITICAL: Set context in AI service directly
    if (currentContext.waitingForArticles) {
      console.log('🔄 FORCING context into AI service');
      this.aiService.setConversationContext(currentContext);
    }
    
    // Clear disambiguation and add user message
    this.chatPersistence.setDisambiguation(null);
    this.chatPersistence.addMessage(userMessage, 'user');
    
    this.chatUI.scrollToBottom(this.messagesContainer, true);
    this.currentMessage = '';
    this.isProcessing = true;

    try {
      if (this.isRecipeInput(lowerInput, userMessage) || this.aiService.quantityExtractionService.hasMultipleItems(userMessage)) {
        console.log('🍳 Multi-item input detected (recipe or space-separated)');
        await this.processRecipeWithContextPreservation(userMessage);
        return;
      }
      
      // FIXED: Continuation keywords with better context handling
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
      
      // List creation - clear context
      if (lowerInput.includes('erstelle') && lowerInput.includes('liste')) {
        this.clearAllContexts();
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
      
      // FIXED: Enhanced conversation mode handling
      if (this.isInActiveConversation()) {
        const targetList = this.getCurrentTargetList();
        if (targetList) {
          // End conversation check
          if (lowerInput === 'nein' || lowerInput === 'fertig' || 
              lowerInput === 'stop' || lowerInput === 'ende') {
            this.clearAllContexts();
            this.chatPersistence.addMessage('👍 Fertig! Du kannst jederzeit neue Befehle eingeben.', 'assistant');
            this.chatUI.scrollToBottom(this.messagesContainer, true);
            return;
          }
          
          // FIXED: Process as contextual article with proper context sync
          this.syncContextBidirectional();
          const result = await this.aiService.executeCommand(userMessage);
          await this.handleAIResult(result);
          return;
        }
      }
      
      // Regular processing - clear context for new commands
      this.clearAllContexts();
      
      const result = await this.aiService.executeCommand(userMessage);
      await this.handleAIResult(result);
      
    } catch (error) {
      console.error('💬 AI ERROR:', error);
      this.chatPersistence.addMessage(
        `❌ Entschuldigung, ein Fehler ist aufgetreten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`, 
        'error'
      );
      this.chatUI.scrollToBottom(this.messagesContainer, true);
      
    } finally {
      this.isProcessing = false;
      this.isProcessingMessage = false; // Clear the flag
      setTimeout(() => this.chatUI.scrollToBottom(this.messagesContainer, true), 100);
    }
  }

  private invalidateConversationCache(): void {
    this._lastContextCheck = 0;
    this._lastContextSync = 0; // Also invalidate context sync cache
  }

  get activeConversationStatus(): boolean {
    return this.isInActiveConversation();
  }

  /**
   * FIXED: Clear contexts in both services
   */
  private clearAllContexts(): void {
    console.log('🗑️ Clearing all contexts');
    this.chatPersistence.clearConversationContext();
    this.aiService.clearConversationContext();
    
    // ADDED: Invalidate cache when contexts are cleared
    this.invalidateConversationCache();
  }

  toggleVerboseLogging(): void {
    this.verboseLogging = !this.verboseLogging;
    console.log(`🔧 Verbose logging ${this.verboseLogging ? 'enabled' : 'disabled'}`);
  }

  private async handleAIResult(result: AIExecutionResult): Promise<void> {
    console.log('🤖 HANDLE AI RESULT:', result);

    // Handle action buttons from result
    if (result.actionButtons && result.actionButtons.length > 0) {
      this.currentActionButtons = result.actionButtons;
      console.log('🔘 Action buttons set:', this.currentActionButtons);
    } else {
      this.currentActionButtons = [];
    }

    // Add main message
    this.chatPersistence.addMessage(result.message, result.success ? 'assistant' : 'error');

    // CRITICAL: Force scroll after message addition
    this.chatUI.scrollToBottom(this.messagesContainer, true);

    // Handle disambiguation first
    if (result.needsUserInput && result.disambiguationOptions && result.pendingAction) {
      console.log('🤖 Showing disambiguation');
      this.handleDisambiguation(result);
      // Scroll after disambiguation setup
      setTimeout(() => this.chatUI.scrollToBottom(this.messagesContainer, true), 200);
      return;
    }

    console.log('🤖 DEBUG: Checking conversation context in result...');
    console.log('🤖 DEBUG: result.conversationContext:', result.conversationContext);
    console.log('🤖 DEBUG: result.listId:', result.listId);
    console.log('🤖 DEBUG: result.followUpPrompt:', result.followUpPrompt);
  
  
    // CRITICAL FIX: Always sync conversation context bidirectionally
    if (result.conversationContext) {
      console.log('🤖 Updating conversation context bidirectionally');
      this.chatPersistence.setConversationContext(result.conversationContext);
      this.aiService.setConversationContext(result.conversationContext);

      console.log('🤖 DEBUG: After setting - AI context:', this.aiService.getConversationContext());
      console.log('🤖 DEBUG: After setting - Chat context:', this.chatPersistence.getConversationContext());
    }
  
    // FIXED: Enhanced list creation context detection
    if (result.success && result.listId && 
        (result.message.includes('Liste') && result.message.includes('erstellt'))) {
      console.log('🤖 List creation detected - forcing conversation context');
      
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
        this.aiService.setConversationContext(forcedContext);
        
        result.followUpPrompt = result.followUpPrompt || 
          `Möchtest du jetzt Artikel zu "${listName}" hinzufügen?`;
      }
    }
  
    // FIXED: Enhanced article addition context detection
    if (result.success && result.listId && result.message.includes('hinzugefügt')) {
      console.log('🤖 Article addition detected - ensuring conversation context');
      
      if (!result.conversationContext) {
        const messageMatch = result.message.match(/"([^"]+)" wurde (?:erstellt und )?zur Liste "([^"]+)" hinzugefügt/);
        const articleName = messageMatch ? messageMatch[1] : 'Artikel';
        const listName = messageMatch ? messageMatch[2] : 'Liste';
        
        const forcedContext: ConversationContext = {
          lastAction: {
            type: 'article_added' as const,
            listId: result.listId,
            listName: listName,
            articleName: articleName,
            timestamp: new Date()
          },
          waitingForArticles: {
            listId: result.listId,
            listName: listName,
            prompt: 'Möchtest du noch weitere Artikel hinzufügen?'
          }
        };
        
        this.chatPersistence.setConversationContext(forcedContext);
        this.aiService.setConversationContext(forcedContext);
        
        result.followUpPrompt = result.followUpPrompt || 
          'Möchtest du noch weitere Artikel hinzufügen? Du kannst auch "und [Artikel]" oder "weiters [Artikel]" sagen.';
      }
    }
  
    // Handle follow-up prompts with enhanced scroll
    if (result.success && result.followUpPrompt) {
      console.log('🤖 Adding follow-up prompt:', result.followUpPrompt);
      setTimeout(() => {
        this.chatPersistence.addMessage(result.followUpPrompt!, 'system');
        // CRITICAL: Scroll after follow-up message
        setTimeout(() => this.chatUI.scrollToBottom(this.messagesContainer, true), 100);
      }, 1000);
    }
  
    // Handle successful actions with audio feedback and scroll
    if (result.success && result.listId) {
      setTimeout(() => {
        this.handleSuccessfulAction(result);
        // CRITICAL: Scroll after any additional UI updates
        this.chatUI.scrollToBottom(this.messagesContainer, true);
      }, 100);
    }
  
    // CRITICAL: Additional scroll guarantee for any dynamic content
    setTimeout(() => this.chatUI.scrollToBottom(this.messagesContainer, true), 300);
  }

  // ========================================
  // CONVERSATION STATUS - FIXED
  // ========================================

  getConversationStatus(): string {
    // FIXED: Use active context with proper fallback
    const activeContext = this.getCurrentActiveContext();
    
    console.log('🔍 Getting conversation status from active context:', activeContext);
    
    // Check for active conversation context
    if (activeContext.waitingForArticles) {
      console.log('🔍 Active conversation found:', activeContext.waitingForArticles);
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
    
    console.log('🔍 No active conversation context found');
    return 'Keine aktive Unterhaltung';
  }


isInActiveConversation(): boolean {
  const now = Date.now();
  
  // Only recalculate if cache is expired
  if (now - this._lastContextCheck > this.CONTEXT_CACHE_DURATION) {
    const activeContext = this.getCurrentActiveContext();
    const newState = !!(activeContext.waitingForArticles?.listId && activeContext.waitingForArticles?.listName);
    
    // Only log if state actually changed
    if (this._lastLoggedState !== newState && !environment.production && this.verboseLogging) {
      console.log('🔄 CONTEXT: Active conversation state changed', {
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
   * FIXED: Get current target list with proper context handling
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

  finishAddingArticles(): void {
    console.log('🗣️ User manually finished adding articles');
    this.clearAllContexts();
    this.chatPersistence.addMessage('👍 Fertig! Du kannst jederzeit neue Befehle eingeben.', 'assistant');
  }

  // ========================================
  // RECIPE PROCESSING - FIXED
  // ========================================

  private async processRecipeWithContextPreservation(userMessage: string): Promise<void> {
    console.log('🍳 Processing recipe with context preservation');
    
    // CRITICAL FIX: Get active context properly
    const activeContext = this.getCurrentActiveContext();
    
    console.log('🍳 Current active context before processing:', activeContext);
    
    // Determine active target list from context
    let targetListName = null;
    let targetListId = null;
    
    if (activeContext.waitingForArticles) {
      targetListName = activeContext.waitingForArticles.listName;
      targetListId = activeContext.waitingForArticles.listId;
    } else if (activeContext.lastAction) {
      const timeSince = Date.now() - activeContext.lastAction.timestamp.getTime();
      if (timeSince < 10 * 60 * 1000) {
        targetListName = activeContext.lastAction.listName;
        targetListId = activeContext.lastAction.listId;
      }
    }
    
    console.log('🍳 Determined target:', { targetListName, targetListId });
    
    // CRITICAL FIX: Set context in AI service before processing
    if (targetListName && targetListId) {
      const preservedContext: ConversationContext = {
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
      
      console.log('🍳 Setting preserved context in AI service:', preservedContext);
      this.aiService.setConversationContext(preservedContext);
    }
    
    // Process the recipe
    const result = await this.aiService.executeCommand(userMessage);
    
    // CRITICAL FIX: Ensure context is maintained after processing
    if (targetListName && targetListId && !result.conversationContext) {
      console.log('🍳 Forcing context restoration after recipe processing');
      
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
  // CONTINUATION HANDLING - FIXED
  // ========================================

  private checkForContinuationKeywords(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    const continuationKeywords = ['und', 'weiters', 'außerdem', 'zusätzlich', 'noch', 'dann', 'danach'];
    
    return continuationKeywords.some(keyword => 
      lowerInput.startsWith(keyword + ' ') || 
      lowerInput === keyword
    );
  }

  private async handleContinuationKeywords(input: string): Promise<AIExecutionResult> {
    // FIXED: Use active context
    const activeContext = this.getCurrentActiveContext();
    let lastAction = activeContext.lastAction;
    
    if (lastAction && lastAction.listId) {
      const timeSince = Date.now() - lastAction.timestamp.getTime();
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
            // FIXED: Set proper conversation context
            const restoredContext: ConversationContext = {
              lastAction: lastAction,
              waitingForArticles: {
                listId: lastAction.listId,
                listName: lastAction.listName,
                prompt: 'Continuation mode activated'
              }
            };
            
            this.chatPersistence.setConversationContext(restoredContext);
            this.aiService.setConversationContext(restoredContext);
            
            return {
              success: true,
              message: `Was möchtest du noch zu "${lastAction.listName}" hinzufügen?`,
              conversationContext: restoredContext
            };
          }
        }
        
        if (itemsText.trim()) {
          // FIXED: Set conversation context before processing
          const activatedContext: ConversationContext = {
            lastAction: lastAction,
            waitingForArticles: {
              listId: lastAction.listId,
              listName: lastAction.listName,
              prompt: 'Continuation mode'
            }
          };
          
          this.chatPersistence.setConversationContext(activatedContext);
          this.aiService.setConversationContext(activatedContext);
          
          return await this.aiService.executeCommand(itemsText);
        }
      }
    }
    
    return {
      success: false,
      message: '💡 Keine kürzliche Liste gefunden zum Fortsetzen.\n\nVerwende Fortsetzungs-Wörter wie "und" oder "weiters" nur nach dem Hinzufügen von Artikeln zu einer Liste.'
    };
  }

  /**
 * FIXED: Enhanced recipe detection that handles multiline input
 */
private isRecipeInput(lowerInput: string, originalInput: string): boolean {
  // Check first line only for recipe keywords
  const firstLine = lowerInput.split(/\r?\n/)[0].trim();
  
  const recipeKeywords = [
    'rezept:', 'rezept', 'zutaten:', 'zutaten',
    'ingredienzien:', 'ingredienzien', 'ingredients:',
    'einkaufsliste aus rezept'
  ];
  
  const isRecipeDetected = recipeKeywords.some(keyword => {
    if (keyword.endsWith(':')) {
      return firstLine.startsWith(keyword);
    } else {
      // For keywords without colon, check if first line starts with keyword followed by space/end
      return firstLine === keyword || firstLine.startsWith(keyword + ' ');
    }
  });
  
  console.log('🍳 Voice Assistant Recipe detection:', { 
    firstLine, 
    originalInput: originalInput.substring(0, 50), 
    detected: isRecipeDetected 
  });
  
  return isRecipeDetected;
}

  // ========================================
  // DISAMBIGUATION - FIXED
  // ========================================

  private handleDisambiguation(result: AIExecutionResult): void {
    if (!result.disambiguationOptions || !result.pendingAction) {
      console.error('Invalid disambiguation data:', result);
      return;
    }
  
    console.log('🎯 Handling disambiguation');
  
    // Convert options for compatibility - NO SKIP OPTION ADDED
    const compatibleOptions = result.disambiguationOptions.map((option: any) => ({
      id: option.id,
      displayName: option.displayName,
      type: option.type,
      article: option.article,
      confidence: option.confidence,
      department: option.department,
      icon: option.icon
    }));
    
    // FIXED: Simplified message - will be displayed in content area
    this.chatPersistence.setDisambiguation({
      message: `"${result.pendingAction.itemName}" Welchen dieser ähnlichen Artikel möchtest du verwenden?`,
      options: compatibleOptions as any[],
      pendingAction: result.pendingAction as any
    });
  }

  selectDisambiguationOption(option: any): void {
    console.log('🎯 Disambiguation option selected:', option);
  
    const disambiguation = this.chatPersistence.getDisambiguation();
    if (!disambiguation) {
      console.error('🎯 No disambiguation available!');
      return;
    }
  
    const pendingAction = disambiguation.pendingAction;
    
    if (option.type === 'skip') {
      this.handleSkipArticle(pendingAction, option);
      return;
    }
    
    this.chatPersistence.setDisambiguation(null);
    
    const choiceText = this.generateChoiceText(option, pendingAction);
    this.chatPersistence.addMessage(choiceText, 'user');
    this.chatUI.scrollToBottom(this.messagesContainer, true);
    
    this.isProcessing = true;
  
    // CRITICAL FIX: Add timeout safeguard
    const timeoutId = setTimeout(() => {
      console.error('🚨 Disambiguation operation timed out after 10 seconds');
      this.isProcessing = false;
      this.chatPersistence.addMessage('❌ Operation timed out. Please try again.', 'error');
      this.chatUI.scrollToBottom(this.messagesContainer, true);
    }, 10000);
  
    const currentContext = this.getCurrentActiveContext();
    
    if (currentContext.waitingForArticles && !pendingAction.listName) {
      pendingAction.listName = currentContext.waitingForArticles.listName;
      (pendingAction as any).conversationListId = currentContext.waitingForArticles.listId;
    }
    
    console.log('🎯 About to call handleDisambiguationChoice with:', {
      pendingAction: pendingAction,
      selectedOption: option,
      currentContext: currentContext
    });

    this.aiService.handleDisambiguationChoice(pendingAction, option)
      .then((result: AIExecutionResult) => {
        clearTimeout(timeoutId); // CRITICAL: Clear timeout on success
        
        if (result.success && !result.conversationContext && currentContext.waitingForArticles) {
          const preservedContext = {
            lastAction: {
              type: 'article_added' as const,
              listId: currentContext.waitingForArticles.listId,
              listName: currentContext.waitingForArticles.listName,
              articleName: pendingAction.itemName,
              timestamp: new Date()
            },
            waitingForArticles: {
              listId: currentContext.waitingForArticles.listId,
              listName: currentContext.waitingForArticles.listName,
              prompt: 'Conversation context preserved after disambiguation'
            }
          };
          
          result.conversationContext = preservedContext;
          result.followUpPrompt = result.followUpPrompt || 
            `Möchtest du noch weitere Artikel zu "${currentContext.waitingForArticles.listName}" hinzufügen?`;
        }
        
        if (result.listId && !result.conversationContext) {
          const listNameMatch = result.message.match(/zur Liste "([^"]+)" hinzugefügt/);
          const listName = listNameMatch ? listNameMatch[1] : 
                          (currentContext.waitingForArticles?.listName || 'Liste');
          
          result.conversationContext = {
            lastAction: {
              type: 'article_added' as const,
              listId: result.listId,
              listName: listName,
              articleName: pendingAction.itemName,
              timestamp: new Date()
            },
            waitingForArticles: {
              listId: result.listId,
              listName: listName,
              prompt: 'Conversation context created from result'
            }
          };
          
          result.followUpPrompt = result.followUpPrompt || 
            `Möchtest du noch weitere Artikel zu "${listName}" hinzufügen?`;
        }
        
        this.handleAIResult(result);
      })
      .catch((error: any) => {
        clearTimeout(timeoutId); // CRITICAL: Clear timeout on error
        console.error('🎯 Disambiguation error:', error);
        this.chatPersistence.addMessage(
          `❌ Fehler: ${error.message || 'Unbekannter Fehler'}`, 
          'error'
        );
        this.chatUI.scrollToBottom(this.messagesContainer, true);
      })
      .finally(() => {
        this.isProcessing = false; // CRITICAL: Always reset processing state
        setTimeout(() => this.chatUI.scrollToBottom(this.messagesContainer, true), 100);
      });
  }

  skipCurrentArticle(pendingAction: any): void {
    console.log('⏭️ Skipping current article from button');
    
    this.chatPersistence.setDisambiguation(null);
    
    let skipMessage = `⏭️ "${pendingAction.itemName}" übersprungen`;
    
    this.chatPersistence.addMessage(skipMessage, 'user');
    this.chatUI.scrollToBottom(this.messagesContainer, true);
    
    this.isProcessing = true;
    
    // Handle skip with proper option structure
    const skipOption = {
      id: 'skip_item',
      displayName: `"${pendingAction.itemName}" überspringen`,
      type: 'skip' as const,
      confidence: 1.0,
      skipReason: 'Artikel übersprungen'
    };
    
    this.aiService.handleDisambiguationChoice(pendingAction, skipOption)
      .then((result: AIExecutionResult) => {
        this.handleAIResult(result);
      })
      .catch((error: any) => {
        console.error('⏭️ Error skipping article:', error);
        this.chatPersistence.addMessage('❌ Fehler beim Überspringen des Artikels', 'error');
        this.chatUI.scrollToBottom(this.messagesContainer, true);
      })
      .finally(() => {
        this.isProcessing = false;
        setTimeout(() => this.chatUI.scrollToBottom(this.messagesContainer, true), 100);
      });
  }

  private handleSkipArticle(pendingAction: any, option: any): void {
    console.log('⏭️ Handling skip for:', pendingAction.itemName);
    
    this.chatPersistence.setDisambiguation(null);
    
    let skipMessage = `⏭️ "${pendingAction.itemName}" übersprungen`;
    if (option.skipReason) {
      skipMessage += ` (${option.skipReason})`;
    }
    
    this.chatPersistence.addMessage(skipMessage, 'user');
    this.isProcessing = true;
    
    // CRITICAL FIX: Handle sequential processing continuation
    if (this.isSequentialRecipeProcessing(pendingAction)) {
      console.log('⏭️ Continuing sequential recipe processing after skip');
      
      this.aiService.handleDisambiguationChoice(pendingAction, {
        id: 'skip_item',
        displayName: `"${pendingAction.itemName}" überspringen`,
        type: 'skip' as const,
        confidence: 1.0,
        skipReason: option.skipReason || 'Übersprungen'
      })
      .then((result: AIExecutionResult) => {
        this.handleAIResult(result);
      })
      .catch((error: any) => {
        console.error('⏭️ Error continuing after skip:', error);
        this.chatPersistence.addMessage('❌ Fehler beim Fortsetzen der Verarbeitung', 'error');
      })
      .finally(() => {
        this.isProcessing = false;
      });
      
    } else {
      // Single item skip
      this.isProcessing = false;
      const context = this.getCurrentActiveContext();
      if (context.waitingForArticles) {
        this.chatPersistence.addMessage(
          `Du kannst weitere Artikel zu "${context.waitingForArticles.listName}" hinzufügen.`, 
          'assistant'
        );
      }
    }
  }

  async skipAllRemaining(pendingAction: any): Promise<void> {
    if (!this.isSequentialRecipeProcessing(pendingAction)) return;
    
    console.log('⏭️ Skipping all remaining items');
    
    this.chatPersistence.setDisambiguation(null);
    
    const remaining = this.getTotalItems(pendingAction) - this.getCurrentItemIndex(pendingAction);
    
    this.chatPersistence.addMessage(
      `⏭️ Alle ${remaining} verbleibenden Zutaten übersprungen`, 
      'user'
    );
    
    this.isProcessing = true;
    
    try {
      // Skip to end
      pendingAction.currentItemIndex = pendingAction.items.length;
      
      // Add all remaining as skipped
      for (let i = this.getCurrentItemIndex(pendingAction); i < pendingAction.items.length; i++) {
        pendingAction.processedItems = pendingAction.processedItems || [];
        pendingAction.processedItems.push({
          item: pendingAction.items[i],
          skipped: true,
          skipReason: 'Alle übersprungen'
        });
      }
      
      const result = await this.aiService.handleDisambiguationChoice(pendingAction, {
        id: 'skip_all_remaining',
        displayName: 'Alle verbleibenden überspringen',
        type: 'skip' as const,
        confidence: 1.0
      });
      
      this.chatPersistence.addMessage('✅ Alle restlichen Artikel übersprungen', 'assistant');
    
      // Handle any additional context from result
      if (result && result.conversationContext) {
        this.chatPersistence.setConversationContext(result.conversationContext);
        this.aiService.setConversationContext(result.conversationContext);
      }
      
    } catch (error) {
      console.error('⏭️ Error skipping all items:', error);
      // FIXED: Still show success since skip operation worked
      this.chatPersistence.addMessage('✅ Alle restlichen Artikel übersprungen', 'assistant');
    } finally {
      this.isProcessing = false;
      setTimeout(() => this.chatUI.scrollToBottom(this.messagesContainer, true), 100);
    }
  }

  cancelDisambiguation(): void {
    this.chatPersistence.setDisambiguation(null);
    this.chatPersistence.addMessage('Aktion abgebrochen.', 'system');
  }

  // ========================================
  // UI HELPER METHODS - FIXED
  // ========================================

  onTextInput(): void {
    this.lastInputSource = 'text';
    this.shouldProvideAudioFeedback = false;
  }

  sendQuickMessage(message: string): void {
    this.chatPersistence.setDisambiguation(null);
    this.currentMessage = message;
    this.sendMessage();
    
    // Ensure scroll after quick message
    setTimeout(() => this.chatUI.scrollToBottom(this.messagesContainer, true), 50);
  }

  canUseContinuation(): boolean {
    const activeContext = this.getCurrentActiveContext();
    
    if (activeContext.lastAction) {
      const timeSince = Date.now() - activeContext.lastAction.timestamp.getTime();
      return timeSince < 10 * 60 * 1000; // 10 minutes
    }
    
    return false;
  }

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
      const targetList = this.getCurrentTargetList();
      if (targetList) {
        return `Artikel für "${targetList.listName}"`;
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
  // DISAMBIGUATION UI HELPERS - DELEGATED TO SERVICE
  // ========================================

  isRecipeProcessing(pendingAction: any): boolean {
    return this.disambiguationUI.isRecipeProcessing(pendingAction);
  }

  isSequentialRecipeProcessing(pendingAction: any): boolean {
    return this.disambiguationUI.isSequentialRecipeProcessing(pendingAction);
  }

  getCurrentItemIndex(pendingAction: any): number {
    return this.disambiguationUI.getCurrentItemIndex(pendingAction);
  }

  getTotalItems(pendingAction: any): number {
    return this.disambiguationUI.getTotalItems(pendingAction);
  }

  getProgressPercentage(pendingAction: any): number {
    return this.disambiguationUI.getProgressPercentage(pendingAction);
  }

  canSkipAll(pendingAction: any): boolean {
    return this.disambiguationUI.canSkipAll(pendingAction);
  }

  getDisambiguationHeaderColor(disambiguation: any): string {
    return this.disambiguationUI.getDisambiguationHeaderColor(disambiguation);
  }

  getDisambiguationHeaderIcon(disambiguation: any): string {
    return this.disambiguationUI.getDisambiguationHeaderIcon(disambiguation);
  }

  getDisambiguationHeaderTitle(disambiguation: any): string {
    return this.disambiguationUI.getDisambiguationHeaderTitle(disambiguation);
  }

  getActionDescription(pendingAction: any): string {
    return this.disambiguationUI.getActionDescription(pendingAction);
  }

  getDefaultIcon(option: any): string {
    return this.disambiguationUI.getDefaultIcon(option);
  }

  getActionHint(option: any, pendingAction: any): string {
    return this.disambiguationUI.getActionHint(option, pendingAction);
  }

  getDepartmentName(departmentId: string): string {
    return this.disambiguationUI.getDepartmentName(departmentId);
  }

  getOptionIcon(option: any): string {
    return this.disambiguationUI.getOptionIcon(option);
  }

  getConfidenceText(confidence: number): string {
    return this.disambiguationUI.getConfidenceText(confidence);
  }

  private generateChoiceText(option: DisambiguationOption, pendingAction: any): string {
    return this.disambiguationUI.generateChoiceText(option, pendingAction);
  }

  private handleSuccessfulAction(result: AIExecutionResult): void {
    if (this.shouldProvideAudioFeedback) {
      // VoiceOutputService handles text cleaning automatically
      this.voiceOutput.speak(result.message);
    }
  }

  // ========================================
  // VOICE INPUT METHODS
  // ========================================

  toggleVoiceInput(): void {
    this.voiceInput.toggleRecording();
  }

  get isRecording(): boolean {
    return this.voiceInput.isRecording();
  }

  // All voice input methods now handled by VoiceInputService
  // See setupVoiceInputSubscriptions() in ngOnInit()

  // ========================================
  // NAVIGATION & ACTIONS
  // ========================================

  onBack(): void {
    this.router.navigate(['/lists']);
  }
  
  clearChat(): void {
    this.chatPersistence.clearMessages();
    this.chatPersistence.initializeIfEmpty();
    this.clearAllContexts();
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
    const helpMessage = this.aiService.aiResponseService.getEnhancedHelpMessage(hasApiKey);
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

  /**
   * Handle action button click
   */
  async handleActionButtonClick(button: ActionButton): Promise<void> {
    console.log('🔘 ========== ACTION BUTTON CLICKED ==========');
    console.log('🔘 Button:', button);
    console.log('🔘 Current context:', this.aiService.getConversationContext());

    // Send the button's command
    this.currentMessage = button.command;
    console.log('🔘 Set currentMessage to:', this.currentMessage);

    // Clear action buttons after setting message
    this.currentActionButtons = [];

    console.log('🔘 Calling sendMessage()...');
    await this.sendMessage();
    console.log('🔘 ========== BUTTON CLICK COMPLETE ==========');
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  // PWA viewport and scrolling now handled by ChatUIService
  // See chatUI.initializePWAViewport() and chatUI.scrollToBottom()

  // Arrow functions to preserve 'this' context for trackBy
  public trackByOptionId = (index: number, option: any): string => {
    return this.disambiguationUI.trackByOptionId(index, option);
  }

  public trackByIndex = (index: number): number => {
    return index;
  }


  async triggerRecovery() {
    try {
      const result = await this.aiService.triggerManualRecovery();
      console.log('🔧 Recovery result:', result);
      
      // Optional: Show user feedback (you can integrate with your notification system)
      if (result.success) {
        console.log('✅ Recovery successful:', result.actions);
      } else {
        console.log('❌ Recovery failed:', result.message);
      }
    } catch (error) {
      console.error('Recovery error:', error);
    }
  }

  // Make Math available in template
  Math = Math;
}