import { createFeatureSelector, createSelector } from '@ngrx/store';
import { ArticlesState } from './articles.state';
import { articlesAdapter } from './articles.reducer';

/**
 * Feature selector for articles state
 */
export const selectArticlesState = createFeatureSelector<ArticlesState>('articles');

/**
 * Entity adapter selectors
 * Provides standardized selectors for entity collection
 */
const {
  selectIds,
  selectEntities,
  selectAll,
  selectTotal,
} = articlesAdapter.getSelectors(selectArticlesState);

// ========================================
// Entity Collection Selectors
// ========================================

/** Select all article IDs as an array */
export const selectAllArticleIds = selectIds;

/** Select articles as a dictionary (id -> article) */
export const selectArticleEntities = selectEntities;

/** Select all articles as an array */
export const selectAllArticles = selectAll;

/** Select total number of articles */
export const selectArticlesTotal = selectTotal;

// ========================================
// Individual Article Selectors
// ========================================

/** Select a specific article by ID */
export const selectArticleById = (articleId: string) =>
  createSelector(selectArticleEntities, (entities) => entities[articleId] || null);

/** Select the currently selected article ID */
export const selectSelectedArticleId = createSelector(
  selectArticlesState,
  (state) => state.selectedArticleId
);

/** Select the currently selected article */
export const selectSelectedArticle = createSelector(
  selectArticleEntities,
  selectSelectedArticleId,
  (entities, selectedId) => (selectedId ? entities[selectedId] || null : null)
);

// ========================================
// Loading & Error Selectors
// ========================================

/** Select loading state */
export const selectArticlesLoading = createSelector(
  selectArticlesState,
  (state) => state.loading
);

/** Select error message */
export const selectArticlesError = createSelector(
  selectArticlesState,
  (state) => state.error
);

/** Select last sync timestamp */
export const selectArticlesLastSync = createSelector(
  selectArticlesState,
  (state) => state.lastSync
);

// ========================================
// Computed Selectors
// ========================================

/** Select articles sorted by name (already default sort) */
export const selectArticlesSortedByName = selectAll;

/** Select articles sorted by creation date (most recent first) */
export const selectArticlesSortedByCreationDate = createSelector(
  selectAllArticles,
  (articles) =>
    [...articles].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
);

/** Select articles sorted by update date (most recent first) */
export const selectArticlesSortedByUpdateDate = createSelector(
  selectAllArticles,
  (articles) =>
    [...articles].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
);

/** Select articles by department ID */
export const selectArticlesByDepartment = (departmentId: string) =>
  createSelector(selectAllArticles, (articles) =>
    articles.filter((article) => article.departmentId === departmentId)
  );

/** Select articles by category ID */
export const selectArticlesByCategory = (categoryId: string) =>
  createSelector(selectAllArticles, (articles) =>
    articles.filter((article) => article.categoryId === categoryId)
  );

/** Select articles without department */
export const selectArticlesWithoutDepartment = createSelector(
  selectAllArticles,
  (articles) => articles.filter((article) => !article.departmentId)
);

/** Select articles without category */
export const selectArticlesWithoutCategory = createSelector(
  selectAllArticles,
  (articles) => articles.filter((article) => !article.categoryId)
);

/** Select articles with notes */
export const selectArticlesWithNotes = createSelector(
  selectAllArticles,
  (articles) => articles.filter((article) => article.notes && article.notes.trim().length > 0)
);

/** Select articles by name search (case-insensitive) */
export const selectArticlesByNameSearch = (searchTerm: string) =>
  createSelector(selectAllArticles, (articles) => {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return articles;
    }
    const term = searchTerm.toLowerCase().trim();
    return articles.filter((article) => article.name.toLowerCase().includes(term));
  });

/** Select articles with specific icon */
export const selectArticlesByIcon = (icon: string) =>
  createSelector(selectAllArticles, (articles) =>
    articles.filter((article) => article.icon === icon)
  );

/** Check if any articles are loading */
export const selectHasLoadingArticles = createSelector(
  selectArticlesLoading,
  (loading) => loading
);

/** Check if articles have been loaded */
export const selectArticlesLoaded = createSelector(
  selectArticlesLastSync,
  (lastSync) => lastSync !== null
);

/** Select article count by department */
export const selectArticleCountByDepartment = createSelector(
  selectAllArticles,
  (articles) => {
    const counts = new Map<string, number>();
    articles.forEach((article) => {
      const dept = article.departmentId || 'none';
      counts.set(dept, (counts.get(dept) || 0) + 1);
    });
    return counts;
  }
);

/** Select article count by category */
export const selectArticleCountByCategory = createSelector(
  selectAllArticles,
  (articles) => {
    const counts = new Map<string, number>();
    articles.forEach((article) => {
      const cat = article.categoryId || 'none';
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
    return counts;
  }
);

/** Select recently created articles (last 7 days) */
export const selectRecentlyCreatedArticles = createSelector(
  selectAllArticles,
  (articles) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return articles.filter((article) => article.createdAt >= sevenDaysAgo);
  }
);

/** Select recently updated articles (last 7 days) */
export const selectRecentlyUpdatedArticles = createSelector(
  selectAllArticles,
  (articles) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return articles.filter((article) => article.updatedAt >= sevenDaysAgo);
  }
);
