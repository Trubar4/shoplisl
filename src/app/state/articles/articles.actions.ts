import { createAction, props } from '@ngrx/store';
import { Article } from '../../core/models';

// ========================================
// Load Articles Actions
// ========================================

/** Load all articles from Firebase */
export const loadArticles = createAction(
  '[Articles] Load Articles'
);

/** Articles loaded successfully */
export const loadArticlesSuccess = createAction(
  '[Articles] Load Articles Success',
  props<{ articles: Article[] }>()
);

/** Articles load failed */
export const loadArticlesFailure = createAction(
  '[Articles] Load Articles Failure',
  props<{ error: string }>()
);

// ========================================
// Load Single Article Actions
// ========================================

/** Load a specific article by ID */
export const loadArticle = createAction(
  '[Articles] Load Article',
  props<{ articleId: string }>()
);

/** Single article loaded successfully */
export const loadArticleSuccess = createAction(
  '[Articles] Load Article Success',
  props<{ article: Article }>()
);

/** Single article load failed */
export const loadArticleFailure = createAction(
  '[Articles] Load Article Failure',
  props<{ error: string }>()
);

// ========================================
// Create Article Actions
// ========================================

/** Create a new article */
export const createArticle = createAction(
  '[Articles] Create Article',
  props<{
    name: string;
    amount?: string;
    notes?: string;
    icon?: string;
    categoryId?: string;
    departmentId?: string;
    ownerId?: string;  // Phase 8: Optional for creating articles in shared lists
  }>()
);

/** Article created successfully */
export const createArticleSuccess = createAction(
  '[Articles] Create Article Success',
  props<{ article: Article }>()
);

/** Article creation failed */
export const createArticleFailure = createAction(
  '[Articles] Create Article Failure',
  props<{ error: string }>()
);

// ========================================
// Create Article with Duplicate Check
// ========================================

/** Create article with duplicate name check */
export const createArticleWithCheck = createAction(
  '[Articles] Create Article With Check',
  props<{
    name: string;
    amount?: string;
    notes?: string;
    icon?: string;
    categoryId?: string;
    departmentId?: string;
  }>()
);

/** Article created with check - success */
export const createArticleWithCheckSuccess = createAction(
  '[Articles] Create Article With Check Success',
  props<{ article: Article; isDuplicate: boolean }>()
);

/** Article creation with check failed */
export const createArticleWithCheckFailure = createAction(
  '[Articles] Create Article With Check Failure',
  props<{ error: string }>()
);

// ========================================
// Update Article Actions
// ========================================

/** Update an existing article */
export const updateArticle = createAction(
  '[Articles] Update Article',
  props<{ articleId: string; changes: Partial<Article> }>()
);

/** Article updated successfully */
export const updateArticleSuccess = createAction(
  '[Articles] Update Article Success',
  props<{ article: Article }>()
);

/** Article update failed */
export const updateArticleFailure = createAction(
  '[Articles] Update Article Failure',
  props<{ error: string }>()
);

// ========================================
// Delete Article Actions
// ========================================

/** Delete an article */
export const deleteArticle = createAction(
  '[Articles] Delete Article',
  props<{ articleId: string }>()
);

/** Article deleted successfully */
export const deleteArticleSuccess = createAction(
  '[Articles] Delete Article Success',
  props<{ articleId: string }>()
);

/** Article deletion failed */
export const deleteArticleFailure = createAction(
  '[Articles] Delete Article Failure',
  props<{ error: string }>()
);

// ========================================
// Delete Article with Cleanup
// ========================================

/** Delete article and remove from all lists */
export const deleteArticleWithCleanup = createAction(
  '[Articles] Delete Article With Cleanup',
  props<{ articleId: string }>()
);

/** Article deleted with cleanup successfully */
export const deleteArticleWithCleanupSuccess = createAction(
  '[Articles] Delete Article With Cleanup Success',
  props<{ articleId: string; listsUpdated: number }>()
);

/** Article deletion with cleanup failed */
export const deleteArticleWithCleanupFailure = createAction(
  '[Articles] Delete Article With Cleanup Failure',
  props<{ error: string }>()
);

// ========================================
// Check Article Name Actions
// ========================================

/** Check if article name already exists */
export const checkArticleNameExists = createAction(
  '[Articles] Check Article Name Exists',
  props<{ name: string; excludeId?: string }>()
);

/** Article name check result */
export const checkArticleNameExistsResult = createAction(
  '[Articles] Check Article Name Exists Result',
  props<{ exists: boolean; name: string }>()
);

// ========================================
// UI State Actions
// ========================================

/** Select an article (for editing/viewing) */
export const selectArticle = createAction(
  '[Articles] Select Article',
  props<{ articleId: string | null }>()
);

/** Clear any error messages */
export const clearError = createAction(
  '[Articles] Clear Error'
);

/** Set filter/search query for articles */
export const setArticleFilter = createAction(
  '[Articles] Set Article Filter',
  props<{ filter: string }>()
);
