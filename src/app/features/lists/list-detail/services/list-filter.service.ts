import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * List Filter Service
 *
 * Manages filter state and search logic for list detail views.
 * Handles auto-switching between filters when search yields no results.
 *
 * @example
 * ```typescript
 * constructor(private filterService: ListFilterService) {
 *   this.filterService.shoppingFilter$.subscribe(filter => {
 *     console.log('Current shopping filter:', filter);
 *   });
 * }
 * ```
 */

export type ShoppingFilter = 'offen' | 'erledigt' | 'alle';
export type EditFilter = 'gelistet' | 'fehlend' | 'alle';
export type ViewMode = 'shopping' | 'edit';

@Injectable({
  providedIn: 'root'
})
export class ListFilterService {

  // === FILTER STATE ===
  private readonly _shoppingFilter$ = new BehaviorSubject<ShoppingFilter>('offen');
  private readonly _editFilter$ = new BehaviorSubject<EditFilter>('alle');
  private readonly _searchQuery$ = new BehaviorSubject<string>('');

  // === EXPOSED OBSERVABLES ===
  readonly shoppingFilter$: Observable<ShoppingFilter> = this._shoppingFilter$.asObservable();
  readonly editFilter$: Observable<EditFilter> = this._editFilter$.asObservable();
  readonly searchQuery$: Observable<string> = this._searchQuery$.asObservable();

  // === INTERNAL STATE ===
  private previousFilterBeforeSearch: ShoppingFilter | EditFilter | null = null;

  /**
   * Gets the current shopping filter value
   */
  get currentShoppingFilter(): ShoppingFilter {
    return this._shoppingFilter$.value;
  }

  /**
   * Gets the current edit filter value
   */
  get currentEditFilter(): EditFilter {
    return this._editFilter$.value;
  }

  /**
   * Gets the current search query value
   */
  get currentSearchQuery(): string {
    return this._searchQuery$.value;
  }

  /**
   * Sets the shopping mode filter
   *
   * @param filter - Filter type ('offen', 'erledigt', or 'alle')
   *
   * @example
   * ```typescript
   * filterService.setShoppingFilter('offen'); // Show only unchecked items
   * ```
   */
  setShoppingFilter(filter: ShoppingFilter): void {
    this._shoppingFilter$.next(filter);
  }

  /**
   * Sets the edit mode filter
   *
   * @param filter - Filter type ('gelistet', 'fehlend', or 'alle')
   *
   * @example
   * ```typescript
   * filterService.setEditFilter('gelistet'); // Show only listed articles
   * ```
   */
  setEditFilter(filter: EditFilter): void {
    this._editFilter$.next(filter);
  }

  /**
   * Updates the search query
   *
   * @param query - Search string
   *
   * @example
   * ```typescript
   * filterService.setSearchQuery('Milch');
   * ```
   */
  setSearchQuery(query: string): void {
    this._searchQuery$.next(query.trim());
  }

  /**
   * Auto-switches to "alle" filter when search yields no results
   * Remembers the previous filter for restoration after item is added
   *
   * @param mode - Current view mode ('shopping' or 'edit')
   * @returns true if filter was switched, false otherwise
   *
   * @example
   * ```typescript
   * if (articles.length === 0 && searchQuery) {
   *   filterService.autoSwitchToAllFilter('shopping');
   * }
   * ```
   */
  autoSwitchToAllFilter(mode: ViewMode): boolean {
    if (mode === 'shopping' && this.currentShoppingFilter !== 'alle') {
      this.previousFilterBeforeSearch = this.currentShoppingFilter;
      this.setShoppingFilter('alle');
      return true;
    } else if (mode === 'edit' && this.currentEditFilter !== 'alle') {
      this.previousFilterBeforeSearch = this.currentEditFilter;
      this.setEditFilter('alle');
      return true;
    }
    return false;
  }

  /**
   * Restores the previous filter after adding an item via search
   *
   * @param mode - Current view mode ('shopping' or 'edit')
   *
   * @example
   * ```typescript
   * // After adding item from search results
   * filterService.restorePreviousFilter('shopping');
   * ```
   */
  restorePreviousFilter(mode: ViewMode): void {
    if (!this.previousFilterBeforeSearch) {
      return;
    }

    if (mode === 'shopping') {
      this.setShoppingFilter(this.previousFilterBeforeSearch as ShoppingFilter);
    } else if (mode === 'edit') {
      this.setEditFilter(this.previousFilterBeforeSearch as EditFilter);
    }

    this.previousFilterBeforeSearch = null;
  }

  /**
   * Clears the search query
   *
   * @example
   * ```typescript
   * filterService.clearSearch();
   * ```
   */
  clearSearch(): void {
    this._searchQuery$.next('');
  }

  /**
   * Resets all filters to default values
   * - Shopping filter: 'offen'
   * - Edit filter: 'alle'
   * - Search query: ''
   *
   * @example
   * ```typescript
   * // When navigating away from list detail
   * filterService.resetFilters();
   * ```
   */
  resetFilters(): void {
    this._shoppingFilter$.next('offen');
    this._editFilter$.next('alle');
    this._searchQuery$.next('');
    this.previousFilterBeforeSearch = null;
  }

  /**
   * Cleans up resources
   * Should be called when the component using this service is destroyed
   */
  cleanup(): void {
    this.resetFilters();
  }
}
