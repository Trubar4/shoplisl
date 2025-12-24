import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import {
  Auth,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  User as FirebaseUser,
  setPersistence,
  browserLocalPersistence
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  setDoc,
  getDoc,
  Timestamp
} from '@angular/fire/firestore';
import { User } from '../models';
import { LoggerService } from './logger.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEventType } from '../models/analytics.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private authInitialized = false;

  constructor(
    private logger: LoggerService,
    private auth: Auth,
    private firestore: Firestore,
    private analyticsService: AnalyticsService
  ) {
    this.initAuthPersistence();
    this.initAuthStateListener();
  }

  /**
   * Configure Firebase Auth persistence to keep users logged in
   * Uses browserLocalPersistence for indefinite session (until sign-out)
   */
  private async initAuthPersistence(): Promise<void> {
    try {
      await setPersistence(this.auth, browserLocalPersistence);
      this.logger.info('auth', 'Auth persistence configured: browserLocalPersistence (indefinite session)');
    } catch (error) {
      this.logger.error('auth', 'Failed to set auth persistence', error);
    }
  }

  /**
   * Initialize Firebase auth state listener
   */
  private initAuthStateListener(): void {
    onAuthStateChanged(this.auth, async (firebaseUser) => {
      if (firebaseUser) {
        this.logger.info('auth', `User authenticated: ${firebaseUser.email}`);
        const user = await this.getOrCreateUserProfile(firebaseUser);
        this.currentUserSubject.next(user);
      } else {
        this.logger.info('auth', 'User logged out');
        this.currentUserSubject.next(null);
      }
      this.authInitialized = true;
    });
  }

  /**
   * Get or create user profile in Firestore
   */
  private async getOrCreateUserProfile(firebaseUser: FirebaseUser): Promise<User> {
    const userDocRef = doc(this.firestore, `users-v2/${firebaseUser.uid}`);

    try {
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const data = userDoc.data();
        const user = {
          id: firebaseUser.uid,
          name: data['name'] || firebaseUser.displayName || 'Anonymous',
          email: data['email'] || firebaseUser.email || undefined,
          createdAt: data['createdAt']?.toDate() || new Date()
        };

        // Track login event
        this.analyticsService.trackEvent(
          user.id,
          AnalyticsEventType.USER_LOGIN,
          {
            email: user.email,
            name: user.name
          }
        );

        return user;
      } else {
        // Create new user profile
        const newUser: User = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || 'Anonymous',
          email: firebaseUser.email || undefined,
          createdAt: new Date()
        };

        await setDoc(userDocRef, {
          name: newUser.name,
          email: newUser.email,
          createdAt: Timestamp.fromDate(newUser.createdAt),
          updatedAt: Timestamp.fromDate(new Date())
        });

        this.logger.info('auth', `Created user profile for ${newUser.email}`);

        // Track signup event
        this.analyticsService.trackEvent(
          newUser.id,
          AnalyticsEventType.USER_SIGNUP,
          {
            email: newUser.email,
            name: newUser.name,
            signupDate: newUser.createdAt.toISOString()
          }
        );

        return newUser;
      }
    } catch (error) {
      this.logger.error('auth', 'Error getting/creating user profile', error);
      // Return basic user info even if profile creation fails
      return {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || 'Anonymous',
        email: firebaseUser.email || undefined,
        createdAt: new Date()
      };
    }
  }

  /**
   * Sign in with Google
   */
  async signInWithGoogle(): Promise<User | null> {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(this.auth, provider);

      if (result.user) {
        this.logger.info('auth', `Google sign-in successful: ${result.user.email}`);
        const user = await this.getOrCreateUserProfile(result.user);
        return user;
      }

      return null;
    } catch (error: any) {
      this.logger.error('auth', 'Google sign-in failed', error);
      throw error;
    }
  }

  /**
   * Sign out current user
   */
  async signOutUser(): Promise<void> {
    try {
      const userId = this.getCurrentUserId();

      await signOut(this.auth);

      // Track logout event (before user is cleared)
      if (userId) {
        this.analyticsService.trackEvent(
          userId,
          AnalyticsEventType.USER_LOGOUT,
          {
            timestamp: new Date().toISOString()
          }
        );
      }

      this.logger.info('auth', 'User signed out successfully');
    } catch (error) {
      this.logger.error('auth', 'Sign out failed', error);
      throw error;
    }
  }

  /**
   * Get current user observable
   */
  getCurrentUser(): Observable<User | null> {
    return this.currentUserSubject.asObservable();
  }

  /**
   * Get current user value (synchronous)
   */
  getCurrentUserValue(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Get current user ID
   */
  getCurrentUserId(): string | null {
    return this.currentUserSubject.value?.id || null;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
  }

  /**
   * Wait for auth to initialize
   */
  async waitForAuthInit(): Promise<void> {
    if (this.authInitialized) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.authInitialized) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }
}
