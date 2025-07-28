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
  isRecording = false;
  private isSpeaking = false;
  
  // Input tracking & audio feedback
  private lastInputSource: 'voice' | 'text' = 'text';
  private shouldProvideAudioFeedback = false;
  
  // Speech services
  private recognition: any;
  private synthesis: SpeechSynthesis;
  
  // Lifecycle management
  private destroy$ = new Subject<void>();

  private isProcessingMessage = false;

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
    
    this.messages$ = this.chatPersistence.messages$;
    this.disambiguation$ = this.chatPersistence.disambiguation$;
    
    this.initializeSpeechRecognition();
  }

  ngOnInit(): void {
    this.initializeChat();
    this.setupPWAViewport();
    this.setupMessageScrolling(); // This will now include enhanced scrolling
    this.checkRestoredContext();
    this.logChatStatus();
    
    // CRITICAL: Initial scroll to bottom
    setTimeout(() => this.scrollToBottom(true), 10);
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  ngAfterViewInit(): void {
    // Ensure scroll container is available and scroll to bottom
    setTimeout(() => {
      if (this.messagesContainer) {
        this.scrollToBottom(true);
      }
    }, 30);
  }

  onContentChange(): void {
    // Call this method whenever content dynamically changes
    setTimeout(() => this.scrollToBottom(true), 50);
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
      setTimeout(() => this.scrollToBottom(true), 50);
      
      // Additional scroll for dynamic content
      setTimeout(() => this.scrollToBottom(true), 200);
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
  // CONTEXT SYNCHRONIZATION - FIXED
  // ========================================

  /**
   * FIXED: Bidirectional context synchronization between services
   */
  private syncContextBidirectional(): void {
    const chatContext = this.chatPersistence.getConversationContext();
    const aiContext = this.aiService.getConversationContext();
    
    /*console.log('🔄 SYNC: Syncing contexts bidirectionally');
    console.log('🔄 SYNC: Chat context:', chatContext);
    console.log('🔄 SYNC: AI context:', aiContext);*/
    
    // Determine which context is more recent/complete
    let sourceContext: ConversationContext | null = null;
    let targetService: 'chat' | 'ai' | null = null;
    
    if (chatContext?.waitingForArticles && !aiContext.waitingForArticles) {
      // Chat has active context, AI doesn't - sync to AI
      sourceContext = chatContext;
      targetService = 'ai';
    } else if (aiContext.waitingForArticles && !chatContext?.waitingForArticles) {
      // AI has active context, Chat doesn't - sync to Chat
      sourceContext = aiContext;
      targetService = 'chat';
    } else if (chatContext?.lastAction && aiContext.lastAction) {
      // Both have contexts - use the most recent
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
    
    // Perform synchronization
    if (sourceContext && targetService) {
      console.log(`🔄 SYNC: Syncing ${targetService === 'ai' ? 'chat -> AI' : 'AI -> chat'}`);
      
      if (targetService === 'ai') {
        this.aiService.setConversationContext(sourceContext);
      } else {
        this.chatPersistence.setConversationContext(sourceContext);
      }
      
      //console.log('🔄 SYNC: Synchronization completed');
    } else {
      //console.log('🔄 SYNC: No synchronization needed');
    }
  }

  /**
   * FIXED: Enhanced context check with proper fallbacks
   */
  private getCurrentActiveContext(): ConversationContext {
    // Always sync first
    this.syncContextBidirectional();
    
    const chatContext = this.chatPersistence.getConversationContext();
    const aiContext = this.aiService.getConversationContext();
    
    //console.log('🔍 Getting active context - Chat:', chatContext, 'AI:', aiContext);
    
    // Return the most complete context
    if (chatContext?.waitingForArticles) {
      console.log('🔍 Using chat context (has waitingForArticles)');
      return chatContext;
    }
    if (aiContext.waitingForArticles) {
      console.log('🔍 Using AI context (has waitingForArticles)');
      return aiContext;
    }
    if (chatContext?.lastAction) {
      console.log('🔍 Using chat context (has lastAction)');
      return chatContext;
    }
    if (aiContext.lastAction) {
      console.log('🔍 Using AI context (has lastAction)');
      return aiContext;
    }
    
    //console.log('🔍 No active context found');
    return {};
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
    
    this.scrollToBottom(true);
    this.currentMessage = '';
    this.isProcessing = true;

    try {
      if (this.isRecipeInput(lowerInput, userMessage) || this.aiService.quantityExtraction.hasMultipleItems(userMessage)) {
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
            this.scrollToBottom(true);
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
      this.scrollToBottom(true);
      
    } finally {
      this.isProcessing = false;
      this.isProcessingMessage = false; // Clear the flag
      setTimeout(() => this.scrollToBottom(true), 100);
    }
  }

  /**
   * FIXED: Clear contexts in both services
   */
  private clearAllContexts(): void {
    console.log('🗑️ Clearing all contexts');
    this.chatPersistence.clearConversationContext();
    this.aiService.clearConversationContext();
  }

  private async handleAIResult(result: AIExecutionResult): Promise<void> {
    console.log('🤖 HANDLE AI RESULT:', result);
    
    // Add main message
    this.chatPersistence.addMessage(result.message, result.success ? 'assistant' : 'error');
    
    // CRITICAL: Force scroll after message addition
    this.scrollToBottom(true);
  
    // Handle disambiguation first
    if (result.needsUserInput && result.disambiguationOptions && result.pendingAction) {
      console.log('🤖 Showing disambiguation');
      this.handleDisambiguation(result);
      // Scroll after disambiguation setup
      setTimeout(() => this.scrollToBottom(true), 200);
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
        setTimeout(() => this.scrollToBottom(true), 100);
      }, 1000);
    }
  
    // Handle successful actions with audio feedback and scroll
    if (result.success && result.listId) {
      setTimeout(() => {
        this.handleSuccessfulAction(result);
        // CRITICAL: Scroll after any additional UI updates
        this.scrollToBottom(true);
      }, 100);
    }
  
    // CRITICAL: Additional scroll guarantee for any dynamic content
    setTimeout(() => this.scrollToBottom(true), 300);
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
    const activeContext = this.getCurrentActiveContext();
    return !!activeContext.waitingForArticles;
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

    console.log('🎯 DEBUG: Context BEFORE disambiguation:', this.getCurrentActiveContext());
  
    
    const disambiguation = this.chatPersistence.getDisambiguation();
    if (!disambiguation) {
      console.error('🎯 No disambiguation available!');
      return;
    }
  
    // FIXED: Properly extract pendingAction from disambiguation
    const pendingAction = disambiguation.pendingAction;
    
    // Handle skip option
    if (option.type === 'skip') {
      console.log('⏭️ Processing skip option');
      this.handleSkipArticle(pendingAction, option);
      return;
    }
    
    // Clear disambiguation and add choice message
    this.chatPersistence.setDisambiguation(null);
    
    const choiceText = this.generateChoiceText(option, pendingAction);
    this.chatPersistence.addMessage(choiceText, 'user');
    
    // CRITICAL: Scroll after choice message
    this.scrollToBottom(true);
    
    this.isProcessing = true;
  
    // CRITICAL FIX: Preserve conversation context more thoroughly
    const currentContext = this.getCurrentActiveContext();
    console.log('🎯 Current context before disambiguation:', currentContext);
    
    // ENHANCED: Ensure pending action has conversation context info
    if (currentContext.waitingForArticles && !pendingAction.listName) {
      console.log('🎯 Enhancing pending action with conversation context');
      pendingAction.listName = currentContext.waitingForArticles.listName;
      (pendingAction as any).conversationListId = currentContext.waitingForArticles.listId;
    }
  
    this.aiService.handleDisambiguationChoice(pendingAction, option)
      .then((result: AIExecutionResult) => {
        console.log('🎯 Disambiguation result:', result);
        console.log('🎯 DEBUG: Context AFTER disambiguation result:', result.conversationContext);
        console.log('🎯 DEBUG: AI context after disambiguation:', this.aiService.getConversationContext());
            
        // CRITICAL FIX: Enhanced context preservation logic
        if (result.success) {
          // If result doesn't have conversation context but we should maintain it
          if (!result.conversationContext && currentContext.waitingForArticles) {
            console.log('🎯 Restoring conversation context from current context');
            
            // Create preserved context based on current context and result
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
          
          // If result has list ID but no conversation context, create it
          if (result.listId && !result.conversationContext) {
            console.log('🎯 Creating conversation context from result list ID');
            
            // Extract list name from success message or use fallback
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
        }
        
        this.handleAIResult(result);
      })
      .catch((error: any) => {
        console.error('🎯 Disambiguation error:', error);
        this.chatPersistence.addMessage(
          `❌ Fehler: ${error.message || 'Unbekannter Fehler'}`, 
          'error'
        );
        // CRITICAL: Scroll after error
        this.scrollToBottom(true);
      })
      .finally(() => {
        this.isProcessing = false;
        // CRITICAL: Final scroll
        setTimeout(() => this.scrollToBottom(true), 100);
      });
  }

  skipCurrentArticle(pendingAction: any): void {
    console.log('⏭️ Skipping current article from button');
    
    this.chatPersistence.setDisambiguation(null);
    
    let skipMessage = `⏭️ "${pendingAction.itemName}" übersprungen`;
    
    this.chatPersistence.addMessage(skipMessage, 'user');
    this.scrollToBottom(true);
    
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
        this.scrollToBottom(true);
      })
      .finally(() => {
        this.isProcessing = false;
        setTimeout(() => this.scrollToBottom(true), 100);
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
      setTimeout(() => this.scrollToBottom(true), 100);
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
    setTimeout(() => this.scrollToBottom(true), 50);
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
  // DISAMBIGUATION UI HELPERS - FIXED
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
           pendingAction?.items &&
           Array.isArray(pendingAction.items) &&
           typeof pendingAction?.currentItemIndex === 'number' &&
           pendingAction.currentItemIndex < pendingAction.items.length;
  }

  getCurrentItemIndex(pendingAction: any): number {
    return pendingAction?.currentItemIndex || 0;
  }

  getTotalItems(pendingAction: any): number {
    return pendingAction?.allItems?.length || pendingAction?.items?.length || 1;
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
    
    // For article disambiguation, don't show "X Artikel" subtitle
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
    if (option.type === 'skip') return '⏭️';
    if (option.type === 'new') return '➕';
    if (option.type === 'existing') return '📦';
    return '📋';
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

  getDepartmentName(departmentId: string): string {
    // Map department IDs to German names
    const departmentNames: Record<string, string> = {
      'fruit-vegetables': 'Obst & Gemüse',
      'dairy-products': 'Milchprodukte', 
      'sausage-cheese-counter': 'Wurst & Käse',
      'fridge-meat': 'Fleisch',
      'fish': 'Fisch',
      'bread': 'Brot & Backwaren',
      'noodles-rice': 'Nudeln & Reis',
      'tins-jars': 'Konserven',
      'spices-oils': 'Gewürze & Öle',
      'beverages-alcohol': 'Getränke',
      'frozen-goods': 'Tiefkühl',
      'pastries': 'Süßwaren',
      'sweet-salty': 'Süß & Salzig',
      'household-goods': 'Haushalt',
      'body-care': 'Körperpflege',
      'cleaning-agents': 'Reinigung',
      'breakfast': 'Frühstück',
      'international': 'International',
      'pet-supplies': 'Tierbedarf',
      'baby': 'Baby',
      'medicine': 'Medikamente',
      'miscellaneous': 'Sonstiges'
    };
    
    return departmentNames[departmentId] || departmentId;
  }

  getOptionIcon(option: any): string {
    // Skip options get their specific icon
    if (option.type === 'skip') {
      return '⏭️';
    }
    
    // Use suggested icon if available
    if (option.icon && option.icon !== '✨') {
      return option.icon;
    }
    
    // Fallback to default
    return this.getDefaultIcon(option);
  }

  getConfidenceText(confidence: number): string {
    const percentage = Math.round(confidence * 100);
    if (percentage >= 90) return `${percentage}% - Exakte Übereinstimmung`;
    if (percentage >= 70) return `${percentage}% - Sehr ähnlich`;
    if (percentage >= 50) return `${percentage}% - Ähnlich`;
    return `${percentage}% - Entfernt ähnlich`;
  }

  private generateChoiceText(option: DisambiguationOption, pendingAction: any): string {
    if (option.type === 'skip') {
      return `⏭️ "${pendingAction.itemName}" übersprungen`;
    }
    
    if (this.isSequentialRecipeProcessing(pendingAction)) {
      const current = this.getCurrentItemIndex(pendingAction) + 1;
      const total = this.getTotalItems(pendingAction);
      
      if (option.type === 'existing') {
        return `🍳 Zutat ${current}/${total}: ${option.displayName} gewählt`;
      } else {
        return `🍳 Zutat ${current}/${total}: "${pendingAction.itemName}" (neu erstellen)`;
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
      }, 30);
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

  private scrollToBottom(force: boolean = false): void {
    if (!this.messagesContainer) return;
    
    const element = this.messagesContainer.nativeElement;
    
    // INSTANT: Most direct scroll command
    try {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: 'instant'
      });
    } catch (error) {
      // Fallback for older browsers
      element.scrollTop = element.scrollHeight;
    }
  }

  public trackByOptionId(index: number, option: any): string {
    return option.id || index.toString();
  }

  // Make Math available in template
  Math = Math;
}