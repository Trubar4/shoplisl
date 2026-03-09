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
import { LoggerService } from './logger.service';

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
  private logger = inject(LoggerService);
  private cache: Map<string, { metrics: OverviewMetrics; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

  /**
   * Get overview metrics (Top 5 priority metrics)
   * WITH AGGRESSIVE CACHING to prevent quota issues
   * @param forceRefresh - Bypass cache and fetch fresh data
   * @param dateRange - Filter data by date range (7, 14, 30, 90 days)
   */
  getOverviewMetrics(forceRefresh = false, dateRange: number = 30): Observable<OverviewMetrics> {
    const cacheKey = `metrics_${dateRange}`;
    const cached = this.cache.get(cacheKey);

    // Return cached data if still valid (unless forced refresh)
    if (!forceRefresh && cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      this.logger.debug('analytics', `📊 Analytics: Returning cached metrics for ${dateRange} days (age: ` +
        Math.round((Date.now() - cached.timestamp) / 1000) + 's)');
      return of(cached.metrics);
    }

    this.logger.debug('analytics', `📊 Analytics: Fetching fresh metrics from Firestore (${dateRange} days)`);
    return from(this.computeOverviewMetrics(dateRange));
  }

  /**
   * Clear cache (force refresh on next call)
   */
  clearCache(): void {
    this.logger.debug('analytics', '🗑️ Analytics: Cache cleared');
    this.cache.clear();
  }

  /**
   * Get empty metrics (used when queries fail due to permission errors)
   */
  private getEmptyMetrics(): OverviewMetrics {
    return {
      totalUsers: 0,
      totalLists: 0,
      totalArticles: 0,
      activeUsersLast14Days: 0,
      totalAIInputs: 0,
      aiSuccessRate: 0,
      aiSuccessful: 0,
      aiFailed: 0,
      avgResponseTime: 0,
      cacheHitRate: 0,
      listsCreatedToday: 0,
      listsDeletedToday: 0,
      articlesCreatedToday: 0,
      articlesDeletedToday: 0,
      failedCommands: [],
      lastUpdated: new Date(),
      // Phase 5 extended metrics
      avgListsPerUser: 0,
      avgArticlesPerList: 0,
      shareAcceptanceRate: 0,
      shareInvitesSent: 0,
      shareInvitesAccepted: 0,
      listsUnshared: 0,
      activeSharedLists: 0,
      topUsers: [],
    };
  }

  /**
   * Compute overview metrics from raw events
   * OPTIMIZED: Only queries specified date range + limits results to prevent quota issues
   * QUOTA OPTIMIZED: Reduced from 10k to 500 limit (sufficient for 50 users)
   * @param dateRange - Number of days to include (7, 14, 30, 90)
   */
  private async computeOverviewMetrics(dateRange: number = 30): Promise<OverviewMetrics> {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const rangeStartDate = new Date(now.getTime() - dateRange * 24 * 60 * 60 * 1000);

    // CRITICAL: Limit query to specified date range and max 500 events to prevent quota issues
    // For 50 users, 500 events is plenty for accurate statistics
    const eventsRef = collection(this.firestore, 'analytics/events/items');
    const eventsQuery = query(
      eventsRef,
      where('timestamp', '>=', Timestamp.fromDate(rangeStartDate)),
      orderBy('timestamp', 'desc'),
      limit(500) // Most recent 500 events in range
    );

    this.logger.debug('analytics', `📊 Analytics: Querying events (last ${dateRange} days, max 500)...`);

    let eventsSnapshot;
    try {
      eventsSnapshot = await getDocs(eventsQuery);
      this.quotaMonitor.trackRead('Analytics Events Query', eventsSnapshot.size);
      this.logger.debug('analytics', `📊 Analytics: Retrieved ${eventsSnapshot.size} events`);
    } catch (error) {
      this.logger.error('analytics', '❌ Analytics: Failed to query events:', error);
      // Return empty metrics if we can't query events
      return this.getEmptyMetrics();
    }

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

    // Daily activity metrics (today only)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEvents = events.filter((e: any) => {
      const eventTime = e.timestamp?.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
      return eventTime >= todayStart;
    });

    const listsCreatedToday = todayEvents.filter(
      (e: any) => e.eventType === AnalyticsEventType.LIST_CREATED
    ).length;
    const listsDeletedToday = todayEvents.filter(
      (e: any) => e.eventType === AnalyticsEventType.LIST_DELETED
    ).length;
    const articlesCreatedToday = todayEvents.filter(
      (e: any) => e.eventType === AnalyticsEventType.ARTICLE_ADDED_TO_LIST
    ).length;
    const articlesDeletedToday = todayEvents.filter(
      (e: any) => e.eventType === AnalyticsEventType.ARTICLE_REMOVED_FROM_LIST
    ).length;

    // Calculate extended metrics
    const avgListsPerUser = totalUsers > 0 ? Math.round((totalLists / totalUsers) * 10) / 10 : 0;
    const avgArticlesPerList = totalLists > 0 ? Math.round((totalArticles / totalLists) * 10) / 10 : 0;

    // Get top active users (users with most events)
    const userEventCounts = new Map<string, number>();
    events.forEach((e: any) => {
      const count = userEventCounts.get(e.userId) || 0;
      userEventCounts.set(e.userId, count + 1);
    });

    // Get top 5 user IDs
    const topUserIds = Array.from(userEventCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Look up user emails for top users
    const topUsers = await Promise.all(
      topUserIds.map(async ([userId, activityScore]) => {
        try {
          const userDoc = await getDocs(
            query(collection(this.firestore, 'users-v2'), where('__name__', '==', userId), limit(1))
          );
          const email = userDoc.docs[0]?.data()['email'] || userId;
          return { userId: email, activityScore };
        } catch (error) {
          this.logger.warn('analytics', `Failed to fetch email for user ${userId}:`, error);
          return { userId, activityScore };
        }
      })
    );

    // Calculate sharing metrics from real events
    const shareInvitesSent = events.filter(
      (e: any) => e.eventType === AnalyticsEventType.SHARE_INVITE_CREATED
    ).length;
    const shareInvitesAccepted = events.filter(
      (e: any) => e.eventType === AnalyticsEventType.SHARE_INVITE_ACCEPTED
    ).length;
    const listsUnshared = events.filter(
      (e: any) => e.eventType === AnalyticsEventType.LIST_UNSHARED
    ).length;
    const activeSharedLists = new Set(
      events
        .filter((e: any) => e.eventType === AnalyticsEventType.LIST_SHARED)
        .map((e: any) => e.metadata?.listId)
        .filter(Boolean)
    ).size;
    const shareAcceptanceRate = shareInvitesSent > 0
      ? Math.round((shareInvitesAccepted / shareInvitesSent) * 1000) / 10
      : 0;

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
      listsCreatedToday,
      listsDeletedToday,
      articlesCreatedToday,
      articlesDeletedToday,
      failedCommands,
      lastUpdated: new Date(),
      // Phase 5 extended metrics
      avgListsPerUser,
      avgArticlesPerList,
      shareAcceptanceRate,
      shareInvitesSent,
      shareInvitesAccepted,
      listsUnshared,
      activeSharedLists,
      topUsers,
    };

    // Cache the results with date range key
    const cacheKey = `metrics_${dateRange}`;
    this.cache.set(cacheKey, { metrics, timestamp: Date.now() });
    this.logger.debug('analytics', `📊 Analytics: Metrics cached for 5 minutes (${dateRange} days)`);

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
      this.logger.debug('analytics', '📊 Analytics: Counting articles (max 500)...');
      const articlesSnapshot = await getDocs(articlesQuery);
      this.quotaMonitor.trackRead('Analytics Count Articles', articlesSnapshot.size);
      this.logger.debug('analytics', `📊 Analytics: Found ${articlesSnapshot.size} articles`);

      // If we hit the limit, show a warning
      if (articlesSnapshot.size >= 500) {
        this.logger.warn('analytics', '⚠️ Analytics: Article count limited to 500. Actual count may be higher.');
      }

      return articlesSnapshot.size;
    } catch (error: any) {
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
        this.logger.error('analytics', '❌ Analytics: Permission denied - are you logged in as admin?', error);
        this.logger.error('analytics', '💡 Please login with admin account to view analytics');
      } else {
        this.logger.warn('analytics', '❌ Analytics: Failed to count articles, returning 0:', error);
      }
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
      this.logger.debug('analytics', '📊 Analytics: Counting users...');
      const usersSnapshot = await getDocs(usersQuery);
      this.quotaMonitor.trackRead('Analytics Count Users', usersSnapshot.size);
      this.logger.debug('analytics', `📊 Analytics: Found ${usersSnapshot.size} users`);
      return usersSnapshot.size;
    } catch (error) {
      this.logger.warn('analytics', '❌ Analytics: Failed to count users, returning 0:', error);
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
      this.logger.debug('analytics', '📊 Analytics: Counting lists...');
      const listsSnapshot = await getDocs(listsQuery);
      this.quotaMonitor.trackRead('Analytics Count Lists', listsSnapshot.size);
      this.logger.debug('analytics', `📊 Analytics: Found ${listsSnapshot.size} lists`);
      return listsSnapshot.size;
    } catch (error: any) {
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
        this.logger.error('analytics', '❌ Analytics: Permission denied - are you logged in as admin?', error);
        this.logger.error('analytics', '💡 Please login with admin account to view analytics');
      } else {
        this.logger.warn('analytics', '❌ Analytics: Failed to count lists, returning 0:', error);
      }
      return 0;
    }
  }

  /**
   * Get feature adoption rates: % of users who have ever used AI, sharing, or voice input.
   */
  getFeatureAdoptionRates(dateRange: number = 30): Observable<FeatureAdoptionMetrics> {
    return from(this.computeFeatureAdoptionRates(dateRange));
  }

  /**
   * Get user retention: day-1, day-7, day-30 return rates based on USER_LOGIN events.
   */
  getRetentionMetrics(dateRange: number = 90): Observable<RetentionMetrics> {
    return from(this.computeRetentionMetrics(dateRange));
  }

  /**
   * Get detailed AI command breakdown
   */
  getAICommandBreakdown(): Observable<AICommandBreakdown> {
    return from(this.computeAICommandBreakdown());
  }

  /**
   * Get user growth time series for charts
   * Returns daily user signup counts
   */
  getUserGrowthTimeSeries(dateRange: number = 30): Observable<TimeSeriesData[]> {
    return from(this.computeUserGrowthTimeSeries(dateRange));
  }

  /**
   * Get daily activity time series for charts
   * Returns daily counts of lists/articles created
   */
  getDailyActivityTimeSeries(dateRange: number = 30): Observable<DailyActivityData[]> {
    return from(this.computeDailyActivityTimeSeries(dateRange));
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

  /**
   * Compute user growth time series
   * Counts unique active users per day (any event type)
   */
  private async computeUserGrowthTimeSeries(dateRange: number): Promise<TimeSeriesData[]> {
    const rangeStartDate = new Date();
    rangeStartDate.setDate(rangeStartDate.getDate() - dateRange);

    const eventsRef = collection(this.firestore, 'analytics/events/items');
    const q = query(
      eventsRef,
      where('timestamp', '>=', Timestamp.fromDate(rangeStartDate)),
      limit(500)
    );

    try {
      const eventsSnapshot = await getDocs(q);
      this.quotaMonitor.trackRead('Analytics User Growth Query', eventsSnapshot.size);

      this.logger.debug('analytics', `📊 User Growth: Retrieved ${eventsSnapshot.size} events for time series`);

      // Group by date - count unique users per day
      const dailyCounts = new Map<string, Set<string>>();
      eventsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const timestamp = data['timestamp']?.toDate ? data['timestamp'].toDate() : new Date(data['timestamp']);
        const dateKey = timestamp.toISOString().split('T')[0];

        if (!dailyCounts.has(dateKey)) {
          dailyCounts.set(dateKey, new Set());
        }
        dailyCounts.get(dateKey)!.add(data['userId']);
      });

      this.logger.debug('analytics', `📊 User Growth: Found ${dailyCounts.size} days with activity`);

      // Fill in all dates in range
      const result: TimeSeriesData[] = [];
      const currentDate = new Date(rangeStartDate);
      while (currentDate <= new Date()) {
        const dateKey = currentDate.toISOString().split('T')[0];
        const count = dailyCounts.get(dateKey)?.size || 0;
        result.push({
          date: dateKey,
          value: count,
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      this.logger.debug('analytics', `📊 User Growth: Returning ${result.length} data points`);
      return result;
    } catch (error) {
      this.logger.error('analytics', 'Failed to compute user growth time series:', error);
      return [];
    }
  }

  /**
   * Compute feature adoption rates.
   * For each feature, count distinct userIds that fired the relevant event type,
   * then divide by total registered users.
   */
  private async computeFeatureAdoptionRates(dateRange: number): Promise<FeatureAdoptionMetrics> {
    const rangeStartDate = new Date();
    rangeStartDate.setDate(rangeStartDate.getDate() - dateRange);

    const eventsRef = collection(this.firestore, 'analytics/events/items');
    const q = query(
      eventsRef,
      where('timestamp', '>=', Timestamp.fromDate(rangeStartDate)),
      limit(500)
    );

    try {
      const eventsSnapshot = await getDocs(q);
      this.quotaMonitor.trackRead('Analytics Feature Adoption Query', eventsSnapshot.size);

      const totalUsers = await this.countTotalUsers();

      const aiUsers = new Set<string>();
      const sharingUsers = new Set<string>();
      const voiceUsers = new Set<string>();

      eventsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const userId = data['userId'];
        if (!userId) return;
        switch (data['eventType']) {
          case AnalyticsEventType.AI_COMMAND_EXECUTED:
            aiUsers.add(userId);
            break;
          case AnalyticsEventType.SHARE_INVITE_CREATED:
            sharingUsers.add(userId);
            break;
          case AnalyticsEventType.AI_VOICE_INPUT_USED:
            voiceUsers.add(userId);
            break;
        }
      });

      const rate = (count: number) =>
        totalUsers > 0 ? Math.round((count / totalUsers) * 1000) / 10 : 0;

      return {
        aiAdoptionRate: rate(aiUsers.size),
        sharingAdoptionRate: rate(sharingUsers.size),
        voiceAdoptionRate: rate(voiceUsers.size),
        aiUsers: aiUsers.size,
        sharingUsers: sharingUsers.size,
        voiceUsers: voiceUsers.size,
        totalUsers,
      };
    } catch (error) {
      this.logger.error('analytics', 'Failed to compute feature adoption rates:', error);
      return { aiAdoptionRate: 0, sharingAdoptionRate: 0, voiceAdoptionRate: 0, aiUsers: 0, sharingUsers: 0, voiceUsers: 0, totalUsers: 0 };
    }
  }

  /**
   * Compute retention metrics using USER_LOGIN events.
   * For each user, find their first login date in the dataset, then check
   * whether they also logged in on day +1, +7, and +30.
   */
  private async computeRetentionMetrics(dateRange: number): Promise<RetentionMetrics> {
    // Query a wide window so we can detect day-30 returns
    const rangeStartDate = new Date();
    rangeStartDate.setDate(rangeStartDate.getDate() - Math.max(dateRange, 60));

    const eventsRef = collection(this.firestore, 'analytics/events/items');
    const q = query(
      eventsRef,
      where('eventType', '==', AnalyticsEventType.USER_LOGIN),
      where('timestamp', '>=', Timestamp.fromDate(rangeStartDate)),
      limit(500)
    );

    try {
      const eventsSnapshot = await getDocs(q);
      this.quotaMonitor.trackRead('Analytics Retention Query', eventsSnapshot.size);

      // Build a map: userId -> Set of ISO date strings (YYYY-MM-DD) when they logged in
      const userLoginDates = new Map<string, Set<string>>();
      eventsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const userId = data['userId'];
        if (!userId) return;
        const ts = data['timestamp']?.toDate ? data['timestamp'].toDate() : new Date(data['timestamp']);
        const dateKey = ts.toISOString().split('T')[0];
        if (!userLoginDates.has(userId)) userLoginDates.set(userId, new Set());
        userLoginDates.get(userId)!.add(dateKey);
      });

      if (userLoginDates.size === 0) {
        return { day1: 0, day7: 0, day30: 0, cohortSize: 0 };
      }

      // For each user, their "day 0" = earliest login date in the data
      let returnedDay1 = 0;
      let returnedDay7 = 0;
      let returnedDay30 = 0;
      const cohortSize = userLoginDates.size;

      const addDays = (isoDate: string, days: number): string => {
        const d = new Date(isoDate);
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
      };

      userLoginDates.forEach((dates) => {
        const sortedDates = Array.from(dates).sort();
        const firstDate = sortedDates[0];
        if (dates.has(addDays(firstDate, 1))) returnedDay1++;
        if (dates.has(addDays(firstDate, 7))) returnedDay7++;
        if (dates.has(addDays(firstDate, 30))) returnedDay30++;
      });

      const pct = (n: number) => Math.round((n / cohortSize) * 1000) / 10;
      return {
        day1: pct(returnedDay1),
        day7: pct(returnedDay7),
        day30: pct(returnedDay30),
        cohortSize,
      };
    } catch (error) {
      this.logger.error('analytics', 'Failed to compute retention metrics:', error);
      return { day1: 0, day7: 0, day30: 0, cohortSize: 0 };
    }
  }

  /**
   * Compute daily activity time series
   */
  private async computeDailyActivityTimeSeries(dateRange: number): Promise<DailyActivityData[]> {
    const rangeStartDate = new Date();
    rangeStartDate.setDate(rangeStartDate.getDate() - dateRange);

    const eventsRef = collection(this.firestore, 'analytics/events/items');
    const q = query(
      eventsRef,
      where('timestamp', '>=', Timestamp.fromDate(rangeStartDate)),
      limit(500)
    );

    try {
      const eventsSnapshot = await getDocs(q);
      this.quotaMonitor.trackRead('Analytics Daily Activity Query', eventsSnapshot.size);

      this.logger.debug('analytics', `📊 Daily Activity: Retrieved ${eventsSnapshot.size} events`);

      // Group by date and event type
      const dailyActivity = new Map<string, DailyActivityData>();
      let listEventCount = 0;
      let articleEventCount = 0;

      eventsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const timestamp = data['timestamp']?.toDate ? data['timestamp'].toDate() : new Date(data['timestamp']);
        const dateKey = timestamp.toISOString().split('T')[0];
        const eventType = data['eventType'];

        if (!dailyActivity.has(dateKey)) {
          dailyActivity.set(dateKey, {
            date: dateKey,
            listsCreated: 0,
            articlesCreated: 0,
          });
        }

        const dayData = dailyActivity.get(dateKey)!;
        if (eventType === AnalyticsEventType.LIST_CREATED) {
          dayData.listsCreated++;
          listEventCount++;
        } else if (eventType === AnalyticsEventType.ARTICLE_ADDED_TO_LIST) {
          dayData.articlesCreated++;
          articleEventCount++;
        }
      });

      this.logger.debug('analytics', `📊 Daily Activity: Found ${listEventCount} list events, ${articleEventCount} article events`);
      this.logger.debug('analytics', `📊 Daily Activity: Activity on ${dailyActivity.size} days`);

      // Fill in all dates in range
      const result: DailyActivityData[] = [];
      const currentDate = new Date(rangeStartDate);
      while (currentDate <= new Date()) {
        const dateKey = currentDate.toISOString().split('T')[0];
        result.push(
          dailyActivity.get(dateKey) || {
            date: dateKey,
            listsCreated: 0,
            articlesCreated: 0,
          }
        );
        currentDate.setDate(currentDate.getDate() + 1);
      }

      this.logger.debug('analytics', `📊 Daily Activity: Returning ${result.length} data points`);
      return result;
    } catch (error) {
      this.logger.error('analytics', 'Failed to compute daily activity time series:', error);
      return [];
    }
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
  // Daily activity metrics
  listsCreatedToday: number;
  listsDeletedToday: number;
  articlesCreatedToday: number;
  articlesDeletedToday: number;
  failedCommands: Array<{
    inputText: string;
    commandType: string;
    errorMessage: string;
    timestamp: Date;
  }>;
  lastUpdated: Date;
  // Phase 5 extended metrics
  avgListsPerUser: number;
  avgArticlesPerList: number;
  shareAcceptanceRate: number;
  shareInvitesSent: number;
  shareInvitesAccepted: number;
  listsUnshared: number;
  activeSharedLists: number;
  topUsers: Array<{
    userId: string; // Actually contains user email for display purposes
    activityScore: number;
  }>;
}

export interface AICommandBreakdown {
  commandTypeCounts: Record<string, number>;
  failedCommandTypeCounts: Record<string, number>;
  totalCommands: number;
}

export interface TimeSeriesData {
  date: string;
  value: number;
}

export interface DailyActivityData {
  date: string;
  listsCreated: number;
  articlesCreated: number;
}

export interface FeatureAdoptionMetrics {
  aiAdoptionRate: number;       // % of users who used AI
  sharingAdoptionRate: number;  // % of users who used sharing
  voiceAdoptionRate: number;    // % of users who used voice input
  aiUsers: number;
  sharingUsers: number;
  voiceUsers: number;
  totalUsers: number;
}

export interface RetentionMetrics {
  day1: number;   // % of users who returned on day 1
  day7: number;   // % of users who returned on day 7
  day30: number;  // % of users who returned on day 30
  cohortSize: number;
}
