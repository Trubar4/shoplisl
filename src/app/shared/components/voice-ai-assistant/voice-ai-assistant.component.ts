// src/app/shared/components/voice-ai-assistant/voice-ai-assistant.component.ts
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
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

// Uncomment AI service import
import { AIService, AIExecutionResult, DisambiguationOption, PendingAction } from '../../../core/services/ai.service';

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
    MatDialogModule
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
        <button mat-icon-button (click)="clearChat()">
          <mat-icon>clear_all</mat-icon>
        </button>
      </mat-toolbar>

      <!-- Chat Messages -->
      <div class="messages-container" #messagesContainer>
        <div *ngIf="messages.length === 0" class="welcome-message">
          <mat-icon class="welcome-icon">psychology</mat-icon>
          <h3>Hallo! Ich bin dein AI Assistent</h3>
          <p>Du kannst mir sagen:</p>
          <ul>
            <li>"Füge Bananen und Brot zu Spar hinzu"</li>
            <li>"Erstelle neue Liste ADEG"</li>
            <li>"Hilfe"</li>
          </ul>
        </div>

        <div *ngFor="let message of messages" 
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

      <!-- Disambiguation Dialog -->
      <div *ngIf="pendingDisambiguation" class="disambiguation-panel">
        <mat-card>
          <mat-card-content>
            <p><strong>{{ pendingDisambiguation.message }}</strong></p>
            <div class="disambiguation-options">
              <button *ngFor="let option of pendingDisambiguation.options"
                      mat-raised-button
                      color="primary"
                      (click)="selectDisambiguationOption(option)"
                      class="option-button">
                ({{ option.option }}) {{ option.label }}
              </button>
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
                   placeholder="z.B. Füge Bananen zu Spar hinzu"
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

        <!-- Quick Actions -->
        <div class="quick-actions">
          <button mat-stroked-button 
                  (click)="sendQuickMessage('Hilfe')"
                  [disabled]="isProcessing">
            <mat-icon>help</mat-icon>
            Hilfe
          </button>
          <button mat-stroked-button 
                  (click)="sendQuickMessage('Zeige meine Listen')"
                  [disabled]="isProcessing">
            <mat-icon>list</mat-icon>
            Meine Listen
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./voice-ai-assistant.component.scss']
})
export class VoiceAIAssistantComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  
  messages: ChatMessage[] = [];
  currentMessage = '';
  isProcessing = false;
  isRecording = false;
  
  // Voice recognition
  private recognition: any;
  private synthesis: SpeechSynthesis;
  
  // Disambiguation state
  pendingDisambiguation: {
    message: string;
    options: DisambiguationOption[];
    pendingAction: PendingAction;
  } | null = null;
  
  private destroy$ = new Subject<void>();

  constructor(
    private aiService: AIService,  // ✅ Uncomment this
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.synthesis = window.speechSynthesis;
    this.initializeSpeechRecognition();
  }

  ngOnInit(): void {
    // Add welcome message
    this.addSystemMessage('Willkommen! Sage mir, was ich für dich tun kann.');
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
    this.messages = [];
    this.pendingDisambiguation = null;
    this.addSystemMessage('Chat geleert. Wie kann ich dir helfen?');
  }

  async sendMessage(): Promise<void> {
    if (!this.currentMessage.trim() || this.isProcessing) return;

    const userMessage = this.currentMessage.trim();
    this.addMessage(userMessage, 'user');
    this.currentMessage = '';
    this.isProcessing = true;

    try {
      console.log('🔍 Calling AI service with:', userMessage);
      const result = await this.aiService.executeCommand(userMessage);
      console.log('🔍 AI service result:', result);
      
      await this.handleAIResult(result);
    } catch (error) {
      console.error('AI error:', error);
      this.addMessage('Entschuldigung, ein Fehler ist aufgetreten.', 'error');
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
    if (!this.pendingDisambiguation) return;

    const pendingAction = this.pendingDisambiguation.pendingAction;
    this.pendingDisambiguation = null;

    this.addMessage(`(${option.option}) ${option.label}`, 'user');
    this.isProcessing = true;

    this.aiService.handleDisambiguationChoice(pendingAction, option)
      .then((result: any) => this.handleAIResult(result))
      .catch((error: any) => {
        console.error('Disambiguation error:', error);
        this.addMessage('Fehler beim Ausführen der Aktion.', 'error');
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
    this.addMessage(result.message, result.success ? 'assistant' : 'error');

    if (result.needsUserInput && result.disambiguationOptions && result.pendingAction) {
      this.pendingDisambiguation = {
        message: result.message,
        options: result.disambiguationOptions,
        pendingAction: result.pendingAction
      };
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
      this.addSystemMessage(`Tipp: Sage "Erstelle Liste ${result.suggestedData.listName}" um sie anzulegen.`);
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

  private addMessage(text: string, type: 'user' | 'assistant' | 'error'): void {
    this.messages.push({
      text,
      type,
      timestamp: new Date()
    });
    
    setTimeout(() => this.scrollToBottom(), 100);
  }

  private addSystemMessage(text: string): void {
    this.messages.push({
      text,
      type: 'system',
      timestamp: new Date()
    });
    
    setTimeout(() => this.scrollToBottom(), 100);
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }
}