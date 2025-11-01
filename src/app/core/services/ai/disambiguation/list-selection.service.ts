// src/app/core/services/ai/disambiguation/list-selection.service.ts
import { Injectable } from '@angular/core';
import { take, timeout } from 'rxjs/operators';
import { DataService } from '../../data.service';
import { ShoppingList } from '../../../models';
import { DisambiguationOption, ListSelectionOption } from '../ai-models';

/**
 * List selection service for managing list operations and list disambiguation
 *
 * Handles:
 * - Finding lists by name or ID
 * - Converting lists to disambiguation options
 * - Managing list selection for multi-item operations
 *
 * @example
 * ```typescript
 * const listSelection = new ListSelectionService(dataService);
 * const options = await listSelection.getListSelectionOptions();
 * // Returns available lists formatted for user selection
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class ListSelectionService {

  constructor(
    private dataService: DataService
  ) {}

  /**
   * Gets available lists for selection
   *
   * Returns all shopping lists as selection options, formatted for display
   * in disambiguation UI. Includes list metadata like color, icon, and item count.
   *
   * @returns Promise resolving to array of list selection options
   *
   * @example
   * ```typescript
   * const options = await service.getListSelectionOptions();
   * // Returns: [
   * //   { id: '1', name: 'Einkaufen', color: '#1a9edb', icon: '🛒', itemCount: 12 },
   * //   { id: '2', name: 'Wochenende', color: '#ff5722', icon: '📅', itemCount: 5 }
   * // ]
   * ```
   *
   * @see {@link convertListsToDisambiguationOptions} for converting to disambiguation format
   */
  async getListSelectionOptions(): Promise<ListSelectionOption[]> {
    try {
      const lists = await this.dataService.getLists().pipe(take(1)).toPromise();
      if (!lists) return [];

      return lists.map(list => ({
        id: list.id,
        name: list.name,
        color: list.color || '#1a9edb',
        icon: list.icon || '🛒',
        itemCount: list.articleIds?.length || 0
      }));
    } catch (error) {
      console.error('Error getting list selection options:', error);
      return [];
    }
  }

  /**
   * Converts list options to disambiguation options format
   *
   * Transforms list selection options into the standard disambiguation option
   * format for display in the UI. Prefixes IDs with 'list_' to distinguish
   * from article options.
   *
   * @param listOptions - Array of list selection options
   * @returns Array of disambiguation options
   *
   * @example
   * ```typescript
   * const listOptions = [
   *   { id: '1', name: 'Einkaufen', color: '#1a9edb', icon: '🛒', itemCount: 12 }
   * ];
   * const disambigOptions = service.convertListsToDisambiguationOptions(listOptions);
   * // Returns: [
   * //   { id: 'list_1', displayName: 'Einkaufen', type: 'existing',
   * //     confidence: 1.0, department: '12 Artikel', icon: '🛒' }
   * // ]
   * ```
   */
  convertListsToDisambiguationOptions(listOptions: ListSelectionOption[]): DisambiguationOption[] {
    return listOptions.map(list => ({
      id: `list_${list.id}`,
      displayName: list.name,
      type: 'existing' as const,
      confidence: 1.0,
      department: `${list.itemCount} ${list.itemCount === 1 ? 'Artikel' : 'Artikel'}`,
      icon: list.icon
    }));
  }

  /**
   * Finds a list by name using fuzzy matching
   *
   * First attempts exact match (case-insensitive), then falls back to
   * partial match (contains). Returns null if no match found.
   *
   * @param listName - Name to search for
   * @returns Promise resolving to matching list or null
   *
   * @example
   * ```typescript
   * // Exact match
   * const list = await service.findListByName('Einkaufen');
   *
   * // Partial match
   * const list = await service.findListByName('Ein'); // Matches 'Einkaufen'
   *
   * // No match
   * const list = await service.findListByName('NonExistent'); // Returns null
   * ```
   */
  async findListByName(listName: string): Promise<ShoppingList | null> {
    try {
      const lists = await this.dataService.getLists().pipe(
        take(1),
        timeout(5000)
      ).toPromise();

      if (!lists) return null;

      const normalizedQuery = listName.toLowerCase().trim();

      // Exact match first
      let match = lists.find(list =>
        list.name.toLowerCase() === normalizedQuery
      );

      if (match) return match;

      // Partial match
      match = lists.find(list =>
        list.name.toLowerCase().includes(normalizedQuery) ||
        normalizedQuery.includes(list.name.toLowerCase())
      );

      return match || null;
    } catch (error) {
      console.error('Error finding list by name:', error);
      return null;
    }
  }

  /**
   * Finds a list by its unique ID
   *
   * @param listId - List ID to search for
   * @returns Promise resolving to matching list or null
   *
   * @example
   * ```typescript
   * const list = await service.findListById('abc-123-def');
   * if (list) {
   *   console.log(`Found list: ${list.name}`);
   * }
   * ```
   */
  async findListById(listId: string): Promise<ShoppingList | null> {
    try {
      const lists = await this.dataService.getLists().pipe(take(1), timeout(5000)).toPromise();
      return lists?.find(list => list.id === listId) || null;
    } catch (error) {
      console.error('Error finding list by ID:', error);
      return null;
    }
  }
}
