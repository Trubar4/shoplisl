import { EntityState } from '@ngrx/entity';
import { Article } from '../../core/models';

/**
 * Articles state interface using @ngrx/entity
 * Will be fully implemented in next step
 */
export interface ArticlesState extends EntityState<Article> {
  /** Currently selected article ID */
  selectedArticleId: string | null;
  /** Loading indicator */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Last sync timestamp */
  lastSync: Date | null;
}

/**
 * Initial state for articles feature
 */
export const initialArticlesState = {
  selectedArticleId: null as string | null,
  loading: false as boolean,
  error: null as string | null,
  lastSync: null as Date | null,
};
