/**
 * Voice Output Service Tests
 *
 * Comprehensive test coverage for voice output functionality including:
 * - Speech synthesis lifecycle
 * - Text cleaning and formatting
 * - Cancel and cleanup operations
 * - Browser compatibility
 */

import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { VoiceOutputService } from './voice-output.service';
import { firstValueFrom } from 'rxjs';

describe('VoiceOutputService', () => {
  let service: VoiceOutputService;
  let mockSynthesis: any;
  let capturedUtterance: SpeechSynthesisUtterance | null;

  beforeEach(() => {
    capturedUtterance = null;

    // Mock SpeechSynthesis
    mockSynthesis = {
      speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
        capturedUtterance = utterance;
        // Simulate async start
        setTimeout(() => {
          if (utterance.onstart) utterance.onstart(new Event('start'));
        }, 0);
      }),
      cancel: vi.fn(),
      getVoices: vi.fn(() => [
        { lang: 'de-DE', name: 'German Voice 1', default: true, localService: true, voiceURI: 'de-1' },
        { lang: 'en-US', name: 'English Voice', default: false, localService: true, voiceURI: 'en-1' },
        { lang: 'de-AT', name: 'German Voice 2', default: false, localService: true, voiceURI: 'de-2' }
      ] as SpeechSynthesisVoice[]),
      speaking: false,
      pending: false,
      paused: false
    };

    // Mock SpeechSynthesisUtterance
    (global as any).SpeechSynthesisUtterance = class {
      text: string = '';
      lang: string = '';
      rate: number = 1;
      volume: number = 1;
      pitch: number = 1;
      voice: any = null;
      onstart: ((event: any) => void) | null = null;
      onend: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    };

    // Setup window mock
    Object.defineProperty(window, 'speechSynthesis', {
      value: mockSynthesis,
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    delete (window as any).speechSynthesis;
  });

  describe('Initialization', () => {
    it('should be created', () => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);
      expect(service).toBeTruthy();
    });

    it('should initialize speech synthesis on browser platform', () => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);
      expect(service.isSpeechSynthesisSupported()).toBe(true);
    });

    it('should not initialize on server platform', () => {
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'server' }]
      });
      service = TestBed.inject(VoiceOutputService);
      expect(service.isSpeechSynthesisSupported()).toBe(false);
    });

    it('should handle missing speech synthesis gracefully', () => {
      delete (window as any).speechSynthesis;

      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);

      expect(service.isSpeechSynthesisSupported()).toBe(false);
      expect(() => service.speak('test')).not.toThrow();
    });
  });

  describe('Browser Support Detection', () => {
    it('should detect speech synthesis support', () => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);
      expect(service.isSpeechSynthesisSupported()).toBe(true);
    });

    it('should return false when speech synthesis not supported', () => {
      delete (window as any).speechSynthesis;

      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);
      expect(service.isSpeechSynthesisSupported()).toBe(false);
    });
  });

  describe('Speaking Functionality', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);
    });

    it('should speak text successfully', async () => {
      service.speak('Hallo Welt');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSynthesis.speak).toHaveBeenCalled();
      expect(capturedUtterance).not.toBeNull();
      expect(capturedUtterance?.text).toBe('Hallo Welt');
    });

    it('should use default German locale', async () => {
      service.speak('Test');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(capturedUtterance?.lang).toBe('de-DE');
    });

    it('should use custom options when provided', async () => {
      service.speak('Test', {
        lang: 'en-US',
        rate: 1.2,
        volume: 0.5,
        pitch: 1.5
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(capturedUtterance?.lang).toBe('en-US');
      expect(capturedUtterance?.rate).toBe(1.2);
      expect(capturedUtterance?.volume).toBe(0.5);
      expect(capturedUtterance?.pitch).toBe(1.5);
    });

    it('should clean text before speaking', async () => {
      service.speak('✅ Success! 🎉\nNext line');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(capturedUtterance?.text).toBe('Success!');
      expect(capturedUtterance?.text).not.toContain('✅');
      expect(capturedUtterance?.text).not.toContain('🎉');
      expect(capturedUtterance?.text).not.toContain('Next line');
    });

    it('should not speak if already speaking', async () => {
      service.speak('First message');
      await new Promise(resolve => setTimeout(resolve, 10));

      vi.clearAllMocks();

      service.speak('Second message');

      expect(mockSynthesis.speak).not.toHaveBeenCalled();
    });

    it('should update speaking state observable', async () => {
      const speakingPromise = firstValueFrom(service.isSpeaking$);

      service.speak('Test');
      await new Promise(resolve => setTimeout(resolve, 10));

      const isSpeaking = await speakingPromise;
      expect(isSpeaking).toBe(true);
    });

    it('should handle empty text after cleaning', () => {
      service.speak('✅🎉');

      expect(mockSynthesis.speak).not.toHaveBeenCalled();
    });

    it('should cancel existing speech before speaking', async () => {
      service.speak('Test');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSynthesis.cancel).toHaveBeenCalled();
    });
  });

  describe('Text Cleaning', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);
    });

    it('should remove common emojis', async () => {
      service.speak('✅ Success ❌ Error 🎯 Target');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(capturedUtterance?.text).not.toContain('✅');
      expect(capturedUtterance?.text).not.toContain('❌');
      expect(capturedUtterance?.text).not.toContain('🎯');
    });

    it('should take only first line', async () => {
      service.speak('First line\nSecond line\nThird line');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(capturedUtterance?.text).toBe('First line');
    });

    it('should trim whitespace', async () => {
      service.speak('  Test message  ');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(capturedUtterance?.text).toBe('Test message');
    });

    it('should handle text with multiple spaces', async () => {
      service.speak('Multiple    spaces');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(capturedUtterance?.text).toBe('Multiple    spaces');
    });
  });

  describe('Cancel Functionality', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);
    });

    it('should cancel ongoing speech', () => {
      service.cancel();

      expect(mockSynthesis.cancel).toHaveBeenCalled();
    });

    it('should update speaking state when cancelled', async () => {
      service.speak('Test');
      await new Promise(resolve => setTimeout(resolve, 10));

      service.cancel();

      expect(service.isSpeaking()).toBe(false);
    });

    it('should handle cancel errors gracefully', () => {
      mockSynthesis.cancel.mockImplementation(() => {
        throw new Error('Cancel failed');
      });

      expect(() => service.cancel()).not.toThrow();
    });

    it('should handle cancel when synthesis not initialized', () => {
      delete (window as any).speechSynthesis;

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);

      expect(() => service.cancel()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);
    });

    it('should handle speech synthesis errors', async () => {
      service.speak('Test');

      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate error
      if (capturedUtterance?.onerror) {
        capturedUtterance.onerror(new Event('error'));
      }

      expect(service.isSpeaking()).toBe(false);
    });

    it('should update state on speech end', async () => {
      service.speak('Test');

      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate end
      if (capturedUtterance?.onend) {
        capturedUtterance.onend(new Event('end'));
      }

      expect(service.isSpeaking()).toBe(false);
    });
  });

  describe('Voice Management', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);
    });

    it('should get available voices', () => {
      const voices = service.getAvailableVoices();

      expect(voices.length).toBe(3);
      expect(voices[0].lang).toBe('de-DE');
    });

    it('should filter German voices', () => {
      const germanVoices = service.getGermanVoices();

      expect(germanVoices.length).toBe(2);
      expect(germanVoices.every(v => v.lang.startsWith('de'))).toBe(true);
    });

    it('should return empty array when synthesis not available', () => {
      delete (window as any).speechSynthesis;

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);

      expect(service.getAvailableVoices()).toEqual([]);
      expect(service.getGermanVoices()).toEqual([]);
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);
    });

    it('should expose isSpeaking observable', async () => {
      const isSpeaking = await firstValueFrom(service.isSpeaking$);
      expect(typeof isSpeaking).toBe('boolean');
    });

    it('should provide isSpeaking() method', () => {
      expect(service.isSpeaking()).toBe(false);
    });

    it('should update state through observable', async () => {
      let stateChanges: boolean[] = [];

      service.isSpeaking$.subscribe(speaking => {
        stateChanges.push(speaking);
      });

      service.speak('Test');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(stateChanges).toContain(true);
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);
    });

    it('should cleanup and cancel speech', () => {
      service.speak('Test');
      service.cleanup();

      expect(mockSynthesis.cancel).toHaveBeenCalled();
    });

    it('should handle cleanup when not speaking', () => {
      expect(() => service.cleanup()).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceOutputService);
    });

    it('should handle very long text', async () => {
      const longText = 'A'.repeat(1000);
      service.speak(longText);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSynthesis.speak).toHaveBeenCalled();
      expect(capturedUtterance?.text.length).toBe(1000);
    });

    it('should handle special characters', async () => {
      service.speak('Spëcîål chäräctërs: €£¥');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(capturedUtterance?.text).toContain('Spëcîål');
      expect(capturedUtterance?.text).toContain('€£¥');
    });

    it('should handle newlines at different positions', async () => {
      service.speak('Line 1\n\nLine 3');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(capturedUtterance?.text).toBe('Line 1');
    });

    it('should handle multiple consecutive emojis', async () => {
      service.speak('✅✅✅ Test');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(capturedUtterance?.text).toBe('Test');
    });
  });
});
