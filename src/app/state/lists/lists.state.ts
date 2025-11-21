import { EntityState } from '@ngrx/entity';
import { ShoppingList } from '../../core/models';

/**
 * Lists state interface using @ngrx/entity
 * Entity pattern provides standardized CRUD operations
 */
export interface ListsState extends EntityState<ShoppingList> {
  /** Currently selected list ID */
  selectedListId: string | null;
  /** Loading indicator for async operations */
  loading: boolean;
  /** Error message from failed operations */
  error: string | null;
  /** Timestamp of last successful sync */
  lastSync: Date | null;
}

/**
 * Initial state for lists feature
 */
export const initialListsState = {
  selectedListId: null as string | null,
  loading: false as boolean,
  error: null as string | null,
  lastSync: null as Date | null,
};
