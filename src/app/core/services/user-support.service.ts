import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  collectionGroup,
  orderBy,
  limit,
  Timestamp,
} from '@angular/fire/firestore';
import { User, ShoppingList, Article } from '../models';
import { AnalyticsEvent } from '../models/analytics.model';
import { QuotaMonitorService } from './quota-monitor.service';

/**
 * User Support Service
 *
 * Provides admin functionality to search users, view profiles,
 * export data, and manage user accounts.
 *
 * Phase 4: User Support Dashboard
 */
@Injectable({
  providedIn: 'root',
})
export class UserSupportService {
  private firestore = inject(Firestore);
  private quotaMonitor = inject(QuotaMonitorService);

  /**
   * Search users by email or name
   * Uses case-insensitive partial matching
   */
  async searchUsers(searchQuery: string): Promise<UserSearchResult[]> {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return [];
    }

    const normalizedQuery = searchQuery.toLowerCase().trim();
    console.log(`🔍 User Support: Searching for "${normalizedQuery}"`);

    try {
      // Query users-v2 collection
      const usersRef = collection(this.firestore, 'users-v2');
      const usersQuery = query(usersRef, limit(100)); // Limit to prevent excessive reads

      const usersSnapshot = await getDocs(usersQuery);
      this.quotaMonitor.trackRead('User Support: Search Users', usersSnapshot.size);

      const users = usersSnapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((user: any) => {
          // Client-side filtering for partial match
          const email = (user.email || '').toLowerCase();
          const name = (user.name || '').toLowerCase();
          const id = user.id.toLowerCase();

          return (
            email.includes(normalizedQuery) ||
            name.includes(normalizedQuery) ||
            id.includes(normalizedQuery)
          );
        });

      console.log(`🔍 User Support: Found ${users.length} matching users`);

      // Get quick stats for each user
      const results: UserSearchResult[] = [];
      for (const user of users.slice(0, 20)) { // Limit to 20 results to prevent quota issues
        const stats = await this.getUserQuickStats(user.id);
        results.push({
          id: user.id,
          name: user.name || 'Unknown',
          email: user.email || '',
          createdAt: user.createdAt?.toDate ? user.createdAt.toDate() : new Date(user.createdAt),
          listsCount: stats.listsCount,
          articlesCount: stats.articlesCount,
          lastActive: stats.lastActive,
        });
      }

      return results;
    } catch (error) {
      console.error('❌ User Support: Failed to search users:', error);
      throw error;
    }
  }

  /**
   * Get quick stats for a user (list count, article count, last active)
   * Used in search results
   */
  private async getUserQuickStats(userId: string): Promise<{
    listsCount: number;
    articlesCount: number;
    lastActive: Date | null;
  }> {
    try {
      // Count user's lists
      const listsRef = collection(this.firestore, `users-v2/${userId}/lists`);
      const listsSnapshot = await getDocs(listsRef);
      const listsCount = listsSnapshot.size;

      // Count user's articles
      const articlesRef = collection(this.firestore, `users-v2/${userId}/articles`);
      const articlesSnapshot = await getDocs(articlesRef);
      const articlesCount = articlesSnapshot.size;

      // Get last active from analytics events
      const eventsRef = collection(this.firestore, 'analytics/events/items');
      const eventsQuery = query(
        eventsRef,
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(1)
      );
      const eventsSnapshot = await getDocs(eventsQuery);
      const lastActive = eventsSnapshot.empty
        ? null
        : eventsSnapshot.docs[0].data().timestamp?.toDate();

      this.quotaMonitor.trackRead('User Support: Quick Stats',
        listsSnapshot.size + articlesSnapshot.size + eventsSnapshot.size);

      return { listsCount, articlesCount, lastActive };
    } catch (error) {
      console.warn(`⚠️ User Support: Failed to get stats for user ${userId}:`, error);
      return { listsCount: 0, articlesCount: 0, lastActive: null };
    }
  }

  /**
   * Get detailed user profile with full statistics
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    console.log(`📊 User Support: Loading profile for user ${userId}`);

    try {
      // Load user document
      const userRef = doc(this.firestore, `users-v2/${userId}`);
      const userSnapshot = await getDoc(userRef);

      if (!userSnapshot.exists()) {
        throw new Error(`User ${userId} not found`);
      }

      const userData = userSnapshot.data();
      this.quotaMonitor.trackRead('User Support: Load User', 1);

      // Load user's lists
      const lists = await this.getUserLists(userId);

      // Load user's articles
      const articles = await this.getUserArticles(userId);

      // Load recent activity
      const recentActivity = await this.getUserActivity(userId, 30);

      // Calculate statistics
      const sharedListsCount = lists.filter((list) =>
        list.sharedWith && list.sharedWith.length > 0
      ).length;

      const collaboratingListsCount = lists.filter((list) =>
        list.ownerId !== userId
      ).length;

      const totalArticlesInLists = lists.reduce((sum, list) =>
        sum + (list.articleIds?.length || 0), 0
      );

      console.log(`📊 User Support: Profile loaded successfully`);

      return {
        id: userId,
        name: userData.name || 'Unknown',
        email: userData.email || '',
        createdAt: userData.createdAt?.toDate ? userData.createdAt.toDate() : new Date(userData.createdAt),
        listsCount: lists.length,
        articlesCount: articles.length,
        sharedListsCount,
        collaboratingListsCount,
        totalArticlesInLists,
        lastActive: recentActivity.length > 0 ? recentActivity[0].timestamp : null,
        lists,
        articles,
        recentActivity,
      };
    } catch (error) {
      console.error('❌ User Support: Failed to load user profile:', error);
      throw error;
    }
  }

  /**
   * Get user's lists
   */
  private async getUserLists(userId: string): Promise<ShoppingList[]> {
    try {
      const listsRef = collection(this.firestore, `users-v2/${userId}/lists`);
      const listsSnapshot = await getDocs(listsRef);
      this.quotaMonitor.trackRead('User Support: Load Lists', listsSnapshot.size);

      const lists = listsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
      })) as ShoppingList[];

      return lists;
    } catch (error) {
      console.warn('⚠️ User Support: Failed to load lists:', error);
      return [];
    }
  }

  /**
   * Get user's articles
   */
  private async getUserArticles(userId: string): Promise<Article[]> {
    try {
      const articlesRef = collection(this.firestore, `users-v2/${userId}/articles`);
      const articlesSnapshot = await getDocs(articlesRef);
      this.quotaMonitor.trackRead('User Support: Load Articles', articlesSnapshot.size);

      const articles = articlesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
      })) as Article[];

      return articles;
    } catch (error) {
      console.warn('⚠️ User Support: Failed to load articles:', error);
      return [];
    }
  }

  /**
   * Get user's recent activity from analytics events
   */
  async getUserActivity(userId: string, limitCount = 30): Promise<AnalyticsEvent[]> {
    try {
      const eventsRef = collection(this.firestore, 'analytics/events/items');
      const eventsQuery = query(
        eventsRef,
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      const eventsSnapshot = await getDocs(eventsQuery);
      this.quotaMonitor.trackRead('User Support: Load Activity', eventsSnapshot.size);

      const events = eventsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate
          ? doc.data().timestamp.toDate()
          : new Date(doc.data().timestamp),
      })) as AnalyticsEvent[];

      return events;
    } catch (error) {
      console.warn('⚠️ User Support: Failed to load activity:', error);
      return [];
    }
  }

  /**
   * Export user data as JSON (for GDPR compliance)
   */
  async exportUserData(userId: string): Promise<Blob> {
    console.log(`📦 User Support: Exporting data for user ${userId}`);

    try {
      const profile = await this.getUserProfile(userId);

      // Create comprehensive export object
      const exportData = {
        exportDate: new Date().toISOString(),
        user: {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          createdAt: profile.createdAt?.toISOString(),
        },
        statistics: {
          listsCount: profile.listsCount,
          articlesCount: profile.articlesCount,
          sharedListsCount: profile.sharedListsCount,
          collaboratingListsCount: profile.collaboratingListsCount,
        },
        lists: profile.lists.map((list) => ({
          id: list.id,
          name: list.name,
          createdAt: list.createdAt?.toISOString(),
          articleCount: list.articleIds?.length || 0,
          isShared: list.sharedWith && list.sharedWith.length > 0,
          sharedWithCount: list.sharedWith?.length || 0,
        })),
        articles: profile.articles.map((article) => ({
          id: article.id,
          name: article.name,
          amount: article.amount,
          notes: article.notes,
          createdAt: article.createdAt?.toISOString(),
        })),
        recentActivity: profile.recentActivity.slice(0, 100).map((event) => ({
          eventType: event.eventType,
          timestamp: event.timestamp?.toISOString(),
          metadata: event.metadata,
        })),
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });

      console.log(`📦 User Support: Export complete (${blob.size} bytes)`);
      return blob;
    } catch (error) {
      console.error('❌ User Support: Failed to export user data:', error);
      throw error;
    }
  }
}

// ==========================================
// Interfaces
// ==========================================

export interface UserSearchResult {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  listsCount: number;
  articlesCount: number;
  lastActive: Date | null;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  listsCount: number;
  articlesCount: number;
  sharedListsCount: number;
  collaboratingListsCount: number;
  totalArticlesInLists: number;
  lastActive: Date | null;
  lists: ShoppingList[];
  articles: Article[];
  recentActivity: AnalyticsEvent[];
}
