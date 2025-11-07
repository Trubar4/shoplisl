/**
 * Voice Input Service
 *
 * Handles speech recognition and microphone input for the voice assistant.
 * Manages the lifecycle of speech recognition, microphone permissions,
 * and recording state.
 *
 * @responsibility Voice input and speech recognition
 * @pattern Service-based architecture with Observable streams
 */

import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface VoiceRecognitionResult {
  transcript: string;
  timestamp: Date;
}

export interface VoiceRecognitionError {
  error: string;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class VoiceInputService {

  // State observables
  private readonly _isRecording$ = new BehaviorSubject<boolean>(false);
  private readonly _voiceResult$ = new Subject<VoiceRecognitionResult>();
  private readonly _voiceError$ = new Subject<VoiceRecognitionError>();

  // Public observables
  public readonly isRecording$ = this._isRecording$.asObservable();
  public readonly voiceResult$ = this._voiceResult$.asObservable();
  public readonly voiceError$ = this._voiceError$.asObservable();

  // Speech recognition instance
  private recognition: any = null;
  private isInitialized = false;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.initialize();
  }

  /**
   * Initialize speech recognition if supported
   */
  private initialize(): void {
    if (!isPlatformBrowser(this.platformId)) {
      console.warn('Voice input not available in non-browser environment');
      return;
    }

    if (!this.isSpeechRecognitionSupported()) {
      console.warn('Speech recognition not supported in this browser');
      return;
    }

    const SpeechRecognition = this.getSpeechRecognitionClass();
    this.recognition = new SpeechRecognition();
    this.configureRecognition();
    this.isInitialized = true;
  }

  /**
   * Check if speech recognition is supported in the browser
   */
  public isSpeechRecognitionSupported(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }

  /**
   * Get the speech recognition class (handles browser prefixes)
   */
  private getSpeechRecognitionClass(): any {
    return (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
  }

  /**
   * Configure speech recognition settings and event handlers
   */
  private configureRecognition(): void {
    if (!this.recognition) return;

    // Configuration
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'de-DE';

    // Result handler
    this.recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      console.log('🎤 Voice input received:', transcript);

      this._isRecording$.next(false);
      this._voiceResult$.next({
        transcript,
        timestamp: new Date()
      });
    };

    // Error handler
    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      this._isRecording$.next(false);

      const errorMessage = this.getErrorMessage(event.error);
      this._voiceError$.next({
        error: event.error,
        message: errorMessage
      });
    };

    // End handler
    this.recognition.onend = () => {
      this._isRecording$.next(false);
    };
  }

  /**
   * Get user-friendly error message based on error type
   */
  private getErrorMessage(error: string): string {
    switch (error) {
      case 'no-speech':
        return 'Keine Sprache erkannt. Versuche es erneut.';
      case 'not-allowed':
        return 'Mikrofon-Berechtigung erforderlich.';
      case 'network':
        return 'Netzwerkfehler bei der Spracherkennung.';
      case 'aborted':
        return 'Spracherkennung abgebrochen.';
      default:
        return 'Spracherkennung fehlgeschlagen.';
    }
  }

  /**
   * Start voice recording
   * @returns true if recording started successfully, false otherwise
   */
  public startRecording(): boolean {
    if (!this.isInitialized || !this.recognition) {
      this._voiceError$.next({
        error: 'not-supported',
        message: 'Spracherkennung nicht unterstützt'
      });
      return false;
    }

    if (this._isRecording$.value) {
      console.warn('Already recording');
      return false;
    }

    try {
      this.recognition.start();
      this._isRecording$.next(true);
      console.log('🎤 Voice recording started');
      return true;
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      this._voiceError$.next({
        error: 'start-failed',
        message: 'Spracherkennung konnte nicht gestartet werden'
      });
      return false;
    }
  }

  /**
   * Stop voice recording
   */
  public stopRecording(): void {
    if (!this.recognition || !this._isRecording$.value) {
      return;
    }

    try {
      this.recognition.stop();
      this._isRecording$.next(false);
      console.log('🎤 Voice recording stopped');
    } catch (error) {
      console.error('Failed to stop speech recognition:', error);
      this._isRecording$.next(false);
    }
  }

  /**
   * Toggle recording on/off
   * @returns true if now recording, false if stopped
   */
  public toggleRecording(): boolean {
    if (this._isRecording$.value) {
      this.stopRecording();
      return false;
    } else {
      return this.startRecording();
    }
  }

  /**
   * Check microphone permission
   * @returns Observable that emits true if permission granted, false otherwise
   */
  public checkMicrophonePermission(): Observable<boolean> {
    return new Observable(observer => {
      if (!isPlatformBrowser(this.platformId)) {
        observer.next(false);
        observer.complete();
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        observer.next(false);
        observer.complete();
        return;
      }

      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
          observer.next(true);
          observer.complete();
        })
        .catch(error => {
          console.error('Microphone permission denied:', error);
          observer.next(false);
          observer.complete();
        });
    });
  }

  /**
   * Get current recording state
   */
  public isRecording(): boolean {
    return this._isRecording$.value;
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stopRecording();

    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
    }
  }
}
