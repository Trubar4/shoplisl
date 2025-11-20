/**
 * Chat UI Service Tests
 *
 * Comprehensive test coverage for chat UI functionality including:
 * - Scrolling behavior
 * - PWA viewport management
 * - Mobile keyboard handling
 * - Browser platform detection
 */

import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID, ElementRef } from '@angular/core';
import { ChatUIService } from './chat-ui.service';

describe('ChatUIService', () => {
  let service: ChatUIService;
  let mockWindow: any;
  let mockDocument: any;

  beforeEach(() => {
    // Mock window
    mockWindow = {
      innerHeight: 800,
      innerWidth: 375,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matchMedia: vi.fn(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn()
      })),
      scrollTo: vi.fn()
    };

    // Mock document
    mockDocument = {
      documentElement: {
        style: {
          setProperty: vi.fn()
        }
      },
      body: {
        style: {
          setProperty: vi.fn()
        },
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      }
    };

    // Setup global mocks
    (global as any).window = mockWindow;
    (global as any).document = mockDocument;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should be created', () => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(ChatUIService);
      expect(service).toBeTruthy();
    });

    it('should not initialize on server platform', () => {
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'server' }]
      });
      service = TestBed.inject(ChatUIService);

      service.initializePWAViewport();

      expect(mockDocument.documentElement.style.setProperty).not.toHaveBeenCalled();
    });

    it('should initialize PWA viewport on browser platform', () => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(ChatUIService);

      service.initializePWAViewport();

      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith('--vh', '8px');
    });

    it('should only initialize once', () => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(ChatUIService);

      service.initializePWAViewport();
      vi.clearAllMocks();
      service.initializePWAViewport();

      expect(mockDocument.documentElement.style.setProperty).not.toHaveBeenCalled();
    });
  });

  describe('Viewport Height', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(ChatUIService);
    });

    it('should set viewport height CSS variable', () => {
      service.setViewportHeight();

      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--vh',
        '8px' // 800 * 0.01
      );
    });

    it('should calculate viewport height correctly', () => {
      mockWindow.innerHeight = 1000;

      service.setViewportHeight();

      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--vh',
        '10px' // 1000 * 0.01
      );
    });

    it('should not set viewport height on server', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'server' }]
      });
      service = TestBed.inject(ChatUIService);

      service.setViewportHeight();

      expect(mockDocument.documentElement.style.setProperty).not.toHaveBeenCalled();
    });
  });

  describe('Viewport Listeners', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(ChatUIService);
    });

    it('should setup viewport event listeners', () => {
      service.initializePWAViewport();

      expect(mockWindow.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('orientationchange', expect.any(Function));
    });
  });

  describe('PWA Mode', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(ChatUIService);
    });

    it('should detect PWA standalone mode', async () => {
      mockWindow.matchMedia = vi.fn(() => ({
        matches: true,
        addListener: vi.fn(),
        removeListener: vi.fn()
      }));

      service.initializePWAViewport();

      expect(mockDocument.body.style.setProperty).toHaveBeenCalledWith(
        '--pwa-bottom-padding',
        'calc(75px + env(safe-area-inset-bottom, 0px))'
      );

      // Wait for setTimeout in handlePWAMode
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockWindow.scrollTo).toHaveBeenCalledWith(0, 0);
    });

    it('should not apply PWA fixes when not in standalone mode', () => {
      mockWindow.matchMedia = vi.fn(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn()
      }));

      service.initializePWAViewport();

      expect(mockDocument.body.style.setProperty).not.toHaveBeenCalledWith(
        '--pwa-bottom-padding',
        expect.any(String)
      );
    });
  });

  describe('Mobile Keyboard', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(ChatUIService);
    });

    it('should setup keyboard event listeners', () => {
      service.initializePWAViewport();

      const resizeCalls = mockWindow.addEventListener.mock.calls.filter(
        (call: any[]) => call[0] === 'resize'
      );
      const focusCalls = mockWindow.addEventListener.mock.calls.filter(
        (call: any[]) => call[0] === 'focus'
      );

      expect(resizeCalls.length).toBeGreaterThan(0);
      expect(focusCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Scrolling', () => {
    let mockContainer: ElementRef;
    let mockElement: any;

    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(ChatUIService);

      mockElement = {
        scrollTo: vi.fn(),
        scrollTop: 0,
        scrollHeight: 1000,
        clientHeight: 500
      };

      mockContainer = {
        nativeElement: mockElement
      } as ElementRef;
    });

    it('should scroll to bottom of container', () => {
      service.scrollToBottom(mockContainer);

      expect(mockElement.scrollTo).toHaveBeenCalledWith({
        top: 1000,
        behavior: 'instant'
      });
    });

    it('should handle null container gracefully', () => {
      expect(() => service.scrollToBottom(null)).not.toThrow();
    });

    it('should handle undefined container gracefully', () => {
      expect(() => service.scrollToBottom(undefined)).not.toThrow();
    });

    it('should use fallback when scrollTo throws error', () => {
      mockElement.scrollTo = vi.fn(() => {
        throw new Error('scrollTo not supported');
      });

      service.scrollToBottom(mockContainer);

      expect(mockElement.scrollTop).toBe(1000);
    });

    it('should scroll with delay', async () => {
      vi.useFakeTimers();

      service.scrollToBottomDelayed(mockContainer, 100);

      expect(mockElement.scrollTo).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(mockElement.scrollTo).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should use default delay of 50ms', async () => {
      vi.useFakeTimers();

      service.scrollToBottomDelayed(mockContainer);

      vi.advanceTimersByTime(49);
      expect(mockElement.scrollTo).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockElement.scrollTo).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('Scroll Position Detection', () => {
    let mockContainer: ElementRef;
    let mockElement: any;

    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(ChatUIService);

      mockElement = {
        scrollTop: 0,
        scrollHeight: 1000,
        clientHeight: 500
      };

      mockContainer = {
        nativeElement: mockElement
      } as ElementRef;
    });

    it('should detect when scrolled to bottom', () => {
      mockElement.scrollTop = 500; // scrollHeight(1000) - clientHeight(500) = 500

      const isAtBottom = service.isScrolledToBottom(mockContainer);

      expect(isAtBottom).toBe(true);
    });

    it('should detect when not scrolled to bottom', () => {
      mockElement.scrollTop = 200;

      const isAtBottom = service.isScrolledToBottom(mockContainer);

      expect(isAtBottom).toBe(false);
    });

    it('should use threshold for bottom detection', () => {
      mockElement.scrollTop = 460; // 40px from bottom

      const isAtBottom = service.isScrolledToBottom(mockContainer, 50);

      expect(isAtBottom).toBe(true);
    });

    it('should handle null container', () => {
      const isAtBottom = service.isScrolledToBottom(null);

      expect(isAtBottom).toBe(false);
    });

    it('should handle undefined container', () => {
      const isAtBottom = service.isScrolledToBottom(undefined);

      expect(isAtBottom).toBe(false);
    });

    it('should handle container without nativeElement', () => {
      const badContainer = { nativeElement: null } as ElementRef;

      const isAtBottom = service.isScrolledToBottom(badContainer);

      expect(isAtBottom).toBe(false);
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(ChatUIService);
    });

    it('should cleanup without errors', () => {
      expect(() => service.cleanup()).not.toThrow();
    });

    it('should not cleanup on server platform', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'server' }]
      });
      service = TestBed.inject(ChatUIService);

      expect(() => service.cleanup()).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({});
      service = TestBed.inject(ChatUIService);
    });

    it('should handle very small viewport', () => {
      mockWindow.innerHeight = 100;

      service.setViewportHeight();

      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--vh',
        '1px'
      );
    });

    it('should handle very large viewport', () => {
      mockWindow.innerHeight = 2000;

      service.setViewportHeight();

      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith(
        '--vh',
        '20px'
      );
    });

    it('should handle container with zero scroll height', () => {
      const mockElement = {
        scrollTo: vi.fn(),
        scrollTop: 0,
        scrollHeight: 0,
        clientHeight: 500
      };

      const mockContainer = {
        nativeElement: mockElement
      } as ElementRef;

      service.scrollToBottom(mockContainer);

      expect(mockElement.scrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: 'instant'
      });
    });
  });
});
