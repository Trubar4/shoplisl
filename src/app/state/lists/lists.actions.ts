import { createAction, props } from '@ngrx/store';
import { ShoppingList, ListItemState } from '../../core/models';

// ========================================
// Load Lists Actions
// ========================================

/** Load all lists from Firebase */
export const loadLists = createAction(
  '[Lists] Load Lists'
);

/** Lists loaded successfully */
export const loadListsSuccess = createAction(
  '[Lists] Load Lists Success',
  props<{ lists: ShoppingList[] }>()
);

/** Lists load failed */
export const loadListsFailure = createAction(
  '[Lists] Load Lists Failure',
  props<{ error: string }>()
);

// ========================================
// Load Single List Actions
// ========================================

/** Load a specific list by ID */
export const loadList = createAction(
  '[Lists] Load List',
  props<{ listId: string }>()
);

/** Single list loaded successfully */
export const loadListSuccess = createAction(
  '[Lists] Load List Success',
  props<{ list: ShoppingList }>()
);

/** Single list load failed */
export const loadListFailure = createAction(
  '[Lists] Load List Failure',
  props<{ error: string }>()
);

// ========================================
// Create List Actions
// ========================================

/** Create a new list */
export const createList = createAction(
  '[Lists] Create List',
  props<{ name: string; icon?: string; color?: string; shopId?: string }>()
);

/** List created successfully */
export const createListSuccess = createAction(
  '[Lists] Create List Success',
  props<{ list: ShoppingList }>()
);

/** List creation failed */
export const createListFailure = createAction(
  '[Lists] Create List Failure',
  props<{ error: string }>()
);

// ========================================
// Update List Actions
// ========================================

/** Update an existing list */
export const updateList = createAction(
  '[Lists] Update List',
  props<{ listId: string; changes: Partial<ShoppingList> }>()
);

/** List updated successfully */
export const updateListSuccess = createAction(
  '[Lists] Update List Success',
  props<{ list: ShoppingList }>()
);

/** List update failed */
export const updateListFailure = createAction(
  '[Lists] Update List Failure',
  props<{ error: string }>()
);

// ========================================
// Delete List Actions
// ========================================

/** Delete a list */
export const deleteList = createAction(
  '[Lists] Delete List',
  props<{ listId: string }>()
);

/** List deleted successfully */
export const deleteListSuccess = createAction(
  '[Lists] Delete List Success',
  props<{ listId: string }>()
);

/** List deletion failed */
export const deleteListFailure = createAction(
  '[Lists] Delete List Failure',
  props<{ error: string; listId: string }>()
);

// ========================================
// List Item Actions
// ========================================

/** Add an article to a list */
export const addArticleToList = createAction(
  '[Lists] Add Article To List',
  props<{ listId: string; articleId: string; amount?: string }>()
);

/** Article added successfully */
export const addArticleToListSuccess = createAction(
  '[Lists] Add Article To List Success',
  props<{ list: ShoppingList }>()
);

/** Article add failed */
export const addArticleToListFailure = createAction(
  '[Lists] Add Article To List Failure',
  props<{ error: string }>()
);

/** Remove an article from a list */
export const removeArticleFromList = createAction(
  '[Lists] Remove Article From List',
  props<{ listId: string; articleId: string }>()
);

/** Article removed successfully */
export const removeArticleFromListSuccess = createAction(
  '[Lists] Remove Article From List Success',
  props<{ list: ShoppingList }>()
);

/** Article removal failed */
export const removeArticleFromListFailure = createAction(
  '[Lists] Remove Article From List Failure',
  props<{ error: string }>()
);

/** Toggle an article's checked state */
export const toggleArticleChecked = createAction(
  '[Lists] Toggle Article Checked',
  props<{ listId: string; articleId: string }>()
);

/** Article checked state toggled successfully */
export const toggleArticleCheckedSuccess = createAction(
  '[Lists] Toggle Article Checked Success',
  props<{ list: ShoppingList }>()
);

/** Article toggle failed */
export const toggleArticleCheckedFailure = createAction(
  '[Lists] Toggle Article Checked Failure',
  props<{ error: string }>()
);

/** Update article amount in list */
export const updateArticleAmount = createAction(
  '[Lists] Update Article Amount',
  props<{ listId: string; articleId: string; amount: string }>()
);

/** Article amount updated successfully */
export const updateArticleAmountSuccess = createAction(
  '[Lists] Update Article Amount Success',
  props<{ list: ShoppingList }>()
);

/** Article amount update failed */
export const updateArticleAmountFailure = createAction(
  '[Lists] Update Article Amount Failure',
  props<{ error: string }>()
);

// ========================================
// UI State Actions
// ========================================

/** Select a list (for routing/navigation) */
export const selectList = createAction(
  '[Lists] Select List',
  props<{ listId: string | null }>()
);

/** Clear any error messages */
export const clearError = createAction(
  '[Lists] Clear Error'
);

/** Update department order for a list */
export const updateDepartmentOrder = createAction(
  '[Lists] Update Department Order',
  props<{ listId: string; departmentOrder: string[] }>()
);

/** Department order updated successfully */
export const updateDepartmentOrderSuccess = createAction(
  '[Lists] Update Department Order Success',
  props<{ list: ShoppingList }>()
);

/** Department order update failed */
export const updateDepartmentOrderFailure = createAction(
  '[Lists] Update Department Order Failure',
  props<{ error: string }>()
);
