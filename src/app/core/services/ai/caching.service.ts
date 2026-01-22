// src/app/core/services/ai/caching.service.ts
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

interface CacheConfig {
  defaultTTL: number; // Default TTL in milliseconds
  maxSize: number; // Maximum number of entries
  cleanupInterval: number; // Cleanup interval in milliseconds
}

export interface CacheResult<T> {
  data: T;
  fromCache: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AICachingService {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupTimer: any;
  private cacheHits = 0;
  private cacheMisses = 0;

  private readonly config: CacheConfig = {
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    maxSize: 1000,
    cleanupInterval: 60 * 1000 // 1 minute
  };

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Get cached data or execute provider function
   * Returns data with fromCache flag for analytics tracking
   */
  getOrSet<T>(
    key: string,
    provider: () => Observable<T> | Promise<T>,
    ttl?: number
  ): Observable<CacheResult<T>> {
    const cached = this.get<T>(key);

    if (cached !== null) {
      this.cacheHits++;
      console.log('🎯 Cache HIT:', key, `(${this.getCacheHitRate()}% hit rate)`);
      return of({ data: cached, fromCache: true });
    }

    this.cacheMisses++;
    console.log('🎯 Cache MISS:', key, `(${this.getCacheHitRate()}% hit rate)`);
    const result = provider();

    if (result instanceof Promise) {
      return new Observable<CacheResult<T>>(subscriber => {
        result
          .then(data => {
            this.set(key, data, ttl);
            subscriber.next({ data, fromCache: false });
            subscriber.complete();
          })
          .catch(error => subscriber.error(error));
      });
    } else {
      return result.pipe(
        tap(data => this.set(key, data, ttl)),
        map(data => ({ data, fromCache: false }))
      );
    }
  }

  /**
   * Get data from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  /**
   * Set data in cache
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // Enforce max size
    if (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL
    };
    
    this.cache.set(key, entry);
  }

  /**
   * Remove specific cache entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear cache entries by pattern
   */
  clearByPattern(pattern: RegExp): number {
    let cleared = 0;
    
    for (const [key] of this.cache) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    
    return cleared;
  }

  /**
   * Get cache hit rate as percentage
   */
  getCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    if (total === 0) return 0;
    return Math.round((this.cacheHits / total) * 100);
  }

  /**
   * Get cache statistics
   */
  getStats(): {size: number, hitRate: number, hits: number, misses: number, memoryUsage: string} {
    const size = this.cache.size;
    const memoryUsage = this.estimateMemoryUsage();

    return {
      size,
      hitRate: this.getCacheHitRate(),
      hits: this.cacheHits,
      misses: this.cacheMisses,
      memoryUsage: `~${Math.round(memoryUsage / 1024)}KB`
    };
  }

  /**
   * Create cache key for disambiguation options
   */
  createDisambiguationKey(itemName: string, excludeId?: string): string {
    return `disambiguation:${itemName.toLowerCase()}:${excludeId || 'none'}`;
  }

  /**
   * Create cache key for smart suggestions
   */
  createSuggestionsKey(itemName: string): string {
    return `suggestions:${itemName.toLowerCase()}`;
  }

  /**
   * Create cache key for department suggestions
   */
  createDepartmentKey(itemName: string): string {
    return `department:${itemName.toLowerCase()}`;
  }

  /**
   * Create cache key for icon suggestions
   */
  createIconKey(itemName: string): string {
    return `icon:${itemName.toLowerCase()}`;
  }

  /**
   * Create cache key for list selection options
   */
  createListSelectionKey(): string {
    return `lists:selection:${Date.now() - (Date.now() % 30000)}`; // 30-second buckets
  }

  /**
   * Create cache key for article similarity
   */
  createSimilarityKey(itemName: string, articleName: string): string {
    return `similarity:${itemName.toLowerCase()}:${articleName.toLowerCase()}`;
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  private cleanup(): void {
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    
    if (keysToDelete.length > 0) {
      console.log(`🧹 Cache cleanup: removed ${keysToDelete.length} expired entries`);
    }
  }

  private estimateMemoryUsage(): number {
    let bytes = 0;
    
    for (const [key, entry] of this.cache) {
      bytes += key.length * 2; // Approximate string size
      bytes += JSON.stringify(entry.data).length * 2; // Approximate object size
      bytes += 24; // Overhead for entry object
    }
    
    return bytes;
  }

  ngOnDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}

// Cache decorators for easy method caching
export function Cached(ttl?: number) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      const originalMethod = descriptor.value;
      
      descriptor.value = function (...args: any[]) {
        // Get caching service from the instance, not descriptor
        const cacheService = (this as any).cachingService || (this as any).aiCachingService;
        if (!cacheService) {
          return originalMethod.apply(this, args);
        }
        
        const key = `${this.constructor.name}:${propertyKey}:${JSON.stringify(args)}`;
        
        return cacheService.getOrSet(
          key,
          () => originalMethod.apply(this, args),
          ttl
        );
      };
      
      return descriptor;
    };
  }