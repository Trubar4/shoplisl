import { createReducer } from '@ngrx/store';
import { EntityAdapter, createEntityAdapter } from '@ngrx/entity';
import { Article } from '../../core/models';
import { ArticlesState, initialArticlesState } from './articles.state';

/**
 * Entity adapter for articles
 */
export const articlesAdapter: EntityAdapter<Article> = createEntityAdapter<Article>({
  selectId: (article: Article) => article.id,
  sortComparer: (a: Article, b: Article) => a.name.localeCompare(b.name),
});

/**
 * Initial state using entity adapter
 */
const initialState: ArticlesState = articlesAdapter.getInitialState(initialArticlesState);

/**
 * Articles reducer (minimal implementation)
 * Full implementation will be added in next step
 */
export const articlesReducer = createReducer(
  initialState
  // Actions will be added in next step
);

// Export state type
export type { ArticlesState };
