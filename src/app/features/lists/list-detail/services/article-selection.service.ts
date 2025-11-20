import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Service to manage article selection state in shopping mode.
 * Handles selection mode toggling, individual article selection,
 * select all functionality, and clearing selections.
 */
@Injectable()
export class ArticleSelectionService {
  // Private state subjects
  private readonly _isSelectionMode$ = new BehaviorSubject<boolean>(false);
  private readonly _selectedArticleIds$ = new BehaviorSubject<Set<string>>(new Set());

  // Public observables
  readonly isSelectionMode$: Observable<boolean> = this._isSelectionMode$.asObservable();
  readonly selectedArticleIds$: Observable<Set<string>> = this._selectedArticleIds$.asObservable();

  // Derived observables
  readonly selectedCount$: Observable<number> = this._selectedArticleIds$.pipe(
    map(ids => ids.size)
  );

  readonly hasSelection$: Observable<boolean> = this._selectedArticleIds$.pipe(
    map(ids => ids.size > 0)
  );

  /**
   * Gets the current selection mode state
   */
  get isSelectionMode(): boolean {
    return this._isSelectionMode$.value;
  }

  /**
   * Gets the current set of selected article IDs
   */
  get selectedArticleIds(): Set<string> {
    return new Set(this._selectedArticleIds$.value);
  }

  /**
   * Gets the current count of selected articles
   */
  get selectedCount(): number {
    return this._selectedArticleIds$.value.size;
  }

  /**
   * Enters selection mode
   */
  enterSelectionMode(): void {
    this._isSelectionMode$.next(true);
  }

  /**
   * Exits selection mode and clears all selections
   */
  exitSelectionMode(): void {
    this._isSelectionMode$.next(false);
    this.clearSelection();
  }

  /**
   * Toggles selection mode on/off
   */
  toggleSelectionMode(): void {
    if (this.isSelectionMode) {
      this.exitSelectionMode();
    } else {
      this.enterSelectionMode();
    }
  }

  /**
   * Toggles selection state for a single article
   */
  toggleArticle(articleId: string): void {
    const current = new Set(this._selectedArticleIds$.value);

    if (current.has(articleId)) {
      current.delete(articleId);
    } else {
      current.add(articleId);
    }

    this._selectedArticleIds$.next(current);
  }

  /**
   * Selects a single article (adds to selection if not already selected)
   */
  selectArticle(articleId: string): void {
    const current = new Set(this._selectedArticleIds$.value);
    if (!current.has(articleId)) {
      current.add(articleId);
      this._selectedArticleIds$.next(current);
    }
  }

  /**
   * Deselects a single article (removes from selection if selected)
   */
  deselectArticle(articleId: string): void {
    const current = new Set(this._selectedArticleIds$.value);
    if (current.has(articleId)) {
      current.delete(articleId);
      this._selectedArticleIds$.next(current);
    }
  }

  /**
   * Checks if an article is currently selected
   */
  isArticleSelected(articleId: string): boolean {
    return this._selectedArticleIds$.value.has(articleId);
  }

  /**
   * Selects all provided article IDs
   */
  selectAll(articleIds: string[]): void {
    const current = new Set(this._selectedArticleIds$.value);
    articleIds.forEach(id => current.add(id));
    this._selectedArticleIds$.next(current);
  }

  /**
   * Deselects all provided article IDs
   */
  deselectAll(articleIds: string[]): void {
    const current = new Set(this._selectedArticleIds$.value);
    articleIds.forEach(id => current.delete(id));
    this._selectedArticleIds$.next(current);
  }

  /**
   * Clears all selections
   */
  clearSelection(): void {
    this._selectedArticleIds$.next(new Set());
  }

  /**
   * Checks if all provided articles are selected
   */
  areAllSelected(articleIds: string[]): boolean {
    if (articleIds.length === 0) return false;
    const selected = this._selectedArticleIds$.value;
    return articleIds.every(id => selected.has(id));
  }

  /**
   * Checks if some (but not all) provided articles are selected
   */
  areSomeSelected(articleIds: string[]): boolean {
    if (articleIds.length === 0) return false;
    const selected = this._selectedArticleIds$.value;
    const selectedCount = articleIds.filter(id => selected.has(id)).length;
    return selectedCount > 0 && selectedCount < articleIds.length;
  }

  /**
   * Toggles selection for all provided article IDs
   * If all are selected, deselects all. Otherwise, selects all.
   */
  toggleAll(articleIds: string[]): void {
    if (this.areAllSelected(articleIds)) {
      this.deselectAll(articleIds);
    } else {
      this.selectAll(articleIds);
    }
  }
}
