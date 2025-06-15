// src/app/shared/components/voice-ai-assistant/voice-ai-assistant.component.ts
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, Observable } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

// Import services
import { AIService, AIExecutionResult, DisambiguationOption, PendingAction } from '../../../core/services/ai.service';
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
  template: `
    <div class="ai-assistant-container">
      <!-- Header -->
      <mat-toolbar color="primary" class="ai-header">
        <button mat-icon-button (click)="onBack()">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <span>AI Assistent</span>
        <span class="spacer"></span>
        <button mat-icon-button (click)="clearChat()" matTooltip="Chat leeren">
          <mat-icon>clear_all</mat-icon>
        </button>
        <button mat-icon-button (click)="exportChat()" matTooltip="Chat exportieren">
          <mat-icon>download</mat-icon>
        </button>
      </mat-toolbar>

      <!-- Chat Messages -->
      <div class="messages-container" #messagesContainer>
        <!-- Welcome message when empty -->
        <div *ngIf="(messages$ | async)?.length === 0" class="welcome-message">
          <mat-icon class="welcome-icon">psychology</mat-icon>
          <h3>Hallo! Ich bin dein AI Assistent</h3>
          <p>Du kannst mir sagen:</p>
          <ul>
            <li>"Füge 2kg Bananen zu Spar hinzu"</li>
            <li>"Erstelle neue Liste ADEG"</li>
            <li>"API Key setup" (für erweiterte Funktionen)</li>
          </ul>
          <p class="chat-stats">{{ getChatStats() }}</p>
        </div>

        <!-- Chat messages from observable -->
        <div *ngFor="let message of (messages$ | async)" 
             [class]="'message message-' + message.type">
          <div class="message-content">
            <div class="message-text">{{ message.text }}</div>
            <div class="message-time">
              {{ message.timestamp | date:'HH:mm' }}
            </div>
          </div>
        </div>

        <!-- Processing Indicator -->
        <div *ngIf="isProcessing" class="message message-assistant">
          <div class="message-content">
            <mat-spinner diameter="20"></mat-spinner>
            <span class="processing-text">Verarbeite...</span>
          </div>
        </div>
      </div>

      <!-- Enhanced Disambiguation Panel -->
      <div *ngIf="disambiguation$ | async as disambiguation" class="disambiguation-panel">
        <mat-card class="disambiguation-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon color="primary">help_outline</mat-icon>
              Smart Disambiguation
            </mat-card-title>
            <mat-card-subtitle>{{ disambiguation.message }}</mat-card-subtitle>
          </mat-card-header>
          
          <mat-card-content>
            <div class="disambiguation-info">
              <p><strong>Eingabe:</strong> "{{ disambiguation.pendingAction.originalInput }}"</p>
              <p *ngIf="disambiguation.pendingAction.extractedQuantity">
                <strong>Erkannte Menge:</strong> {{ disambiguation.pendingAction.extractedQuantity }}
              </p>
            </div>

            <div class="disambiguation-options">
              <div 
                *ngFor="let option of disambiguation.options; trackBy: trackByOptionId"
                class="disambiguation-option"
                [class.new-option]="option.type === 'new'"
                [class.existing-option]="option.type === 'existing'"
                (click)="selectDisambiguationOption(option)">
                
                <mat-card class="option-card" 
                          [class.new-item-card]="option.type === 'new'"
                          [class.existing-item-card]="option.type === 'existing'">
                  <mat-card-content>
                    <div class="option-header">
                      <div class="option-main">
                        <div class="option-icon-container">
                          <span class="option-icon">{{ option.icon || '📦' }}</span>
                        </div>
                        <div class="option-details">
                          <div class="option-name">{{ option.displayName }}</div>
                          <div class="option-meta">
                            <span class="department-info">
                              <mat-icon class="small-icon">category</mat-icon>
                              {{ getDepartmentName(option.department) }}
                            </span>
                            <span *ngIf="option.article?.amount" class="amount-info">
                              <mat-icon class="small-icon">straighten</mat-icon>
                              {{ option.article.amount }}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div class="option-confidence">
                        <mat-chip 
                          [color]="getConfidenceColor(option.confidence)"
                          [matTooltip]="getConfidenceText(option.confidence)">
                          {{ Math.round(option.confidence * 100) }}%
                        </mat-chip>
                      </div>
                    </div>
                    
                    <div class="option-actions">
                      <span *ngIf="option.type === 'existing'" class="action-hint">
                        <mat-icon class="small-icon">update</mat-icon>
                        Bestehenden Artikel verwenden
                      </span>
                      <span *ngIf="option.type === 'new'" class="action-hint">
                        <mat-icon class="small-icon">add_circle</mat-icon>
                        Neuen Artikel erstellen
                      </span>
                    </div>
                  </mat-card-content>
                </mat-card>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Input Area -->
      <div class="input-area">
        <!-- Voice Recording Overlay -->
        <div *ngIf="isRecording" class="recording-overlay">
          <div class="recording-content">
            <mat-icon class="recording-icon">mic</mat-icon>
            <p>Spreche jetzt...</p>
            <div class="recording-animation">
              <div class="wave"></div>
              <div class="wave"></div>
              <div class="wave"></div>
            </div>
            <button mat-button (click)="stopRecording()">Stoppen</button>
          </div>
        </div>

        <!-- Text Input -->
        <div class="input-controls">
          <mat-form-field appearance="outline" class="message-input">
            <mat-label>Nachricht eingeben...</mat-label>
            <input matInput 
                   [(ngModel)]="currentMessage"
                   (keyup.enter)="sendMessage()"
                   placeholder="z.B. Füge 2kg Bananen hinzu"
                   [disabled]="isProcessing || isRecording">
          </mat-form-field>
          
          <button mat-fab 
                  color="accent"
                  (click)="toggleVoiceInput()"
                  [class.recording]="isRecording"
                  [disabled]="isProcessing"
                  matTooltip="Spracherkennung">
            <mat-icon>{{ isRecording ? 'mic' : 'mic_none' }}</mat-icon>
          </button>
          
          <button mat-fab 
                  color="primary"
                  (click)="sendMessage()"
                  [disabled]="!currentMessage.trim() || isProcessing || isRecording"
                  matTooltip="Senden">
            <mat-icon>send</mat-icon>
          </button>
        </div>


      </div>
    </div>
  `,
  styleUrls: ['./voice-ai-assistant.component.scss']
})
export class VoiceAIAssistantComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  
  // 🔧 FIX: Use observables for persistence
  messages$: Observable<ChatMessage[]>;
  disambiguation$: Observable<any>;
  
  currentMessage = '';
  isProcessing = false;
  isRecording = false;
  
  // Voice recognition
  private recognition: any;
  private synthesis: SpeechSynthesis;
  
  private destroy$ = new Subject<void>();

  constructor(
    private aiService: AIService,
    private chatPersistence: ChatPersistenceService,
    private departmentService: DepartmentService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.synthesis = window.speechSynthesis;
    
    // 🔧 FIX: Subscribe to persistent chat data
    this.messages$ = this.chatPersistence.messages$;
    this.disambiguation$ = this.chatPersistence.disambiguation$;
    
    this.initializeSpeechRecognition();
  }

  ngOnInit(): void {
    // 🔧 FIX: Initialize chat if empty
    this.chatPersistence.initializeIfEmpty();
    
    // Auto-scroll when new messages arrive
    this.messages$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      setTimeout(() => this.scrollToBottom(), 100);
    });
    
    // Log chat status for debugging
    const summary = this.chatPersistence.getChatSummary();
    console.log('💬 Chat loaded:', summary);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopRecording();
  }

  onBack(): void {
    this.router.navigate(['/lists']);
  }

  clearChat(): void {
    this.chatPersistence.clearMessages();
    this.chatPersistence.initializeIfEmpty();
    this.snackBar.open('Chat geleert', '', { duration: 1500 });
  }

  async sendMessage(): Promise<void> {
    if (!this.currentMessage.trim() || this.isProcessing) return;

    const userMessage = this.currentMessage.trim();
    
    // 🔧 FIX: Use persistence service
    this.chatPersistence.addMessage(userMessage, 'user');
    this.currentMessage = '';
    this.isProcessing = true;

    try {
      console.log('🔍 Calling AI service with:', userMessage);
      const result = await this.aiService.executeCommand(userMessage);
      console.log('🔍 AI service result:', result);
      
      await this.handleAIResult(result);
    } catch (error) {
      console.error('AI error:', error);
      this.chatPersistence.addMessage('Entschuldigung, ein Fehler ist aufgetreten.', 'error');
    } finally {
      this.isProcessing = false;
      this.scrollToBottom();
    }
  }

  sendQuickMessage(message: string): void {
    this.currentMessage = message;
    this.sendMessage();
  }

  toggleVoiceInput(): void {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startVoiceRecording();
    }
  }

  selectDisambiguationOption(option: DisambiguationOption): void {
    // Get current disambiguation state
    const disambiguation = this.chatPersistence.getDisambiguation();
    if (!disambiguation) return;

    const pendingAction = disambiguation.pendingAction;
    
    // Clear disambiguation state
    this.chatPersistence.setDisambiguation(null);

    // Add user choice as message
    this.chatPersistence.addMessage(`Ausgewählt: ${option.displayName}`, 'user');
    this.isProcessing = true;

    this.aiService.handleDisambiguationChoice(pendingAction, option)
      .then((result: any) => this.handleAIResult(result))
      .catch((error: any) => {
        console.error('Disambiguation error:', error);
        this.chatPersistence.addMessage('Fehler beim Ausführen der Aktion.', 'error');
      })
      .finally(() => {
        this.isProcessing = false;
        this.scrollToBottom();
      });
  }

  private initializeSpeechRecognition(): void {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'de-DE';
      
      this.recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        this.currentMessage = transcript;
        this.isRecording = false;
        
        // Automatically send the voice message
        setTimeout(() => {
          this.sendMessage();
        }, 500);
      };

      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        this.isRecording = false;
        
        let errorMessage = 'Spracherkennung fehlgeschlagen.';
        if (event.error === 'no-speech') {
          errorMessage = 'Keine Sprache erkannt. Versuche es erneut.';
        } else if (event.error === 'not-allowed') {
          errorMessage = 'Mikrofon-Berechtigung erforderlich.';
        }
        
        this.snackBar.open(errorMessage, 'OK', { duration: 3000 });
      };

      this.recognition.onend = () => {
        this.isRecording = false;
      };
    } else {
      console.warn('Speech recognition not supported');
    }
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

  private async handleAIResult(result: AIExecutionResult): Promise<void> {
    // 🔧 FIX: Use persistence service for messages
    this.chatPersistence.addMessage(result.message, result.success ? 'assistant' : 'error');

    // 🔧 FIX: Handle disambiguation with persistence
    if (result.needsUserInput && result.disambiguationOptions && result.pendingAction) {
      this.chatPersistence.setDisambiguation({
        message: result.message,
        options: result.disambiguationOptions,
        pendingAction: result.pendingAction
      });
    }

    if (result.success && result.listId) {
      // Optional: Speak the response
      this.speak(result.message.split('\n')[0]); // Speak only first line
      
      // Navigate to list after delay
      setTimeout(() => {
        this.router.navigate(['/lists', result.listId]);
      }, 2000);
    }

    if (result.suggestedAction === 'CREATE_LIST' && result.suggestedData) {
      this.chatPersistence.addMessage(`Tipp: Sage "Erstelle Liste ${result.suggestedData.listName}" um sie anzulegen.`, 'system');
    }
  }

  private speak(text: string): void {
    if (!this.synthesis) return;
    
    // Cancel any ongoing speech
    this.synthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.9;
    utterance.volume = 0.8;
    
    this.synthesis.speak(utterance);
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  // 🔧 FIX: Additional methods for chat management
  exportChat(): void {
    const chatHistory = this.chatPersistence.exportChatHistory();
    
    // Create downloadable file
    const blob = new Blob([chatHistory], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shoplisl-chat-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    this.snackBar.open('Chat exportiert', '', { duration: 1500 });
  }

  getChatStats(): string {
    const summary = this.chatPersistence.getChatSummary();
    return `${summary.messageCount} Nachrichten${summary.oldestMessage ? ` seit ${summary.oldestMessage.toLocaleDateString('de-DE')}` : ''}`;
  }

  // 🎯 Enhanced disambiguation helper methods
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

  // TrackBy function for disambiguation options
  trackByOptionId(index: number, option: DisambiguationOption): string {
    return option.id;
  }

  // Round function for template
  Math = Math;
}