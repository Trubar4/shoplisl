/**
 * Chat UI Service
 *
 * Handles chat UI interactions including scrolling, viewport management,
 * and PWA-specific adjustments for the voice assistant.
 *
 * @responsibility Chat UI behavior and viewport management
 * @pattern Service-based architecture for UI utilities
 */

import { Injectable, Inject, PLATFORM_ID, ElementRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class ChatUIService {

  private isInitialized = false;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  /**
   * Initialize PWA viewport and keyboard handling
   */
  public initializePWAViewport(): void {
    if (!isPlatformBrowser(this.platformId) || this.isInitialized) return;

    this.setViewportHeight();
    this.setupViewportListeners();
    this.handlePWAMode();
    this.handleMobileKeyboard();
    this.isInitialized = true;
  }

  /**
   * Set CSS viewport height variable
   * Useful for PWA to handle dynamic viewport changes
   */
  public setViewportHeight(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  /**
   * Setup viewport event listeners for resize and orientation changes
   */
  private setupViewportListeners(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const updateViewport = () => {
      this.setViewportHeight();
    };

    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', () => {
      setTimeout(updateViewport, 100);
    });
  }

  /**
   * Apply PWA-specific viewport fixes
   * Detects standalone mode and applies appropriate styling
   */
  private handlePWAMode(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      console.log('🔧 PWA mode detected - applying viewport fixes');
      document.body.style.setProperty(
        '--pwa-bottom-padding',
        'calc(75px + env(safe-area-inset-bottom, 0px))'
      );
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 30);
    }
  }

  /**
   * Handle mobile keyboard appearance
   * Adjusts viewport when keyboard opens/closes
   */
  private handleMobileKeyboard(): void {
    if (!isPlatformBrowser(this.platformId)) return;

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

  /**
   * Scroll to bottom of a container element
   * @param container The ElementRef of the scroll container
   * @param force Force scroll even if not needed (default: false)
   */
  public scrollToBottom(container: ElementRef | null | undefined, force: boolean = false): void {
    if (!container) return;

    const element = container.nativeElement;
    if (!element) return;

    try {
      // Use instant scroll for immediate feedback
      element.scrollTo({
        top: element.scrollHeight,
        behavior: 'instant'
      });
    } catch (error) {
      // Fallback for older browsers
      element.scrollTop = element.scrollHeight;
    }
  }

  /**
   * Scroll to bottom with delay
   * Useful for waiting for DOM updates
   * @param container The ElementRef of the scroll container
   * @param delay Delay in milliseconds (default: 50ms)
   */
  public scrollToBottomDelayed(
    container: ElementRef | null | undefined,
    delay: number = 50
  ): void {
    setTimeout(() => {
      this.scrollToBottom(container);
    }, delay);
  }

  /**
   * Check if element is scrolled to bottom
   * @param container The ElementRef of the scroll container
   * @param threshold Pixels from bottom to consider "at bottom" (default: 50)
   */
  public isScrolledToBottom(container: ElementRef | null | undefined, threshold: number = 50): boolean {
    if (!container) return false;

    const element = container.nativeElement;
    if (!element) return false;

    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;

    return (scrollHeight - scrollTop - clientHeight) < threshold;
  }

  /**
   * Cleanup event listeners
   */
  public cleanup(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Note: In a real-world scenario, we'd need to store references to the
    // event listener functions to properly remove them. For now, this is a
    // placeholder for the cleanup interface.
    console.log('ChatUIService cleanup called');
  }
}
