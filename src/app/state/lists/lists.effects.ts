import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { map, catchError, switchMap, mergeMap } from 'rxjs/operators';

import { ListsRepositoryService } from '../../core/services/lists-repository.service';
import { FirebaseDataService } from '../../core/services/firebase-data.service';
import { AuthService } from '../../core/services/auth.service';
import * as ListsActions from './lists.actions';

// DEBUG FLAG - Set to true to enable detailed console logging for debugging NgRx effects
const DEBUG_LISTS_EFFECTS = false;

/**
 * Lists Effects
 * Handles side effects for list operations by calling existing Firebase services
 *
 * Strategy: Effects call existing services (ListsRepositoryService, FirebaseDataService)
 * This preserves all existing Firebase logic and offline handling
 */
@Injectable()
export class ListsEffects {
  private actions$ = inject(Actions);
  private listsRepository = inject(ListsRepositoryService);
  private firebaseData = inject(FirebaseDataService);
  private authService = inject(AuthService);

  /**
   * Load all lists from Firebase
   * Calls: firebaseData.getLists() - Observable that emits list updates
   */
  loadLists$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListsActions.loadLists),
      switchMap(() => {
        return this.firebaseData.getLists().pipe(
          map((lists) => {
            if (DEBUG_LISTS_EFFECTS) {
              const currentUserId = this.authService.getCurrentUserId();
              const sharedParticipantLists = lists.filter(list => {
                const isOwner = currentUserId && list.ownerId === currentUserId;
                return !isOwner && list.sharedWith && list.sharedWith.length > 0;
              });

              if (sharedParticipantLists.length > 0) {
                console.log('\n🎬 [NGRX EFFECTS] Lists received from Firebase service');
                console.log(`   - Total lists: ${lists.length}`);
                console.log(`   - Shared lists (participant): ${sharedParticipantLists.length}`);

                sharedParticipantLists.forEach(list => {
                  console.log(`\n📋 SHARED LIST (participant): "${list.name}"`);
                  console.log(`   - List ID: ${list.id}`);
                  console.log(`   - Owner ID: ${list.ownerId}`);
                  console.log(`   - Article IDs: [${list.articleIds.join(', ')}]`);
                  console.log(`   - Total Articles: ${list.articleIds.length}`);
                  console.log(`   - ItemStates keys: [${Object.keys(list.itemStates || {}).join(', ')}]`);
                });
              }
            }
            return ListsActions.loadListsSuccess({ lists });
          }),
          catchError((error) => {
            if (DEBUG_LISTS_EFFECTS) {
              console.error('❌ [NGRX EFFECTS] Error loading lists:', error);
            }
            return of(
              ListsActions.loadListsFailure({
                error: error.message || 'Failed to load lists',
              })
            );
          })
        );
      })
    )
  );

  /**
   * Load a single list by ID
   * Calls: firebaseData.getList(id)
   */
  loadList$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListsActions.loadList),
      switchMap(({ listId }) =>
        this.firebaseData.getList(listId).pipe(
          map((list) => {
            if (!list) {
              return ListsActions.loadListFailure({
                error: `List ${listId} not found`,
              });
            }
            return ListsActions.loadListSuccess({ list });
          }),
          catchError((error) =>
            of(
              ListsActions.loadListFailure({
                error: error.message || 'Failed to load list',
              })
            )
          )
        )
      )
    )
  );

  /**
   * Create a new list
   * Calls: listsRepository.createList()
   */
  createList$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListsActions.createList),
      mergeMap(({ name, icon, color, shopId }) =>
        this.listsRepository
          .createList({
            name,
            icon,
            color,
            shopId,
            articleIds: [],
            itemStates: {},
            departmentOrder: [],
          })
          .pipe(
            map((list) => ListsActions.createListSuccess({ list })),
            catchError((error) =>
              of(
                ListsActions.createListFailure({
                  error: error.message || 'Failed to create list',
                })
              )
            )
          )
      )
    )
  );

  /**
   * Update an existing list
   * Calls: listsRepository.updateList()
   */
  updateList$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListsActions.updateList),
      mergeMap(({ listId, changes }) =>
        this.listsRepository.updateList(listId, changes).pipe(
          map((list) => {
            if (!list) {
              return ListsActions.updateListFailure({
                error: `List ${listId} not found`,
              });
            }
            return ListsActions.updateListSuccess({ list });
          }),
          catchError((error) =>
            of(
              ListsActions.updateListFailure({
                error: error.message || 'Failed to update list',
              })
            )
          )
        )
      )
    )
  );

  /**
   * Delete a list
   * Calls: listsRepository.deleteList()
   */
  deleteList$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListsActions.deleteList),
      mergeMap(({ listId }) =>
        this.listsRepository.deleteList(listId).pipe(
          map((success) => {
            if (!success) {
              return ListsActions.deleteListFailure({
                error: 'Failed to delete list',
              });
            }
            return ListsActions.deleteListSuccess({ listId });
          }),
          catchError((error) =>
            of(
              ListsActions.deleteListFailure({
                error: error.message || 'Failed to delete list',
              })
            )
          )
        )
      )
    )
  );

  /**
   * Add an article to a list
   * Calls: listsRepository.addArticleToList()
   * Then reloads the list to get updated state
   */
  addArticleToList$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListsActions.addArticleToList),
      mergeMap(({ listId, articleId, amount }) =>
        this.listsRepository.addArticleToList(listId, articleId).pipe(
          switchMap(() =>
            // Optionally update amount if provided
            amount
              ? this.listsRepository.updateListItemAmount(
                  listId,
                  articleId,
                  amount
                )
              : of(true)
          ),
          switchMap(() =>
            // Reload list to get updated state
            this.firebaseData.getList(listId).pipe(
              map((list) => {
                if (!list) {
                  return ListsActions.addArticleToListFailure({
                    error: 'List not found after adding article',
                  });
                }
                return ListsActions.addArticleToListSuccess({ list });
              })
            )
          ),
          catchError((error) =>
            of(
              ListsActions.addArticleToListFailure({
                error: error.message || 'Failed to add article to list',
              })
            )
          )
        )
      )
    )
  );

  /**
   * Remove an article from a list
   * Calls: listsRepository.removeArticleFromList()
   */
  removeArticleFromList$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListsActions.removeArticleFromList),
      mergeMap(({ listId, articleId }) =>
        this.listsRepository.removeArticleFromList(listId, articleId).pipe(
          switchMap(() =>
            this.firebaseData.getList(listId).pipe(
              map((list) => {
                if (!list) {
                  return ListsActions.removeArticleFromListFailure({
                    error: 'List not found after removing article',
                  });
                }
                return ListsActions.removeArticleFromListSuccess({ list });
              })
            )
          ),
          catchError((error) =>
            of(
              ListsActions.removeArticleFromListFailure({
                error: error.message || 'Failed to remove article from list',
              })
            )
          )
        )
      )
    )
  );

  /**
   * Toggle article checked state
   * Calls: listsRepository.toggleItemChecked()
   */
  toggleArticleChecked$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListsActions.toggleArticleChecked),
      mergeMap(({ listId, articleId }) =>
        this.listsRepository.toggleItemChecked(listId, articleId).pipe(
          switchMap(() =>
            this.firebaseData.getList(listId).pipe(
              map((list) => {
                if (!list) {
                  return ListsActions.toggleArticleCheckedFailure({
                    error: 'List not found after toggling article',
                  });
                }
                return ListsActions.toggleArticleCheckedSuccess({ list });
              })
            )
          ),
          catchError((error) =>
            of(
              ListsActions.toggleArticleCheckedFailure({
                error: error.message || 'Failed to toggle article',
              })
            )
          )
        )
      )
    )
  );

  /**
   * Update article amount in list
   * Calls: listsRepository.updateListItemAmount()
   */
  updateArticleAmount$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListsActions.updateArticleAmount),
      mergeMap(({ listId, articleId, amount }) =>
        this.listsRepository.updateListItemAmount(listId, articleId, amount).pipe(
          switchMap(() =>
            this.firebaseData.getList(listId).pipe(
              map((list) => {
                if (!list) {
                  return ListsActions.updateArticleAmountFailure({
                    error: 'List not found after updating amount',
                  });
                }
                return ListsActions.updateArticleAmountSuccess({ list });
              })
            )
          ),
          catchError((error) =>
            of(
              ListsActions.updateArticleAmountFailure({
                error: error.message || 'Failed to update article amount',
              })
            )
          )
        )
      )
    )
  );

  /**
   * Update department order for a list
   * Calls: listsRepository.updateListDepartmentOrder()
   */
  updateDepartmentOrder$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListsActions.updateDepartmentOrder),
      mergeMap(({ listId, departmentOrder }) =>
        this.listsRepository.updateListDepartmentOrder(listId, departmentOrder).pipe(
          switchMap(() =>
            this.firebaseData.getList(listId).pipe(
              map((list) => {
                if (!list) {
                  return ListsActions.updateDepartmentOrderFailure({
                    error: 'List not found after updating department order',
                  });
                }
                return ListsActions.updateDepartmentOrderSuccess({ list });
              })
            )
          ),
          catchError((error) =>
            of(
              ListsActions.updateDepartmentOrderFailure({
                error: error.message || 'Failed to update department order',
              })
            )
          )
        )
      )
    )
  );
}
