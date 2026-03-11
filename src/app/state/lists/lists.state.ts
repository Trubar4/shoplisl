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
  /**
   * IDs of lists whose Firebase deletion is in-flight.
   * loadListsSuccess filters these out so a stale BehaviorSubject emission
   * (from the 1-second debounced mergeLists) cannot re-add a deleted list.
   */
  deletingListIds: string[];
}

/**
 * Initial state for lists feature
 */
export const initialListsState = {
  selectedListId: null as string | null,
  loading: false as boolean,
  error: null as string | null,
  lastSync: null as Date | null,
  deletingListIds: [] as string[],
};
