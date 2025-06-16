// src/app/shared/components/voice-ai-assistant/voice-ai-assistant.component.ts
import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, Observable } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
  DisambiguationOption
} from '../../../core/services/ai.service';
import { ChatPersistenceService } from '../../../core/services/chat-persistence.service';
import { DepartmentService } from '../../../core/services/department.service';

// Local type definitions to ensure compatibility
interface ExtendedPendingAction {
  type: 'add_item' | 'create_list' | 'select_list';
  originalInput: string;
  itemName: string;
  extractedQuantity?: string;
  listName?: string;
  suggestedDepartment?: string;
  articleToAdd?: {
    id?: string;
    name: string;
    amount?: string;
    departmentId?: string;
    icon?: string;
  };
}

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
  private isSpeaking = false; // Add this property at the top with other properties
  
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
    private aiService: AIService,
    private chatPersistence: ChatPersistenceService,
    private departmentService: DepartmentService,
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
    this.logChatStatus();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  // ========================================
  // INITIALIZATION METHODS
  // ========================================
  private initializeChat(): void {
    this.chatPersistence.initializeIfEmpty();
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
    const chatHistory = this.chatPersistence.exportChatHistory();
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
  // MESSAGE HANDLING
  // ========================================
  async sendMessage(): Promise<void> {
    if (!this.currentMessage.trim() || this.isProcessing) return;
  
    const userMessage = this.currentMessage.trim();
    
    // 💬 ENHANCED DEBUG: Log the user message with more context
    console.log('💬 SEND MESSAGE CALLED');
    console.log('💬 USER MESSAGE:', userMessage);
    console.log('💬 MESSAGE LENGTH:', userMessage.length);
    console.log('💬 IS PROCESSING:', this.isProcessing);
    console.log('💬 CONTAINS FÜGE:', userMessage.toLowerCase().includes('füge'));
    console.log('💬 CONTAINS HINZU:', userMessage.toLowerCase().includes('hinzu'));
    console.log('💬 CONTAINS MENGE:', userMessage.toLowerCase().includes('menge'));
    
    // Clear any existing disambiguation
    this.chatPersistence.setDisambiguation(null);
    
    this.chatPersistence.addMessage(userMessage, 'user');
    this.currentMessage = '';
    this.isProcessing = true;
  
    try {
      console.log('💬 CALLING AI SERVICE WITH:', userMessage);
      const startTime = Date.now();
      
      const result = await this.aiService.executeCommand(userMessage);
      
      const endTime = Date.now();
      console.log('💬 AI SERVICE COMPLETED IN:', endTime - startTime, 'ms');
      console.log('💬 AI SERVICE RESULT:', result);
      
      await this.handleAIResult(result);
    } catch (error) {
      console.error('💬 AI ERROR:', error);
      console.error('💬 ERROR STACK:', error instanceof Error ? error.stack : 'No stack trace');
      
      this.chatPersistence.addMessage(
        `❌ Entschuldigung, ein Fehler ist aufgetreten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}\n\n💡 Versuche es mit:\n• "Hilfe" für verfügbare Befehle\n• "Test" für System-Status`, 
        'error'
      );
    } finally {
      this.isProcessing = false;
      this.scrollToBottom();
    }
  }

  sendQuickMessage(message: string): void {
    // Clear any existing disambiguation when sending quick messages
    this.chatPersistence.setDisambiguation(null);
    
    this.currentMessage = message;
    this.sendMessage();
  }

  private async handleAIResult(result: AIExecutionResult): Promise<void> {
    // 🤖 ENHANCED DEBUG: Log the complete AI result with more detail
    console.log('🤖 HANDLE AI RESULT CALLED');
    console.log('🤖 AI RESULT:', result);
    console.log('🤖 SUCCESS:', result.success);
    console.log('🤖 MESSAGE:', result.message);
    console.log('🤖 NEEDS USER INPUT:', result.needsUserInput);
    console.log('🤖 LIST ID:', result.listId);
    
    // 🐛 DEBUG: If there's disambiguation, log the pending action details
    if (result.needsUserInput && result.pendingAction) {
      console.log('🤖 PENDING ACTION TYPE:', result.pendingAction.type);
      console.log('🤖 PENDING ACTION ITEM NAME:', result.pendingAction.itemName);
      console.log('🤖 PENDING ACTION ORIGINAL INPUT:', result.pendingAction.originalInput);
      console.log('🤖 PENDING ACTION QUANTITY:', result.pendingAction.extractedQuantity);
      console.log('🤖 DISAMBIGUATION OPTIONS COUNT:', result.disambiguationOptions?.length);
      
      // Log each disambiguation option for debugging
      result.disambiguationOptions?.forEach((option, index) => {
        console.log(`🤖 OPTION ${index}:`, {
          id: option.id,
          displayName: option.displayName,
          type: option.type,
          confidence: option.confidence,
          articleName: option.article?.name
        });
      });
    }
  
    // Add main message
    this.chatPersistence.addMessage(result.message, result.success ? 'assistant' : 'error');
  
    // Handle disambiguation (both article and list selection)
    if (result.needsUserInput && result.disambiguationOptions && result.pendingAction) {
      console.log('🤖 HANDLING DISAMBIGUATION');
      this.handleDisambiguation(result);
    }
  
    // Handle successful actions
    if (result.success && result.listId) {
      console.log('🤖 HANDLING SUCCESSFUL ACTION');
      this.handleSuccessfulAction(result);
    }
  
    // Handle suggestions
    if (result.suggestedAction === 'CREATE_LIST' && result.suggestedData) {
      console.log('🤖 HANDLING SUGGESTION');
      this.handleSuggestion(result);
    }
  
    // Provide additional feedback for list-related actions
    if (result.success && result.message.includes('Liste')) {
      console.log('🤖 ADDING LIST-RELATED FEEDBACK');
      setTimeout(() => {
        this.chatPersistence.addMessage(
          '💡 Weitere Befehle:\n• "Füge [Artikel] hinzu" - Artikel zur Liste hinzufügen\n• "Zeige Listen" - Alle Listen anzeigen',
          'system'
        );
      }, 1500);
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
    // 🎯 DEBUG: Log when this method is called
    console.log('🎯 HANDLE SUCCESSFUL ACTION CALLED');
    console.log('🎯 RESULT MESSAGE:', result.message);
    console.log('🎯 RESULT SUCCESS:', result.success);
    console.log('🎯 RESULT LIST ID:', result.listId);
    console.log('🎯 FULL RESULT OBJECT:', result);
    
    // Extract the first line and clean it
    const messageToSpeak = result.message.split('\n')[0]
      .replace(/[✅❌🎯💡📝🛒🔑⚖️🎨📋]/g, '') // Remove emojis
      .replace(/^\s*/, '') // Remove leading whitespace
      .trim();
    
    console.log('🎯 MESSAGE TO SPEAK:', messageToSpeak);
    
    if (messageToSpeak) {
      this.speak(messageToSpeak);
    }
    
    // Navigate to list after delay
    setTimeout(() => {
      console.log('🎯 NAVIGATING TO LIST:', result.listId);
      this.router.navigate(['/lists', result.listId]);
    }, 2000);
  }

  private handleSuggestion(result: AIExecutionResult): void {
    this.chatPersistence.addMessage(
      `Tipp: Sage "Erstelle Liste ${result.suggestedData!.listName}" um sie anzulegen.`, 
      'system'
    );
  }

  // ========================================
  // ENHANCED DISAMBIGUATION METHODS
  // ========================================

  /**
   * Check if current disambiguation is for list selection
   */
  isListSelection(pendingAction: ExtendedPendingAction | null | undefined): boolean {
    return pendingAction?.type === 'select_list';
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
   * Get action description for pending action
   */
  getActionDescription(pendingAction: ExtendedPendingAction | null | undefined): string {
    if (!pendingAction) return 'Unbekannte Aktion';
    
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
    // For list selection, we can extract color from the option or use default
    // This assumes you store the list color somehow in the option
    // You might need to modify the AI service to include this information
    return '#2196f3'; // Default blue, but you can enhance this
  }

  /**
   * Get action hint text for disambiguation options
   */
  getActionHint(option: DisambiguationOption, pendingAction: ExtendedPendingAction | null | undefined): string {
    if (!pendingAction) return 'Unbekannte Aktion';
    
    if (this.isListSelection(pendingAction)) {
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
  // DISAMBIGUATION HANDLING
  // ========================================
  selectDisambiguationOption(option: DisambiguationOption): void {
    console.log('🎯 DISAMBIGUATION OPTION SELECTED:', option);
    
    const disambiguation = this.chatPersistence.getDisambiguation();
    if (!disambiguation) {
      console.error('🎯 No disambiguation available!');
      return;
    }
  
    const pendingAction = disambiguation.pendingAction;
    console.log('🎯 PENDING ACTION:', pendingAction);
    
    // Clear disambiguation immediately for better UX
    this.chatPersistence.setDisambiguation(null);
    
    // Add user's choice to chat with more specific information
    let choiceText = '';
    if (this.isListSelection(pendingAction)) {
      choiceText = `Liste gewählt: ${option.displayName}`;
    } else {
      if (option.type === 'existing') {
        choiceText = `Vorhandener Artikel: ${option.displayName}`;
      } else {
        choiceText = `Neuen Artikel erstellen: ${option.displayName}`;
      }
    }
    
    console.log('🎯 CHOICE TEXT:', choiceText);
    this.chatPersistence.addMessage(choiceText, 'user');
    this.isProcessing = true;
  
    // Process the choice with enhanced error handling
    this.aiService.handleDisambiguationChoice(pendingAction, option)
      .then((result: AIExecutionResult) => {
        console.log('🎯 DISAMBIGUATION RESULT:', result);
        this.handleAIResult(result);
      })
      .catch((error: any) => {
        console.error('🎯 DISAMBIGUATION ERROR:', error);
        this.chatPersistence.addMessage(
          `❌ Fehler beim Ausführen der Aktion: ${error.message || 'Unbekannter Fehler'}\n\n💡 Versuche es erneut oder sage "Hilfe".`, 
          'error'
        );
      })
      .finally(() => {
        this.isProcessing = false;
        this.scrollToBottom();
      });
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
// TEXT-TO-SPEECH (ENHANCED WITH DEBUGGING)
// ========================================
private speak(text: string): void {
  if (!this.synthesis) return;
  
  // 🔊 DEBUG: Log what we're trying to speak
  console.log('🔊 SPEAK METHOD CALLED');
  console.log('🔊 ORIGINAL TEXT:', text);
  console.log('🔊 TEXT LENGTH:', text.length);
  console.log('🔊 TEXT SPLIT BY NEWLINES:', text.split('\n'));
  console.log('🔊 FIRST LINE ONLY:', text.split('\n')[0]);
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
  // QUICK COMMANDS
  // ========================================

  /**
   * Add quick commands for common actions
   */
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
   * Enhanced help with context-aware suggestions
   */
  showContextualHelp(): void {
    const hasApiKey = this.aiService.hasApiKey();
    const summary = this.chatPersistence.getChatSummary();
    
    let helpMessage = '🤖 Shoplisl AI Assistant\n\n';
    
    // Context-aware help based on API key status
    if (hasApiKey) {
      helpMessage += '✅ Intelligente Features aktiv\n\n';
      helpMessage += '📝 Verfügbare Befehle:\n\n';
      helpMessage += '• "Füge [Artikel] hinzu"\n  → Fragt nach der Liste wenn nicht angegeben\n\n';
      helpMessage += '• "Füge [Artikel] zu [Liste] hinzu"\n  → Fügt direkt zur spezifizierten Liste hinzu\n\n';
      helpMessage += '• "Erstelle Liste [Name]"\n  → Erstellt eine neue Einkaufsliste\n\n';
      helpMessage += '• "Erstelle Liste [Name] mit [Artikel]"\n  → Neue Liste mit erstem Artikel\n\n';
    } else {
      helpMessage += '⚙️ Basis-Funktionen verfügbar\n\n';
      helpMessage += '💡 Für intelligente Features:\n';
      helpMessage += '"set api key: gsk_YOUR_KEY_HERE"\n\n';
      helpMessage += '📝 Basis-Befehle:\n\n';
      helpMessage += '• "Füge [Artikel] hinzu" - Fragt nach Liste\n';
      helpMessage += '• "Füge [Artikel] zu [Liste] hinzu"\n';
      helpMessage += '• "Erstelle Liste [Name]"\n';
      helpMessage += '• "Test" - System-Status prüfen\n\n';
    }
    
    helpMessage += `📊 Chat Status: ${summary.messageCount} Nachrichten`;
    
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
    
    return `${summary.messageCount} Nachrichten${summary.oldestMessage ? ` seit ${summary.oldestMessage.toLocaleDateString('de-DE')}` : ''} • ${hasApiKey ? '🔑 AI Features aktiv' : '⚙️ Settings für AI Features'}`;
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

  // ========================================
  // TEMPLATE HELPER PROPERTIES & METHODS
  // ========================================
  get aiServicePublic() {
    return this.aiService;
  }

  trackByOptionId(index: number, option: DisambiguationOption): string {
    return option.id;
  }

  // Make Math available in template
  Math = Math;
}