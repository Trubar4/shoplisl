/**
 * Voice Input Service Tests
 *
 * Comprehensive test coverage for voice input functionality including:
 * - Speech recognition lifecycle
 * - Permission handling
 * - Error cases
 * - Browser compatibility
 */

import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { VoiceInputService, VoiceRecognitionResult, VoiceRecognitionError } from './voice-input.service';
import { firstValueFrom, take } from 'rxjs';

describe('VoiceInputService', () => {
  let service: VoiceInputService;
  let mockRecognition: any;
  let mockMediaDevices: any;

  beforeEach(() => {
    // Mock SpeechRecognition
    mockRecognition = {
      continuous: false,
      interimResults: false,
      lang: '',
      onresult: null,
      onerror: null,
      onend: null,
      start: vi.fn(),
      stop: vi.fn()
    };

    // Mock MediaDevices for permission checks
    mockMediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(undefined)
    };

    // Setup window mocks
    (window as any).webkitSpeechRecognition = vi.fn().mockReturnValue(mockRecognition);

    Object.defineProperty(navigator, 'mediaDevices', {
      value: mockMediaDevices,
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    delete (window as any).webkitSpeechRecognition;
    delete (window as any).SpeechRecognition;
  });

  describe('Initialization', () => {
    it('should be created', () => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);
      expect(service).toBeTruthy();
    });

    it('should initialize speech recognition on browser platform', () => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);
      expect((window as any).webkitSpeechRecognition).toHaveBeenCalled();
    });

    it('should not initialize on server platform', () => {
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'server' }]
      });
      service = TestBed.inject(VoiceInputService);
      expect(service.isSpeechRecognitionSupported()).toBe(false);
    });

    it('should configure recognition with correct settings', () => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);

      expect(mockRecognition.continuous).toBe(false);
      expect(mockRecognition.interimResults).toBe(false);
      expect(mockRecognition.lang).toBe('de-DE');
      expect(mockRecognition.onresult).toBeDefined();
      expect(mockRecognition.onerror).toBeDefined();
      expect(mockRecognition.onend).toBeDefined();
    });
  });

  describe('Browser Support Detection', () => {
    it('should detect webkit speech recognition support', () => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);
      expect(service.isSpeechRecognitionSupported()).toBe(true);
    });

    it('should detect standard speech recognition support', () => {
      delete (window as any).webkitSpeechRecognition;
      (window as any).SpeechRecognition = vi.fn().mockReturnValue(mockRecognition);

      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);
      expect(service.isSpeechRecognitionSupported()).toBe(true);
    });

    it('should return false when speech recognition is not supported', () => {
      delete (window as any).webkitSpeechRecognition;

      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);
      expect(service.isSpeechRecognitionSupported()).toBe(false);
    });
  });

  describe('Recording Lifecycle', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);
    });

    it('should start recording successfully', async () => {
      const isRecordingPromise = firstValueFrom(
        service.isRecording$.pipe(take(1))
      );

      const result = service.startRecording();
      expect(result).toBe(true);

      const isRecording = await isRecordingPromise;
      expect(isRecording).toBe(true);
      expect(mockRecognition.start).toHaveBeenCalled();
      expect(service.isRecording()).toBe(true);
    });

    it('should stop recording successfully', async () => {
      service.startRecording();
      service.stopRecording();

      expect(mockRecognition.stop).toHaveBeenCalled();
    });

    it('should toggle recording from off to on', () => {
      const result = service.toggleRecording();
      expect(result).toBe(true);
      expect(service.isRecording()).toBe(true);
    });

    it('should toggle recording from on to off', () => {
      service.startRecording();
      const result = service.toggleRecording();
      expect(result).toBe(false);
      expect(service.isRecording()).toBe(false);
    });

    it('should not start recording if already recording', () => {
      service.startRecording();
      vi.clearAllMocks();

      const result = service.startRecording();
      expect(result).toBe(false);
      expect(mockRecognition.start).not.toHaveBeenCalled();
    });

    it('should handle start failure gracefully', async () => {
      mockRecognition.start.mockImplementation(() => {
        throw new Error('Start failed');
      });

      const errorPromise = firstValueFrom(service.voiceError$);

      const result = service.startRecording();
      expect(result).toBe(false);

      const error = await errorPromise;
      expect(error.error).toBe('start-failed');
      expect(error.message).toContain('konnte nicht gestartet werden');
    });
  });

  describe('Voice Recognition Results', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);
    });

    it('should emit voice result on successful recognition', async () => {
      const resultPromise = firstValueFrom(service.voiceResult$);

      service.startRecording();

      // Simulate recognition result
      const mockEvent = {
        results: [[{ transcript: 'Hallo Welt' }]]
      };
      mockRecognition.onresult(mockEvent);

      const result = await resultPromise;
      expect(result.transcript).toBe('Hallo Welt');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should update recording state when result received', async () => {
      service.startRecording();

      const mockEvent = {
        results: [[{ transcript: 'Test' }]]
      };
      mockRecognition.onresult(mockEvent);

      expect(service.isRecording()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);
    });

    it('should handle no-speech error', async () => {
      const errorPromise = firstValueFrom(service.voiceError$);

      service.startRecording();
      mockRecognition.onerror({ error: 'no-speech' });

      const error = await errorPromise;
      expect(error.error).toBe('no-speech');
      expect(error.message).toContain('Keine Sprache erkannt');
    });

    it('should handle not-allowed error (permission denied)', async () => {
      const errorPromise = firstValueFrom(service.voiceError$);

      service.startRecording();
      mockRecognition.onerror({ error: 'not-allowed' });

      const error = await errorPromise;
      expect(error.error).toBe('not-allowed');
      expect(error.message).toContain('Mikrofon-Berechtigung erforderlich');
    });

    it('should handle network error', async () => {
      const errorPromise = firstValueFrom(service.voiceError$);

      service.startRecording();
      mockRecognition.onerror({ error: 'network' });

      const error = await errorPromise;
      expect(error.error).toBe('network');
      expect(error.message).toContain('Netzwerkfehler');
    });

    it('should handle aborted error', async () => {
      const errorPromise = firstValueFrom(service.voiceError$);

      service.startRecording();
      mockRecognition.onerror({ error: 'aborted' });

      const error = await errorPromise;
      expect(error.error).toBe('aborted');
      expect(error.message).toContain('abgebrochen');
    });

    it('should handle unknown errors', async () => {
      const errorPromise = firstValueFrom(service.voiceError$);

      service.startRecording();
      mockRecognition.onerror({ error: 'unknown' });

      const error = await errorPromise;
      expect(error.error).toBe('unknown');
      expect(error.message).toContain('fehlgeschlagen');
    });

    it('should update recording state on error', async () => {
      service.startRecording();
      mockRecognition.onerror({ error: 'no-speech' });

      expect(service.isRecording()).toBe(false);
    });

    it('should emit error when recognition not supported', async () => {
      delete (window as any).webkitSpeechRecognition;

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);

      const errorPromise = firstValueFrom(service.voiceError$);
      service.startRecording();

      const error = await errorPromise;
      expect(error.error).toBe('not-supported');
      expect(error.message).toContain('nicht unterstützt');
    });
  });

  describe('Microphone Permissions', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);
    });

    it('should check microphone permission successfully', async () => {
      const hasPermission = await firstValueFrom(service.checkMicrophonePermission());
      expect(hasPermission).toBe(true);
      expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it('should handle permission denial', async () => {
      mockMediaDevices.getUserMedia.mockRejectedValue(new Error('Permission denied'));

      const hasPermission = await firstValueFrom(service.checkMicrophonePermission());
      expect(hasPermission).toBe(false);
    });

    it('should return false when mediaDevices not available', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: undefined,
        writable: true,
        configurable: true
      });

      const hasPermission = await firstValueFrom(service.checkMicrophonePermission());
      expect(hasPermission).toBe(false);
    });

    it('should return false on server platform', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'server' }]
      });
      service = TestBed.inject(VoiceInputService);

      const hasPermission = await firstValueFrom(service.checkMicrophonePermission());
      expect(hasPermission).toBe(false);
    });
  });

  describe('Recognition End Event', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);
    });

    it('should update recording state when recognition ends', () => {
      service.startRecording();
      mockRecognition.onend();

      expect(service.isRecording()).toBe(false);
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);
    });

    it('should stop recording on cleanup', () => {
      service.startRecording();
      service.cleanup();

      expect(mockRecognition.stop).toHaveBeenCalled();
      expect(service.isRecording()).toBe(false);
    });

    it('should clear event handlers on cleanup', () => {
      service.cleanup();

      expect(mockRecognition.onresult).toBeNull();
      expect(mockRecognition.onerror).toBeNull();
      expect(mockRecognition.onend).toBeNull();
    });

    it('should handle cleanup when not recording', () => {
      expect(() => service.cleanup()).not.toThrow();
    });
  });

  describe('Observable Streams', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);
    });

    it('should expose isRecording observable', async () => {
      const isRecording = await firstValueFrom(service.isRecording$);
      expect(typeof isRecording).toBe('boolean');
    });

    it('should expose voiceResult observable', async () => {
      const resultPromise = firstValueFrom(service.voiceResult$);

      service.startRecording();
      mockRecognition.onresult({
        results: [[{ transcript: 'Test' }]]
      });

      const result = await resultPromise;
      expect(result).toBeDefined();
      expect(result.transcript).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should expose voiceError observable', async () => {
      const errorPromise = firstValueFrom(service.voiceError$);

      service.startRecording();
      mockRecognition.onerror({ error: 'test-error' });

      const error = await errorPromise;
      expect(error).toBeDefined();
      expect(error.error).toBeDefined();
      expect(error.message).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(VoiceInputService);
    });

    it('should handle stop when not recording', () => {
      expect(() => service.stopRecording()).not.toThrow();
      expect(mockRecognition.stop).not.toHaveBeenCalled();
    });

    it('should handle multiple rapid start attempts', () => {
      service.startRecording();
      service.startRecording();
      service.startRecording();

      expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    });

    it('should handle stop errors gracefully', () => {
      mockRecognition.stop.mockImplementation(() => {
        throw new Error('Stop failed');
      });
      service.startRecording();

      expect(() => service.stopRecording()).not.toThrow();
      expect(service.isRecording()).toBe(false);
    });
  });
});
