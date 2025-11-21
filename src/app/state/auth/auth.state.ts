import { User } from '../../core/models';

/**
 * Auth state interface
 * Will be fully implemented when adding authentication
 */
export interface AuthState {
  /** Currently authenticated user */
  user: User | null;
  /** Loading indicator */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Is user authenticated */
  isAuthenticated: boolean;
}

/**
 * Initial state for auth feature
 */
export const initialAuthState: AuthState = {
  user: null,
  loading: false,
  error: null,
  isAuthenticated: false,
};
