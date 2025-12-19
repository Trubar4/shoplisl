// src/app/core/services/user-profile.service.ts
import { Injectable } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { LoggerService } from './logger.service';

/**
 * Cached user profile information
 */
export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  createdAt?: Date;
}

/**
 * Service for fetching and caching user profile information
 *
 * Phase 8: Email Display Infrastructure
 *
 * This service provides efficient user profile lookups with caching to avoid
 * repeated Firestore reads. Used for displaying user emails instead of IDs
 * in the sharing UI.
 *
 * Features:
 * - In-memory caching with Map
 * - Observable-based API with automatic sharing
 * - Graceful fallbacks for missing profiles
 * - Bulk user fetching support
 */
@Injectable({
  providedIn: 'root'
})
export class UserProfileService {
  // In-memory cache: userId -> UserProfile
  private userCache = new Map<string, UserProfile>();

  // Observable cache: userId -> Observable<UserProfile>
  // This prevents multiple simultaneous requests for the same user
  private pendingRequests = new Map<string, Observable<UserProfile>>();

  constructor(
    private firestore: Firestore,
    private logger: LoggerService
  ) {}

  /**
   * Get user profile by ID with caching
   *
   * @param userId - The user ID to look up
   * @returns Observable<UserProfile> - User profile or fallback
   */
  getUserProfile(userId: string): Observable<UserProfile> {
    // Check cache first
    if (this.userCache.has(userId)) {
      return of(this.userCache.get(userId)!);
    }

    // Check if request is already pending
    if (this.pendingRequests.has(userId)) {
      return this.pendingRequests.get(userId)!;
    }

    // Create new request
    const request$ = this.fetchUserProfile(userId).pipe(
      shareReplay(1), // Share the result and cache it
      catchError(error => {
        this.logger.error('auth', `Failed to fetch user ${userId}`, error);
        // Return fallback profile on error
        return of(this.createFallbackProfile(userId));
      })
    );

    this.pendingRequests.set(userId, request$);

    // Subscribe to cache the result
    request$.subscribe(profile => {
      this.userCache.set(userId, profile);
      this.pendingRequests.delete(userId);
    });

    return request$;
  }

  /**
   * Get user email by ID (convenience method)
   *
   * @param userId - The user ID to look up
   * @returns Observable<string> - User email or fallback string
   */
  getUserEmail(userId: string): Observable<string> {
    return this.getUserProfile(userId).pipe(
      map(profile => profile.email || this.createFallbackEmail(userId))
    );
  }

  /**
   * Get user display name by ID
   *
   * @param userId - The user ID to look up
   * @returns Observable<string> - User name or fallback
   */
  getUserName(userId: string): Observable<string> {
    return this.getUserProfile(userId).pipe(
      map(profile => profile.name || 'Unbekannter Benutzer')
    );
  }

  /**
   * Fetch multiple user profiles at once
   * Useful for loading collaborator lists
   *
   * @param userIds - Array of user IDs to fetch
   * @returns Observable<Map<string, UserProfile>> - Map of userId -> profile
   */
  getUserProfiles(userIds: string[]): Observable<Map<string, UserProfile>> {
    // Create array of observables for each user
    const profileObservables = userIds.map(userId =>
      this.getUserProfile(userId).pipe(
        map(profile => ({ userId, profile }))
      )
    );

    // Combine all observables and convert to Map
    return from(Promise.all(profileObservables.map(obs => obs.toPromise()))).pipe(
      map(results => {
        const profileMap = new Map<string, UserProfile>();
        results.forEach(result => {
          if (result) {
            profileMap.set(result.userId, result.profile);
          }
        });
        return profileMap;
      })
    );
  }

  /**
   * Preload user profiles for better UX
   * Call this when you know you'll need certain user profiles soon
   *
   * @param userIds - Array of user IDs to preload
   */
  preloadUserProfiles(userIds: string[]): void {
    userIds.forEach(userId => {
      if (!this.userCache.has(userId) && !this.pendingRequests.has(userId)) {
        // Trigger the fetch (will be cached)
        this.getUserProfile(userId).subscribe();
      }
    });
  }

  /**
   * Clear the cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.userCache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Check if a user profile is cached
   *
   * @param userId - The user ID to check
   * @returns boolean - True if cached
   */
  isCached(userId: string): boolean {
    return this.userCache.has(userId);
  }

  // === PRIVATE METHODS ===

  /**
   * Fetch user profile from Firestore
   */
  private fetchUserProfile(userId: string): Observable<UserProfile> {
    const userDocRef = doc(this.firestore, `users-v2/${userId}`);

    console.log(`🔍 UserProfileService: Fetching user profile for ${userId}`);
    this.logger.info('auth', `Fetching user profile for ${userId}`);

    return from(getDoc(userDocRef)).pipe(
      map(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log(`✅ UserProfileService: User profile found for ${userId}`, {
            hasName: !!data['name'],
            hasEmail: !!data['email'],
            name: data['name'],
            email: data['email']
          });
          this.logger.info('auth', `User profile found for ${userId}`, {
            hasName: !!data['name'],
            hasEmail: !!data['email'],
            name: data['name'],
            email: data['email']
          });
          return {
            id: userId,
            name: data['name'] || 'Unbekannter Benutzer',
            email: data['email'],
            createdAt: data['createdAt']?.toDate()
          };
        } else {
          // User doc doesn't exist - return fallback
          console.warn(`⚠️ UserProfileService: User profile NOT found for ${userId}`);
          this.logger.warn('auth', `User profile not found for ${userId}`);
          return this.createFallbackProfile(userId);
        }
      })
    );
  }

  /**
   * Create fallback profile for users that don't exist or failed to load
   */
  private createFallbackProfile(userId: string): UserProfile {
    return {
      id: userId,
      name: 'Unbekannter Benutzer',
      email: this.createFallbackEmail(userId)
    };
  }

  /**
   * Create a friendly fallback email from user ID
   * Shows first 8 characters of the ID for reference
   */
  private createFallbackEmail(userId: string): string {
    const shortId = userId.substring(0, 8);
    return `Benutzer ${shortId}`;
  }
}
