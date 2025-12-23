import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  collectionGroup,
} from '@angular/fire/firestore';
import { AnalyticsEventType } from '../models/analytics.model';
import { Observable, from, map } from 'rxjs';

/**
 * Analytics Aggregation Service
 *
 * Computes analytics metrics from raw event data.
 * Supports client-side aggregation for small datasets.
 */
@Injectable({
  providedIn: 'root',
})
export class AnalyticsAggregationService {
  private firestore = inject(Firestore);

  /**
   * Get overview metrics (Top 5 priority metrics)
   */
  getOverviewMetrics(): Observable<OverviewMetrics> {
    return from(this.computeOverviewMetrics());
  }

  /**
   * Compute overview metrics from raw events
   */
  private async computeOverviewMetrics(): Promise<OverviewMetrics> {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Query all events (for small datasets, this is fine)
    const eventsRef = collection(this.firestore, 'analytics/events/items');
    const eventsSnapshot = await getDocs(eventsRef);

    const events = eventsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Metric 1: Total users (unique user signups)
    const signupEvents = events.filter(
      (e: any) => e.eventType === AnalyticsEventType.USER_SIGNUP
    );
    const totalUsers = new Set(signupEvents.map((e: any) => e.userId)).size;

    // Metric 2: Total lists (all list creations)
    const listCreatedEvents = events.filter(
      (e: any) => e.eventType === AnalyticsEventType.LIST_CREATED
    );
    const totalLists = listCreatedEvents.length;

    // Metric 3: Total articles (need to count from articles collection)
    // For now, we'll estimate from ARTICLE_CREATED events
    const totalArticles = await this.countTotalArticles();

    // Metric 4: Active users (users with activity in last 14 days)
    const recentEvents = events.filter((e: any) => {
      const eventTime = e.timestamp?.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
      return eventTime >= fourteenDaysAgo;
    });
    const activeUsers = new Set(recentEvents.map((e: any) => e.userId)).size;

    // Metric 5: AI inputs (all AI commands)
    const aiEvents = events.filter(
      (e: any) =>
        e.eventType === AnalyticsEventType.AI_COMMAND_EXECUTED ||
        e.eventType === AnalyticsEventType.AI_COMMAND_FAILED
    );
    const totalAIInputs = aiEvents.length;

    // Bonus metrics
    const aiSuccessful = events.filter(
      (e: any) => e.eventType === AnalyticsEventType.AI_COMMAND_EXECUTED
    ).length;
    const aiFailed = events.filter(
      (e: any) => e.eventType === AnalyticsEventType.AI_COMMAND_FAILED
    ).length;
    const aiSuccessRate =
      totalAIInputs > 0 ? (aiSuccessful / totalAIInputs) * 100 : 0;

    // Failed AI commands with examples
    const failedCommands = events
      .filter((e: any) => e.eventType === AnalyticsEventType.AI_COMMAND_FAILED)
      .slice(0, 10) // Latest 10 failed commands
      .map((e: any) => ({
        inputText: e.metadata?.inputText || 'N/A',
        commandType: e.metadata?.commandType || 'unknown',
        errorMessage: e.metadata?.errorMessage || 'N/A',
        timestamp: e.timestamp?.toDate
          ? e.timestamp.toDate()
          : new Date(e.timestamp),
      }));

    return {
      totalUsers,
      totalLists,
      totalArticles,
      activeUsersLast14Days: activeUsers,
      totalAIInputs,
      aiSuccessRate: Math.round(aiSuccessRate * 10) / 10, // Round to 1 decimal
      aiSuccessful,
      aiFailed,
      failedCommands,
      lastUpdated: new Date(),
    };
  }

  /**
   * Count total articles across all users
   */
  private async countTotalArticles(): Promise<number> {
    try {
      // Use collection group to query all articles across users
      const articlesQuery = collectionGroup(this.firestore, 'articles');
      const articlesSnapshot = await getDocs(articlesQuery);
      return articlesSnapshot.size;
    } catch (error) {
      console.warn('Failed to count articles, returning 0:', error);
      return 0;
    }
  }

  /**
   * Get detailed AI command breakdown
   */
  getAICommandBreakdown(): Observable<AICommandBreakdown> {
    return from(this.computeAICommandBreakdown());
  }

  private async computeAICommandBreakdown(): Promise<AICommandBreakdown> {
    const eventsRef = collection(this.firestore, 'analytics/events/items');
    const eventsSnapshot = await getDocs(eventsRef);

    const aiEvents = eventsSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter(
        (e: any) =>
          e.eventType === AnalyticsEventType.AI_COMMAND_EXECUTED ||
          e.eventType === AnalyticsEventType.AI_COMMAND_FAILED
      );

    // Count by command type
    const commandTypeCounts: Record<string, number> = {};
    const failedCommandTypeCounts: Record<string, number> = {};

    aiEvents.forEach((e: any) => {
      const commandType = e.metadata?.commandType || 'unknown';

      if (!commandTypeCounts[commandType]) {
        commandTypeCounts[commandType] = 0;
      }
      commandTypeCounts[commandType]++;

      if (e.eventType === AnalyticsEventType.AI_COMMAND_FAILED) {
        if (!failedCommandTypeCounts[commandType]) {
          failedCommandTypeCounts[commandType] = 0;
        }
        failedCommandTypeCounts[commandType]++;
      }
    });

    return {
      commandTypeCounts,
      failedCommandTypeCounts,
      totalCommands: aiEvents.length,
    };
  }
}

// ==========================================
// Interfaces
// ==========================================

export interface OverviewMetrics {
  totalUsers: number;
  totalLists: number;
  totalArticles: number;
  activeUsersLast14Days: number;
  totalAIInputs: number;
  aiSuccessRate: number;
  aiSuccessful: number;
  aiFailed: number;
  failedCommands: Array<{
    inputText: string;
    commandType: string;
    errorMessage: string;
    timestamp: Date;
  }>;
  lastUpdated: Date;
}

export interface AICommandBreakdown {
  commandTypeCounts: Record<string, number>;
  failedCommandTypeCounts: Record<string, number>;
  totalCommands: number;
}
