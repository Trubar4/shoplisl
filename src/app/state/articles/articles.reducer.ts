import { createReducer, on } from '@ngrx/store';
import { EntityAdapter, createEntityAdapter } from '@ngrx/entity';
import { Article } from '../../core/models';
import { ArticlesState, initialArticlesState } from './articles.state';
import * as ArticlesActions from './articles.actions';

/**
 * Entity adapter for articles
 * Provides standardized methods for managing article collection
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
 * Articles reducer
 * Handles all article-related state changes
 */
export const articlesReducer = createReducer(
  initialState,

  // ========================================
  // Load Articles
  // ========================================

  on(ArticlesActions.loadArticles, (state): ArticlesState => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(ArticlesActions.loadArticlesSuccess, (state, { articles }): ArticlesState =>
    articlesAdapter.setAll(articles, {
      ...state,
      loading: false,
      error: null,
      lastSync: new Date(),
    })
  ),

  on(ArticlesActions.loadArticlesFailure, (state, { error }): ArticlesState => ({
    ...state,
    loading: false,
    error,
  })),

  // ========================================
  // Load Single Article
  // ========================================

  on(ArticlesActions.loadArticle, (state): ArticlesState => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(ArticlesActions.loadArticleSuccess, (state, { article }): ArticlesState =>
    articlesAdapter.upsertOne(article, {
      ...state,
      loading: false,
      error: null,
    })
  ),

  on(ArticlesActions.loadArticleFailure, (state, { error }): ArticlesState => ({
    ...state,
    loading: false,
    error,
  })),

  // ========================================
  // Create Article
  // ========================================

  on(ArticlesActions.createArticle, (state): ArticlesState => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(ArticlesActions.createArticleSuccess, (state, { article }): ArticlesState =>
    articlesAdapter.addOne(article, {
      ...state,
      loading: false,
      error: null,
      selectedArticleId: article.id, // Auto-select newly created article
    })
  ),

  on(ArticlesActions.createArticleFailure, (state, { error }): ArticlesState => ({
    ...state,
    loading: false,
    error,
  })),

  // ========================================
  // Create Article with Duplicate Check
  // ========================================

  on(ArticlesActions.createArticleWithCheck, (state): ArticlesState => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(
    ArticlesActions.createArticleWithCheckSuccess,
    (state, { article }): ArticlesState =>
      articlesAdapter.addOne(article, {
        ...state,
        loading: false,
        error: null,
        selectedArticleId: article.id,
      })
  ),

  on(ArticlesActions.createArticleWithCheckFailure, (state, { error }): ArticlesState => ({
    ...state,
    loading: false,
    error,
  })),

  // ========================================
  // Update Article
  // ========================================

  on(ArticlesActions.updateArticle, (state): ArticlesState => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(ArticlesActions.updateArticleSuccess, (state, { article }): ArticlesState =>
    articlesAdapter.upsertOne(article, {
      ...state,
      loading: false,
      error: null,
    })
  ),

  on(ArticlesActions.updateArticleFailure, (state, { error }): ArticlesState => ({
    ...state,
    loading: false,
    error,
  })),

  // ========================================
  // Delete Article
  // ========================================

  on(ArticlesActions.deleteArticle, (state): ArticlesState => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(ArticlesActions.deleteArticleSuccess, (state, { articleId }): ArticlesState =>
    articlesAdapter.removeOne(articleId, {
      ...state,
      loading: false,
      error: null,
      selectedArticleId: state.selectedArticleId === articleId ? null : state.selectedArticleId,
    })
  ),

  on(ArticlesActions.deleteArticleFailure, (state, { error }): ArticlesState => ({
    ...state,
    loading: false,
    error,
  })),

  // ========================================
  // Delete Article with Cleanup
  // ========================================

  on(ArticlesActions.deleteArticleWithCleanup, (state): ArticlesState => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(
    ArticlesActions.deleteArticleWithCleanupSuccess,
    (state, { articleId }): ArticlesState =>
      articlesAdapter.removeOne(articleId, {
        ...state,
        loading: false,
        error: null,
        selectedArticleId: state.selectedArticleId === articleId ? null : state.selectedArticleId,
      })
  ),

  on(ArticlesActions.deleteArticleWithCleanupFailure, (state, { error }): ArticlesState => ({
    ...state,
    loading: false,
    error,
  })),

  // ========================================
  // Check Article Name - No state changes, just triggers effect
  // ========================================

  on(ArticlesActions.checkArticleNameExists, (state): ArticlesState => state),

  on(ArticlesActions.checkArticleNameExistsResult, (state): ArticlesState => state),

  // ========================================
  // UI State
  // ========================================

  on(ArticlesActions.selectArticle, (state, { articleId }): ArticlesState => ({
    ...state,
    selectedArticleId: articleId,
  })),

  on(ArticlesActions.clearError, (state): ArticlesState => ({
    ...state,
    error: null,
  })),

  on(ArticlesActions.setArticleFilter, (state): ArticlesState => state)
);

// Export state type
export type { ArticlesState };
