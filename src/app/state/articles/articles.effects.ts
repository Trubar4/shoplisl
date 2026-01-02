import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { map, catchError, switchMap, mergeMap } from 'rxjs/operators';

import { ArticlesRepositoryService } from '../../core/services/articles-repository.service';
import { FirebaseDataService } from '../../core/services/firebase-data.service';
import * as ArticlesActions from './articles.actions';

/**
 * Articles Effects
 * Handles side effects for article operations by calling existing Firebase services
 *
 * Strategy: Effects call existing services (ArticlesRepositoryService, FirebaseDataService)
 * This preserves all existing Firebase logic and offline handling
 */
@Injectable()
export class ArticlesEffects {
  private actions$ = inject(Actions);
  private articlesRepository = inject(ArticlesRepositoryService);
  private firebaseData = inject(FirebaseDataService);

  /**
   * Load all articles from Firebase
   * Calls: firebaseData.getArticles() - Observable that emits article updates
   */
  loadArticles$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ArticlesActions.loadArticles),
      switchMap(() =>
        this.firebaseData.getArticles().pipe(
          map((articles) => {
            console.log(`🔄 NGRX EFFECT: Received ${articles.length} articles from Observable, dispatching loadArticlesSuccess`);
            return ArticlesActions.loadArticlesSuccess({ articles });
          }),
          catchError((error) =>
            of(
              ArticlesActions.loadArticlesFailure({
                error: error.message || 'Failed to load articles',
              })
            )
          )
        )
      )
    )
  );

  /**
   * Load a single article by ID
   * Calls: firebaseData.getArticle(id)
   */
  loadArticle$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ArticlesActions.loadArticle),
      switchMap(({ articleId }) =>
        this.firebaseData.getArticle(articleId).pipe(
          map((article) => {
            if (!article) {
              return ArticlesActions.loadArticleFailure({
                error: `Article ${articleId} not found`,
              });
            }
            return ArticlesActions.loadArticleSuccess({ article });
          }),
          catchError((error) =>
            of(
              ArticlesActions.loadArticleFailure({
                error: error.message || 'Failed to load article',
              })
            )
          )
        )
      )
    )
  );

  /**
   * Create a new article
   * Calls: articlesRepository.createArticle()
   */
  createArticle$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ArticlesActions.createArticle),
      mergeMap(({ name, amount, notes, icon, categoryId, departmentId }) => {
        console.log(`🔄 NGRX EFFECT: createArticle action received for "${name}"`);
        return this.articlesRepository
          .createArticle({
            name,
            amount,
            notes,
            icon,
            categoryId,
            departmentId,
            availableInShops: [],
            usageCount: 0,
          })
          .pipe(
            map((article) => {
              console.log(`🔄 NGRX EFFECT: Article created "${article.name}" (${article.id}), dispatching createArticleSuccess`);
              return ArticlesActions.createArticleSuccess({ article });
            }),
            catchError((error) => {
              console.error(`❌ NGRX EFFECT: Failed to create article:`, error);
              return of(
                ArticlesActions.createArticleFailure({
                  error: error.message || 'Failed to create article',
                })
              );
            })
          );
      })
    )
  );

  /**
   * Create article with duplicate check
   * Calls: articlesRepository.createArticleWithDuplicateCheck()
   */
  createArticleWithCheck$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ArticlesActions.createArticleWithCheck),
      mergeMap(({ name, amount, notes, icon, categoryId, departmentId }) =>
        this.articlesRepository
          .createArticleWithDuplicateCheck({
            name,
            amount,
            notes,
            icon,
            categoryId,
            departmentId,
            availableInShops: [],
            usageCount: 0,
          })
          .pipe(
            map((result) => {
              if (!result.success || !result.article) {
                return ArticlesActions.createArticleWithCheckFailure({
                  error: result.error || 'Failed to create article',
                });
              }
              return ArticlesActions.createArticleWithCheckSuccess({
                article: result.article,
                isDuplicate: result.isDuplicate || false,
              });
            }),
            catchError((error) =>
              of(
                ArticlesActions.createArticleWithCheckFailure({
                  error: error.message || 'Failed to create article with check',
                })
              )
            )
          )
      )
    )
  );

  /**
   * Update an existing article
   * Calls: articlesRepository.updateArticle()
   */
  updateArticle$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ArticlesActions.updateArticle),
      mergeMap(({ articleId, changes }) =>
        this.articlesRepository.updateArticle(articleId, changes).pipe(
          map((article) => {
            if (!article) {
              return ArticlesActions.updateArticleFailure({
                error: `Article ${articleId} not found`,
              });
            }
            return ArticlesActions.updateArticleSuccess({ article });
          }),
          catchError((error) =>
            of(
              ArticlesActions.updateArticleFailure({
                error: error.message || 'Failed to update article',
              })
            )
          )
        )
      )
    )
  );

  /**
   * Delete an article (simple delete, doesn't remove from lists)
   * Calls: articlesRepository.deleteArticle()
   */
  deleteArticle$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ArticlesActions.deleteArticle),
      mergeMap(({ articleId }) =>
        this.articlesRepository.deleteArticle(articleId).pipe(
          map((success) => {
            if (!success) {
              return ArticlesActions.deleteArticleFailure({
                error: 'Failed to delete article',
              });
            }
            return ArticlesActions.deleteArticleSuccess({ articleId });
          }),
          catchError((error) =>
            of(
              ArticlesActions.deleteArticleFailure({
                error: error.message || 'Failed to delete article',
              })
            )
          )
        )
      )
    )
  );

  /**
   * Delete article and remove from all lists
   * Calls: articlesRepository.deleteArticleAndCleanupLists()
   */
  deleteArticleWithCleanup$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ArticlesActions.deleteArticleWithCleanup),
      mergeMap(({ articleId }) =>
        this.articlesRepository.deleteArticleAndCleanupLists(articleId).pipe(
          map((result) => {
            if (!result.success) {
              // Article is still in active lists - can't delete
              const lists = result.activeInLists || [];
              return ArticlesActions.deleteArticleWithCleanupFailure({
                error: result.error || `Article is still in ${lists.length} list(s)`,
              });
            }
            return ArticlesActions.deleteArticleWithCleanupSuccess({
              articleId,
              listsUpdated: 0, // Service handles list cleanup internally
            });
          }),
          catchError((error) =>
            of(
              ArticlesActions.deleteArticleWithCleanupFailure({
                error: error.message || 'Failed to delete article with cleanup',
              })
            )
          )
        )
      )
    )
  );

  /**
   * Check if article name exists
   * Calls: articlesRepository.checkArticleNameExists()
   */
  checkArticleNameExists$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ArticlesActions.checkArticleNameExists),
      switchMap(({ name, excludeId }) =>
        this.articlesRepository.checkArticleNameExists(name, excludeId).pipe(
          map((exists) =>
            ArticlesActions.checkArticleNameExistsResult({ exists, name })
          ),
          catchError(() =>
            // On error, assume name doesn't exist (safe fallback)
            of(ArticlesActions.checkArticleNameExistsResult({ exists: false, name }))
          )
        )
      )
    )
  );
}
