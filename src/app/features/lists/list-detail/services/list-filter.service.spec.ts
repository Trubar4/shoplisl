import { describe, it, expect, beforeEach } from 'vitest';
import { ListFilterService, ShoppingFilter, EditFilter } from './list-filter.service';

/**
 * List Filter Service Tests
 *
 * Test Coverage:
 * - Filter state management
 * - Search query management
 * - Auto-switch to "alle" filter
 * - Previous filter restoration
 * - Filter reset
 */

describe('ListFilterService', () => {
  let service: ListFilterService;

  beforeEach(() => {
    service = new ListFilterService();
  });

  // === SHOPPING FILTER TESTS ===
  describe('Shopping Filter', () => {
    it('should initialize with "offen" filter', () => {
      expect(service.currentShoppingFilter).toBe('offen');
    });

    it('should update shopping filter', () => {
      let capturedFilter: ShoppingFilter | null = null;
      service.shoppingFilter$.subscribe((filter) => {
        capturedFilter = filter;
      });

      service.setShoppingFilter('erledigt');
      expect(capturedFilter).toBe('erledigt');
    });

    it('should emit changes to shopping filter observers', () => {
      const filters: ShoppingFilter[] = [];
      service.shoppingFilter$.subscribe(filter => filters.push(filter));

      service.setShoppingFilter('alle');
      service.setShoppingFilter('offen');

      expect(filters).toEqual(['offen', 'alle', 'offen']);
    });
  });

  // === EDIT FILTER TESTS ===
  describe('Edit Filter', () => {
    it('should initialize with "alle" filter', () => {
      expect(service.currentEditFilter).toBe('alle');
    });

    it('should update edit filter', () => {
      let capturedFilter: EditFilter | null = null;
      service.editFilter$.subscribe((filter) => {
        capturedFilter = filter;
      });

      service.setEditFilter('gelistet');
      expect(capturedFilter).toBe('gelistet');
    });

    it('should emit changes to edit filter observers', () => {
      const filters: EditFilter[] = [];
      service.editFilter$.subscribe(filter => filters.push(filter));

      service.setEditFilter('fehlend');
      service.setEditFilter('alle');

      expect(filters).toEqual(['alle', 'fehlend', 'alle']);
    });
  });

  // === SEARCH QUERY TESTS ===
  describe('Search Query', () => {
    it('should initialize with empty search query', () => {
      expect(service.currentSearchQuery).toBe('');
    });

    it('should update search query', () => {
      let capturedQuery: string | null = null;
      service.searchQuery$.subscribe((query) => {
        capturedQuery = query;
      });

      service.setSearchQuery('Milch');
      expect(capturedQuery).toBe('Milch');
    });

    it('should trim search query', () => {
      service.setSearchQuery('  Milch  ');
      expect(service.currentSearchQuery).toBe('Milch');
    });

    it('should clear search query', () => {
      service.setSearchQuery('test');
      expect(service.currentSearchQuery).toBe('test');

      service.clearSearch();
      expect(service.currentSearchQuery).toBe('');
    });
  });

  // === AUTO-SWITCH TESTS ===
  describe('Auto-Switch to Alle Filter', () => {
    it('should auto-switch shopping filter to "alle" and remember previous', () => {
      service.setShoppingFilter('offen');
      const switched = service.autoSwitchToAllFilter('shopping');

      expect(switched).toBe(true);
      expect(service.currentShoppingFilter).toBe('alle');
    });

    it('should not auto-switch if already on "alle" in shopping mode', () => {
      service.setShoppingFilter('alle');
      const switched = service.autoSwitchToAllFilter('shopping');

      expect(switched).toBe(false);
      expect(service.currentShoppingFilter).toBe('alle');
    });

    it('should auto-switch edit filter to "alle" and remember previous', () => {
      service.setEditFilter('gelistet');
      const switched = service.autoSwitchToAllFilter('edit');

      expect(switched).toBe(true);
      expect(service.currentEditFilter).toBe('alle');
    });

    it('should not auto-switch if already on "alle" in edit mode', () => {
      service.setEditFilter('alle');
      const switched = service.autoSwitchToAllFilter('edit');

      expect(switched).toBe(false);
      expect(service.currentEditFilter).toBe('alle');
    });
  });

  // === PREVIOUS FILTER RESTORATION TESTS ===
  describe('Previous Filter Restoration', () => {
    it('should restore previous shopping filter', () => {
      service.setShoppingFilter('offen');
      service.autoSwitchToAllFilter('shopping');
      expect(service.currentShoppingFilter).toBe('alle');

      service.restorePreviousFilter('shopping');
      expect(service.currentShoppingFilter).toBe('offen');
    });

    it('should restore previous edit filter', () => {
      service.setEditFilter('gelistet');
      service.autoSwitchToAllFilter('edit');
      expect(service.currentEditFilter).toBe('alle');

      service.restorePreviousFilter('edit');
      expect(service.currentEditFilter).toBe('gelistet');
    });

    it('should not restore if no previous filter was saved', () => {
      service.setShoppingFilter('alle');
      service.restorePreviousFilter('shopping');
      expect(service.currentShoppingFilter).toBe('alle');
    });

    it('should clear previous filter after restoration', () => {
      service.setShoppingFilter('offen');
      service.autoSwitchToAllFilter('shopping');
      service.restorePreviousFilter('shopping');

      // Try to restore again - should not change
      service.restorePreviousFilter('shopping');
      expect(service.currentShoppingFilter).toBe('offen');
    });
  });

  // === RESET TESTS ===
  describe('Reset Filters', () => {
    it('should reset all filters to defaults', () => {
      service.setShoppingFilter('erledigt');
      service.setEditFilter('fehlend');
      service.setSearchQuery('test');

      service.resetFilters();

      expect(service.currentShoppingFilter).toBe('offen');
      expect(service.currentEditFilter).toBe('alle');
      expect(service.currentSearchQuery).toBe('');
    });

    it('should clear previous filter tracking on reset', () => {
      service.setShoppingFilter('offen');
      service.autoSwitchToAllFilter('shopping');
      service.resetFilters();

      service.restorePreviousFilter('shopping');
      expect(service.currentShoppingFilter).toBe('offen'); // Reset to default, not previous
    });
  });

  // === CLEANUP TESTS ===
  describe('Cleanup', () => {
    it('should reset filters on cleanup', () => {
      service.setShoppingFilter('erledigt');
      service.setEditFilter('fehlend');
      service.setSearchQuery('test');

      service.cleanup();

      expect(service.currentShoppingFilter).toBe('offen');
      expect(service.currentEditFilter).toBe('alle');
      expect(service.currentSearchQuery).toBe('');
    });
  });

  // === INTEGRATION TESTS ===
  describe('Integration Scenarios', () => {
    it('should handle search with auto-switch and restoration workflow', () => {
      // Start in shopping mode with "offen" filter
      service.setShoppingFilter('offen');
      expect(service.currentShoppingFilter).toBe('offen');

      // User searches, no results, auto-switch to "alle"
      service.setSearchQuery('Milch');
      service.autoSwitchToAllFilter('shopping');
      expect(service.currentShoppingFilter).toBe('alle');
      expect(service.currentSearchQuery).toBe('Milch');

      // User adds item, restore previous filter
      service.restorePreviousFilter('shopping');
      expect(service.currentShoppingFilter).toBe('offen');

      // Clear search
      service.clearSearch();
      expect(service.currentSearchQuery).toBe('');
    });

    it('should handle mode switching with independent filters', () => {
      // Shopping mode
      service.setShoppingFilter('erledigt');
      expect(service.currentShoppingFilter).toBe('erledigt');

      // Switch to edit mode
      service.setEditFilter('fehlend');
      expect(service.currentEditFilter).toBe('fehlend');

      // Shopping filter should remain unchanged
      expect(service.currentShoppingFilter).toBe('erledigt');
    });

    it('should handle multiple auto-switches correctly', () => {
      service.setShoppingFilter('offen');
      service.autoSwitchToAllFilter('shopping');
      expect(service.currentShoppingFilter).toBe('alle');

      // Second auto-switch should not change anything
      const switched = service.autoSwitchToAllFilter('shopping');
      expect(switched).toBe(false);
      expect(service.currentShoppingFilter).toBe('alle');

      // Restore should still work
      service.restorePreviousFilter('shopping');
      expect(service.currentShoppingFilter).toBe('offen');
    });
  });
});
