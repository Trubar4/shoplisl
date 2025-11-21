import { createReducer } from '@ngrx/store';
import { AuthState, initialAuthState } from './auth.state';

/**
 * Auth reducer (minimal implementation)
 * Full implementation will be added when adding authentication in Phase 7
 */
export const authReducer = createReducer(
  initialAuthState
  // Actions will be added in Phase 7
);

// Export state type
export type { AuthState };
