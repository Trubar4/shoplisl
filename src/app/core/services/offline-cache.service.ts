import { Injectable } from '@angular/core';
import { Article, ShoppingList } from '../models';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: string;
}

export interface CacheStatus {
  hasCache: boolean;
  isExpired: boolean;
  age: number; // in milliseconds
  lastUpdated: Date | null;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineCacheService {
  private readonly CACHE_TTL = 30 * 60 * 60 * 1000; // 30 hours in milliseconds
  private readonly CACHE_VERSION = '1.0';
  private readonly ARTICLES_KEY = 'shoplisl_articles_cache';
  private readonly LISTS_KEY = 'shoplisl_lists_cache';

  constructor() {
    console.log('💾 OfflineCacheService initialized with 30h TTL');
  }

  // === ARTICLES CACHE ===

  cacheArticles(articles: Article[]): void {
    try {
      const cacheEntry: CacheEntry<Article[]> = {
        data: articles,
        timestamp: Date.now(),
        version: this.CACHE_VERSION
      };

      const compressed = this.compressData(cacheEntry);
      localStorage.setItem(this.ARTICLES_KEY, compressed);
      
      console.log(`💾 Cached ${articles.length} articles (${this.getStorageSize(compressed)} KB)`);
    } catch (error) {
      console.error('❌ Failed to cache articles:', error);
      this.clearCache('articles');
    }
  }

  getCachedArticles(): { data: Article[] | null; status: CacheStatus } {
    try {
      const cached = localStorage.getItem(this.ARTICLES_KEY);
      if (!cached) {
        return {
          data: null,
          status: { hasCache: false, isExpired: false, age: 0, lastUpdated: null }
        };
      }

      const cacheEntry: CacheEntry<Article[]> = this.decompressData(cached);
      const age = Date.now() - cacheEntry.timestamp;
      const isExpired = age > this.CACHE_TTL;
      const lastUpdated = new Date(cacheEntry.timestamp);

      const status: CacheStatus = {
        hasCache: true,
        isExpired,
        age,
        lastUpdated
      };

      // Convert date strings back to Date objects
      const articlesWithDates = cacheEntry.data.map(article => ({
        ...article,
        createdAt: new Date(article.createdAt),
        updatedAt: new Date(article.updatedAt)
      }));

      // Return cached data even if expired (let caller decide what to do)
      return {
        data: articlesWithDates,
        status
      };

    } catch (error) {
      console.error('❌ Failed to read articles cache:', error);
      this.clearCache('articles');
      return {
        data: null,
        status: { hasCache: false, isExpired: false, age: 0, lastUpdated: null }
      };
    }
  }

  // === LISTS CACHE ===

  cacheLists(lists: ShoppingList[]): void {
    try {
      const cacheEntry: CacheEntry<ShoppingList[]> = {
        data: lists,
        timestamp: Date.now(),
        version: this.CACHE_VERSION
      };

      const compressed = this.compressData(cacheEntry);
      localStorage.setItem(this.LISTS_KEY, compressed);
      
      console.log(`💾 Cached ${lists.length} lists (${this.getStorageSize(compressed)} KB)`);
    } catch (error) {
      console.error('❌ Failed to cache lists:', error);
      this.clearCache('lists');
    }
  }

  getCachedLists(): { data: ShoppingList[] | null; status: CacheStatus } {
    try {
      const cached = localStorage.getItem(this.LISTS_KEY);
      if (!cached) {
        return {
          data: null,
          status: { hasCache: false, isExpired: false, age: 0, lastUpdated: null }
        };
      }

      const cacheEntry: CacheEntry<ShoppingList[]> = this.decompressData(cached);
      const age = Date.now() - cacheEntry.timestamp;
      const isExpired = age > this.CACHE_TTL;
      const lastUpdated = new Date(cacheEntry.timestamp);

      const status: CacheStatus = {
        hasCache: true,
        isExpired,
        age,
        lastUpdated
      };

      // Convert date strings back to Date objects
      const listsWithDates = cacheEntry.data.map(list => ({
        ...list,
        createdAt: new Date(list.createdAt),
        updatedAt: new Date(list.updatedAt)
      }));

      return {
        data: listsWithDates,
        status
      };

    } catch (error) {
      console.error('❌ Failed to read lists cache:', error);
      this.clearCache('lists');
      return {
        data: null,
        status: { hasCache: false, isExpired: false, age: 0, lastUpdated: null }
      };
    }
  }

  // === CACHE MANAGEMENT ===

  getCacheStatus(): {
    articles: CacheStatus;
    lists: CacheStatus;
    totalSize: number;
  } {
    const articlesResult = this.getCachedArticles();
    const listsResult = this.getCachedLists();
    
    return {
      articles: articlesResult.status,
      lists: listsResult.status,
      totalSize: this.getTotalCacheSize()
    };
  }

  clearCache(type?: 'articles' | 'lists' | 'all'): void {
    try {
      switch (type) {
        case 'articles':
          localStorage.removeItem(this.ARTICLES_KEY);
          console.log('🗑️ Articles cache cleared');
          break;
        case 'lists':
          localStorage.removeItem(this.LISTS_KEY);
          console.log('🗑️ Lists cache cleared');
          break;
        case 'all':
        default:
          localStorage.removeItem(this.ARTICLES_KEY);
          localStorage.removeItem(this.LISTS_KEY);
          console.log('🗑️ All cache cleared');
          break;
      }
    } catch (error) {
      console.error('❌ Failed to clear cache:', error);
    }
  }

  isExpired(): boolean {
    const status = this.getCacheStatus();
    return status.articles.isExpired || status.lists.isExpired;
  }

  hasValidCache(): boolean {
    const status = this.getCacheStatus();
    return (status.articles.hasCache && !status.articles.isExpired) ||
           (status.lists.hasCache && !status.lists.isExpired);
  }

  getOldestCacheAge(): number | null {
    const status = this.getCacheStatus();
    const ages = [
      status.articles.hasCache ? status.articles.age : null,
      status.lists.hasCache ? status.lists.age : null
    ].filter(age => age !== null) as number[];

    return ages.length > 0 ? Math.max(...ages) : null;
  }

  // === UTILITY METHODS ===

  private compressData<T>(data: T): string {
    // Simple JSON stringify - could add actual compression later if needed
    return JSON.stringify(data);
  }

  private decompressData<T>(compressed: string): T {
    return JSON.parse(compressed);
  }

  private getStorageSize(data: string): number {
    // Return size in KB
    return Math.round(new Blob([data]).size / 1024);
  }

  private getTotalCacheSize(): number {
    let totalSize = 0;
    
    try {
      const articles = localStorage.getItem(this.ARTICLES_KEY);
      const lists = localStorage.getItem(this.LISTS_KEY);
      
      if (articles) totalSize += this.getStorageSize(articles);
      if (lists) totalSize += this.getStorageSize(lists);
      
    } catch (error) {
      console.error('Error calculating cache size:', error);
    }
    
    return totalSize;
  }

  /**
   * Format age for display (e.g., "2 hours ago", "1 day ago")
   */
  formatAge(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} Tag${days > 1 ? 'e' : ''} alt`;
    } else if (hours > 0) {
      return `${hours} Stunde${hours > 1 ? 'n' : ''} alt`;
    } else if (minutes > 0) {
      return `${minutes} Minute${minutes > 1 ? 'n' : ''} alt`;
    } else {
      return 'Gerade aktualisiert';
    }
  }

  /**
   * Check if cache is approaching expiration (warn at 24h+)
   */
  isApproachingExpiration(): boolean {
    const age = this.getOldestCacheAge();
    if (!age) return false;
    
    const hours = age / (60 * 60 * 1000);
    return hours >= 24; // Warn after 24 hours
  }
}