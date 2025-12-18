import { createFeatureSelector, createSelector } from '@ngrx/store';
import { AuthState } from './auth.state';

/**
 * Auth Selectors
 */
export const selectAuthState = createFeatureSelector<AuthState>('auth');

export const selectUser = createSelector(
  selectAuthState,
  (state: AuthState) => state.user
);

export const selectIsAuthenticated = createSelector(
  selectAuthState,
  (state: AuthState) => state.isAuthenticated
);

export const selectAuthLoading = createSelector(
  selectAuthState,
  (state: AuthState) => state.loading
);

export const selectAuthError = createSelector(
  selectAuthState,
  (state: AuthState) => state.error
);

export const selectUserId = createSelector(
  selectUser,
  (user) => user?.id || null
);

export const selectUserEmail = createSelector(
  selectUser,
  (user) => user?.email || null
);

export const selectUserName = createSelector(
  selectUser,
  (user) => user?.name || null
);
