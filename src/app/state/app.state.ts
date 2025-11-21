import { ActionReducerMap } from '@ngrx/store';
import { ListsState, listsReducer } from './lists/lists.reducer';
import { ArticlesState, articlesReducer } from './articles/articles.reducer';
import { AuthState, authReducer } from './auth/auth.reducer';

/**
 * Root application state interface
 * Combines all feature states into a single state tree
 */
export interface AppState {
  lists: ListsState;
  articles: ArticlesState;
  auth: AuthState;
}

/**
 * Root reducer map
 * Maps state slices to their respective reducers
 */
export const reducers: ActionReducerMap<AppState> = {
  lists: listsReducer,
  articles: articlesReducer,
  auth: authReducer,
};
