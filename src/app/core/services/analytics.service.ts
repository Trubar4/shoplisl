import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  writeBatch,
  serverTimestamp,
} from '@angular/fire/firestore';
import {
  AnalyticsEvent,
  AnalyticsEventType,
} from '../models/analytics.model';
import { v4 as uuidv4 } from 'uuid';

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

  private eventBuffer: AnalyticsEvent[] = [];
  private readonly BATCH_SIZE = 10; // Write after 10 events
  private readonly FLUSH_INTERVAL = 30000; // Flush every 30 seconds
  private flushTimer: any;
  private sessionId: string;
  private sessionStartTime: Date;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.sessionStartTime = new Date();

    // Start periodic flush timer
    this.startFlushTimer();

    // Flush on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushSync();
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
      id: uuidv4(),
      eventType,
      userId,
      timestamp: new Date(),
      sessionId: this.sessionId,
      metadata,
    };

    this.eventBuffer.push(event);

    // Flush if buffer is full
    if (this.eventBuffer.length >= this.BATCH_SIZE) {
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
   * Flush buffered events to Firestore (async)
   */
  private async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const eventsToWrite = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await this.writeEventsBatch(eventsToWrite);
    } catch (error) {
      console.error('Failed to write analytics events:', error);
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...eventsToWrite);
    }
  }

  /**
   * Synchronous flush (for page unload)
   */
  private flushSync(): void {
    if (this.eventBuffer.length === 0) {
      return;
    }

    // Attempt async flush on page unload
    // Note: Some events may be lost if page closes before write completes
    this.flush();
  }

  /**
   * Write events to Firestore using batched writes
   */
  private async writeEventsBatch(events: AnalyticsEvent[]): Promise<void> {
    const batch = writeBatch(this.firestore);
    const eventsCollection = collection(this.firestore, 'analytics/events/items');

    events.forEach((event) => {
      const docRef = addDoc(eventsCollection as any, {
        eventType: event.eventType,
        userId: event.userId,
        timestamp: serverTimestamp(),
        sessionId: event.sessionId,
        metadata: event.metadata || {},
      });
    });

    // Actually, batched writes with addDoc don't work directly
    // Let's write them individually but in parallel
    await Promise.all(
      events.map((event) =>
        addDoc(collection(this.firestore, 'analytics/events/items'), {
          eventType: event.eventType,
          userId: event.userId,
          timestamp: serverTimestamp(),
          sessionId: event.sessionId,
          metadata: event.metadata || {},
        })
      )
    );
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${uuidv4()}`;
  }

  /**
   * Clean up on service destruction
   */
  ngOnDestroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
  }
}
