import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import {
  AnalyticsEvent,
  AnalyticsEventType,
} from '../models/analytics.model';
import { LoggerService } from './logger.service';

/**
 * AnalyticsService
 *
 * Central service for tracking user behavior and system metrics.
 * Features:
 * - Batched writes to reduce Firestore costs
 * - Session tracking
 * - Offline buffering
 * - Automatic flushing on interval or threshold
 */
@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  private firestore = inject(Firestore);
  private logger = inject(LoggerService);

  private injector = inject(Injector);
  private eventBuffer: AnalyticsEvent[] = [];
  private readonly BATCH_SIZE = 10; // Write after 10 events
  private readonly FLUSH_INTERVAL = 30000; // Flush every 30 seconds
  private readonly STORAGE_KEY = 'shoplisl_analytics_buffer';
  private flushTimer: any;
  private sessionId: string;
  private sessionStartTime: Date;
  private isWriting = false; // Prevent concurrent writes
  private writeCount = 0; // Track write operations

  constructor() {
    this.sessionId = this.generateSessionId();
    this.sessionStartTime = new Date();

    // Load buffered events from localStorage (from previous session)
    this.loadBufferedEvents();

    // Start periodic flush timer
    this.startFlushTimer();

    // Flush on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        // Save to localStorage instead of trying async flush
        // This is synchronous and guaranteed to complete
        this.saveBufferedEvents();
      });

      // Flush when visibility changes (tab switching)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.flush();
        }
      });
    }
  }

  /**
   * Generate UUID v4 (without external dependency)
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Track an analytics event
   */
  trackEvent(
    userId: string,
    eventType: AnalyticsEventType,
    metadata?: Record<string, any>
  ): void {
    if (!userId) {
      // Don't track events for unauthenticated users
      return;
    }

    const event: AnalyticsEvent = {
      id: this.generateUUID(),
      eventType,
      userId,
      timestamp: new Date(),
      sessionId: this.sessionId,
      metadata,
    };

    this.eventBuffer.push(event);
    this.logger.debug('analytics', `📈 Analytics: Event tracked (${eventType}) - Buffer: ${this.eventBuffer.length}/${this.BATCH_SIZE}`);

    // Flush if buffer is full
    if (this.eventBuffer.length >= this.BATCH_SIZE) {
      this.logger.debug('analytics', `🚀 Analytics: Buffer full, triggering flush`);
      this.flush();
    }
  }

  /**
   * Track a page view
   */
  trackPageView(userId: string, page: string, referrer?: string): void {
    this.trackEvent(userId, AnalyticsEventType.PAGE_VIEW, {
      page,
      referrer,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Track user action
   */
  trackUserAction(userId: string, action: string, metadata?: Record<string, any>): void {
    this.trackEvent(userId, AnalyticsEventType.FEATURE_USED, {
      action,
      ...metadata,
    });
  }

  /**
   * Track error
   */
  trackError(userId: string, error: Error, context?: Record<string, any>): void {
    this.trackEvent(userId, AnalyticsEventType.ERROR_OCCURRED, {
      errorMessage: error.message,
      errorStack: error.stack,
      ...context,
    });
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get session duration in seconds
   */
  getSessionDuration(): number {
    return Math.floor(
      (new Date().getTime() - this.sessionStartTime.getTime()) / 1000
    );
  }

  /**
   * Get the number of events currently pending in the buffer
   */
  getBufferSize(): number {
    return this.eventBuffer.length;
  }

  /**
   * Flush buffered events to Firestore (async)
   * Public so admins can force-flush from the dashboard.
   */
  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    // Prevent concurrent writes
    if (this.isWriting) {
      this.logger.debug('analytics', '⏳ Analytics write already in progress, skipping flush');
      return;
    }

    this.isWriting = true;
    const eventsToWrite = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      this.writeCount++;
      this.logger.debug('analytics', `📊 Analytics: Writing ${eventsToWrite.length} events (write #${this.writeCount})`);
      await this.writeEventsBatch(eventsToWrite);
      this.logger.debug('analytics', `✅ Analytics: Write #${this.writeCount} successful`);
    } catch (error) {
      this.logger.error('analytics', '❌ Analytics: Failed to write events:', error);
      // Re-add events to buffer for retry (max 100 events to prevent memory issues)
      if (this.eventBuffer.length < 100) {
        this.eventBuffer.unshift(...eventsToWrite);
      } else {
        this.logger.warn('analytics', '⚠️ Analytics: Buffer full, dropping events to prevent memory issues');
      }
    } finally {
      this.isWriting = false;
    }
  }

  /**
   * Write events to Firestore using batched writes
   */
  private async writeEventsBatch(events: AnalyticsEvent[]): Promise<void> {
    const results = await Promise.allSettled(
      events.map((event) =>
        runInInjectionContext(this.injector, () =>
          addDoc(collection(this.firestore, 'analytics/events/items'), {
            eventType: event.eventType,
            userId: event.userId,
            timestamp: serverTimestamp(),
            sessionId: event.sessionId,
            metadata: event.metadata || {},
          })
        )
      )
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    this.logger.debug('analytics', `📝 Firestore write: ${succeeded} ok, ${failed} failed`);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        this.logger.error('analytics', `❌ Failed to write event [${events[i].eventType}]:`, r.reason);
      }
    });
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.logger.debug('analytics', `⏱️ Flush timer fired — buffer: ${this.eventBuffer.length} events`);
      this.flush();
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${this.generateUUID()}`;
  }

  /**
   * Load buffered events from localStorage (from previous session)
   * This recovers events that weren't flushed before browser closed
   */
  private loadBufferedEvents(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert timestamp strings back to Date objects
        this.eventBuffer = parsed.map((event: any) => ({
          ...event,
          timestamp: new Date(event.timestamp),
        }));
        this.logger.debug('analytics', `📦 Analytics: Loaded ${this.eventBuffer.length} buffered events from localStorage`);

        // Clear localStorage after loading
        localStorage.removeItem(this.STORAGE_KEY);

        // Try to flush them immediately
        if (this.eventBuffer.length > 0) {
          this.logger.debug('analytics', '🚀 Analytics: Attempting to flush recovered events');
          this.flush();
        }
      }
    } catch (error) {
      this.logger.warn('analytics', '⚠️ Analytics: Failed to load buffered events from localStorage:', error);
      this.eventBuffer = [];
    }
  }

  /**
   * Save buffered events to localStorage (for page unload)
   * This ensures events aren't lost if browser closes before flush completes
   */
  private saveBufferedEvents(): void {
    if (this.eventBuffer.length === 0) {
      return;
    }

    try {
      // Convert Date objects to ISO strings for JSON serialization
      const serializable = this.eventBuffer.map(event => ({
        ...event,
        timestamp: event.timestamp.toISOString(),
      }));
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(serializable));
      this.logger.debug('analytics', `💾 Analytics: Saved ${this.eventBuffer.length} events to localStorage`);
    } catch (error) {
      this.logger.warn('analytics', '⚠️ Analytics: Failed to save events to localStorage:', error);
    }
  }

  /**
   * Clean up on service destruction
   */
  ngOnDestroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.saveBufferedEvents(); // Save before destroying
    this.flush();
  }
}
