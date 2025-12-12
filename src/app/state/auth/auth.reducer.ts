import { createReducer, on } from '@ngrx/store';
import { AuthState, initialAuthState } from './auth.state';
import * as AuthActions from './auth.actions';

/**
 * Auth reducer - Phase 7
 */
export const authReducer = createReducer(
  initialAuthState,

  // Sign in with Google
  on(AuthActions.signInWithGoogle, (state): AuthState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(AuthActions.signInWithGoogleSuccess, (state, { user }): AuthState => ({
    ...state,
    user,
    loading: false,
    error: null,
    isAuthenticated: true
  })),

  on(AuthActions.signInWithGoogleFailure, (state, { error }): AuthState => ({
    ...state,
    loading: false,
    error,
    isAuthenticated: false
  })),

  // Sign out
  on(AuthActions.signOut, (state): AuthState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(AuthActions.signOutSuccess, (): AuthState => ({
    ...initialAuthState
  })),

  on(AuthActions.signOutFailure, (state, { error }): AuthState => ({
    ...state,
    loading: false,
    error
  })),

  // Set user (from auth state listener)
  on(AuthActions.setUser, (state, { user }): AuthState => ({
    ...state,
    user,
    isAuthenticated: user !== null,
    loading: false
  })),

  // Clear error
  on(AuthActions.clearAuthError, (state): AuthState => ({
    ...state,
    error: null
  }))
);

// Export state type
export type { AuthState };
