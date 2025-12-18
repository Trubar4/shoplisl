import { createAction, props } from '@ngrx/store';
import { User } from '../../core/models';

/**
 * Auth Actions
 */

// Sign in with Google
export const signInWithGoogle = createAction('[Auth] Sign In With Google');

export const signInWithGoogleSuccess = createAction(
  '[Auth] Sign In With Google Success',
  props<{ user: User }>()
);

export const signInWithGoogleFailure = createAction(
  '[Auth] Sign In With Google Failure',
  props<{ error: string }>()
);

// Sign out
export const signOut = createAction('[Auth] Sign Out');

export const signOutSuccess = createAction('[Auth] Sign Out Success');

export const signOutFailure = createAction(
  '[Auth] Sign Out Failure',
  props<{ error: string }>()
);

// Set user (from auth state listener)
export const setUser = createAction(
  '[Auth] Set User',
  props<{ user: User | null }>()
);

// Clear error
export const clearAuthError = createAction('[Auth] Clear Error');
