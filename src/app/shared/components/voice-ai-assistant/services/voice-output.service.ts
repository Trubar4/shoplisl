/**
 * Voice Output Service
 *
 * Handles speech synthesis and audio feedback for the voice assistant.
 * Manages text-to-speech output, voice queue, and speaking state.
 *
 * @responsibility Voice output and speech synthesis
 * @pattern Service-based architecture with Observable streams
 */

import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class VoiceOutputService {

  // State observables
  private readonly _isSpeaking$ = new BehaviorSubject<boolean>(false);

  // Public observables
  public readonly isSpeaking$ = this._isSpeaking$.asObservable();

  // Speech synthesis instance
  private synthesis: SpeechSynthesis | null = null;
  private isInitialized = false;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.initialize();
  }

  /**
   * Initialize speech synthesis if supported
   */
  private initialize(): void {
    if (!isPlatformBrowser(this.platformId)) {
      console.warn('Voice output not available in non-browser environment');
      return;
    }

    if (!this.isSpeechSynthesisSupported()) {
      console.warn('Speech synthesis not supported in this browser');
      return;
    }

    this.synthesis = window.speechSynthesis;
    this.isInitialized = true;
  }

  /**
   * Check if speech synthesis is supported in the browser
   */
  public isSpeechSynthesisSupported(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return 'speechSynthesis' in window;
  }

  /**
   * Speak the given text using speech synthesis
   * @param text The text to speak
   * @param options Optional speech synthesis options
   */
  public speak(text: string, options?: SpeechSynthesisOptions): void {
    if (!this.isInitialized || !this.synthesis) {
      console.warn('Speech synthesis not available');
      return;
    }

    if (this._isSpeaking$.value) {
      console.log('Already speaking, ignoring request');
      return;
    }

    // Cancel any existing speech
    this.cancel();

    // Clean the text
    const cleanText = this.cleanText(text);
    if (!cleanText) {
      console.warn('No text to speak after cleaning');
      return;
    }

    // Create utterance
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = options?.lang || 'de-DE';
    utterance.rate = options?.rate || 0.9;
    utterance.volume = options?.volume || 0.8;
    utterance.pitch = options?.pitch || 1.0;

    // Set up event handlers
    utterance.onstart = () => {
      this._isSpeaking$.next(true);
      console.log('🔊 Speech started:', cleanText.substring(0, 50));
    };

    utterance.onend = () => {
      this._isSpeaking$.next(false);
      console.log('🔊 Speech ended');
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      this._isSpeaking$.next(false);
    };

    // Start speaking
    this.synthesis.speak(utterance);
  }

  /**
   * Cancel any ongoing speech
   */
  public cancel(): void {
    if (!this.synthesis) return;

    try {
      this.synthesis.cancel();
      this._isSpeaking$.next(false);
      console.log('🔊 Speech cancelled');
    } catch (error) {
      console.error('Failed to cancel speech:', error);
    }
  }

  /**
   * Check if currently speaking
   */
  public isSpeaking(): boolean {
    return this._isSpeaking$.value;
  }

  /**
   * Clean text for speech synthesis
   * Removes emojis, takes first line only, trims whitespace
   */
  private cleanText(text: string): string {
    return text
      .split('\n')[0] // Take first line only
      .replace(/[✅❌🎯💡📝🛒🔑⚖️🎨📋🍳⏭️➕]/g, '') // Remove emojis
      .replace(/[👍👎🎉🔥💪🏆]/g, '') // Remove more emojis
      .trim();
  }

  /**
   * Get list of available voices
   * @returns Array of available SpeechSynthesisVoice objects
   */
  public getAvailableVoices(): SpeechSynthesisVoice[] {
    if (!this.synthesis) return [];
    return this.synthesis.getVoices();
  }

  /**
   * Get German voices if available
   */
  public getGermanVoices(): SpeechSynthesisVoice[] {
    return this.getAvailableVoices().filter(voice =>
      voice.lang.startsWith('de')
    );
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.cancel();
  }
}

/**
 * Options for speech synthesis
 */
export interface SpeechSynthesisOptions {
  lang?: string;
  rate?: number;  // 0.1 to 10
  volume?: number; // 0 to 1
  pitch?: number;  // 0 to 2
  voice?: SpeechSynthesisVoice;
}
