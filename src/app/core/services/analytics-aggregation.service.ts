import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  collectionGroup,
  limit,
  orderBy,
} from '@angular/fire/firestore';
import { AnalyticsEventType } from '../models/analytics.model';
import { Observable, from, map, of } from 'rxjs';
import { QuotaMonitorService } from './quota-monitor.service';
import { AICachingService } from './ai/caching.service';

/**
 * Analytics Aggregation Service
 *
 * Computes analytics metrics from raw event data.
 * Supports client-side aggregation for small datasets.
 *
 * CRITICAL: Implements aggressive caching to prevent excessive Firestore reads!
 */
@Injectable({
  providedIn: 'root',
})
export class AnalyticsAggregationService {
  private firestore = inject(Firestore);
  private quotaMonitor = inject(QuotaMonitorService);
  private aiCachingService = inject(AICachingService);
  private cache: OverviewMetrics | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

  /**
   * Get overview metrics (Top 5 priority metrics)
   * WITH AGGRESSIVE CACHING to prevent quota issues
   */
  getOverviewMetrics(forceRefresh = false): Observable<OverviewMetrics> {
    // Return cached data if still valid (unless forced refresh)
    if (!forceRefresh && this.cache && Date.now() - this.cacheTimestamp < this.CACHE_DURATION) {
      console.log('📊 Analytics: Returning cached metrics (age: ' +
        Math.round((Date.now() - this.cacheTimestamp) / 1000) + 's)');
      return of(this.cache);
    }

    console.log('📊 Analytics: Fetching fresh metrics from Firestore');
    return from(this.computeOverviewMetrics());
  }

  /**
   * Clear cache (force refresh on next call)
   */
  clearCache(): void {
    console.log('🗑️ Analytics: Cache cleared');
    this.cache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Compute overview metrics from raw events
   * OPTIMIZED: Only queries last 30 days + limits results to prevent quota issues
   * QUOTA OPTIMIZED: Reduced from 10k to 500 limit (sufficient for 50 users)
   */
  private async computeOverviewMetrics(): Promise<OverviewMetrics> {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // CRITICAL: Limit query to last 30 days and max 500 events to prevent quota issues
    // For 50 users, 500 events is plenty for accurate statistics
    const eventsRef = collection(this.firestore, 'analytics/events/items');
    const eventsQuery = query(
      eventsRef,
      where('timestamp', '>=', Timestamp.fromDate(thirtyDaysAgo)),
      limit(500) // Reduced from 10k - sufficient for small user base
    );

    console.log('📊 Analytics: Querying events (last 30 days, max 500)...');
    const eventsSnapshot = await getDocs(eventsQuery);
    this.quotaMonitor.trackRead('Analytics Events Query', eventsSnapshot.size);
    console.log(`📊 Analytics: Retrieved ${eventsSnapshot.size} events`);

    const events = eventsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Metric 1: Total users (count actual users in database, not just signup events)
    const totalUsers = await this.countTotalUsers();

    // Metric 2: Total lists (count actual lists in database, not just creation events)
    const totalLists = await this.countTotalLists();

    // Metric 3: Total articles (count actual articles in database)
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

    // Phase 3 metrics: Response time and cache hit rate
    // Calculate average response time from AI commands
    const responseTimes = aiEvents
      .filter((e: any) => e.metadata?.responseTime !== undefined)
      .map((e: any) => e.metadata.responseTime);
    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length)
      : 0;

    // Get real-time cache hit rate from AI caching service
    const cacheStats = this.aiCachingService.getStats();
    const cacheHitRate = cacheStats.hitRate;

    const metrics: OverviewMetrics = {
      totalUsers,
      totalLists,
      totalArticles,
      activeUsersLast14Days: activeUsers,
      totalAIInputs,
      aiSuccessRate: Math.round(aiSuccessRate * 10) / 10, // Round to 1 decimal
      aiSuccessful,
      aiFailed,
      avgResponseTime,
      cacheHitRate,
      failedCommands,
      lastUpdated: new Date(),
    };

    // Cache the results
    this.cache = metrics;
    this.cacheTimestamp = Date.now();
    console.log('📊 Analytics: Metrics cached for 5 minutes');

    return metrics;
  }

  /**
   * Count total articles across all users
   * OPTIMIZED: Limits to 500 articles to prevent quota issues
   * For 50 users with ~20 articles each = 1000 max, so 500 limit gives good estimate
   */
  private async countTotalArticles(): Promise<number> {
    try {
      // CRITICAL: Limit collection group query to prevent excessive reads
      const articlesQuery = query(
        collectionGroup(this.firestore, 'articles'),
        limit(500) // Reduced from 10k - sufficient for small user base
      );
      console.log('📊 Analytics: Counting articles (max 500)...');
      const articlesSnapshot = await getDocs(articlesQuery);
      this.quotaMonitor.trackRead('Analytics Count Articles', articlesSnapshot.size);
      console.log(`📊 Analytics: Found ${articlesSnapshot.size} articles`);

      // If we hit the limit, show a warning
      if (articlesSnapshot.size >= 500) {
        console.warn('⚠️ Analytics: Article count limited to 500. Actual count may be higher.');
      }

      return articlesSnapshot.size;
    } catch (error) {
      console.warn('❌ Analytics: Failed to count articles, returning 0:', error);
      return 0;
    }
  }

  /**
   * Count total users in database
   * OPTIMIZED: Reduced limit from 10k to 500 (way more than needed for 50 users)
   */
  private async countTotalUsers(): Promise<number> {
    try {
      // users-v2 is a top-level collection, not a subcollection
      const usersRef = collection(this.firestore, 'users-v2');
      const usersQuery = query(usersRef, limit(500)); // Reduced from 10k
      console.log('📊 Analytics: Counting users...');
      const usersSnapshot = await getDocs(usersQuery);
      this.quotaMonitor.trackRead('Analytics Count Users', usersSnapshot.size);
      console.log(`📊 Analytics: Found ${usersSnapshot.size} users`);
      return usersSnapshot.size;
    } catch (error) {
      console.warn('❌ Analytics: Failed to count users, returning 0:', error);
      return 0;
    }
  }

  /**
   * Count total lists in database
   * OPTIMIZED: Reduced limit from 10k to 500 (sufficient for 50 users)
   */
  private async countTotalLists(): Promise<number> {
    try {
      const listsQuery = query(
        collectionGroup(this.firestore, 'lists'),
        limit(500) // Reduced from 10k
      );
      console.log('📊 Analytics: Counting lists...');
      const listsSnapshot = await getDocs(listsQuery);
      this.quotaMonitor.trackRead('Analytics Count Lists', listsSnapshot.size);
      console.log(`📊 Analytics: Found ${listsSnapshot.size} lists`);
      return listsSnapshot.size;
    } catch (error) {
      console.warn('❌ Analytics: Failed to count lists, returning 0:', error);
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
    // QUOTA OPTIMIZATION: Add limit and time range to prevent reading ALL events
    // Before: getDocs(eventsRef) = ALL analytics events (unlimited!)
    // After: limit(500) + last 30 days = max 500 reads
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const eventsRef = collection(this.firestore, 'analytics/events/items');
    const q = query(
      eventsRef,
      where('timestamp', '>=', Timestamp.fromDate(thirtyDaysAgo)),
      limit(500)
    );
    const eventsSnapshot = await getDocs(q);

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
  avgResponseTime: number; // Average AI response time in ms
  cacheHitRate: number; // Cache hit rate as percentage (0-100)
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
