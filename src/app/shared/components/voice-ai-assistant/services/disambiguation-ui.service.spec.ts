/**
 * Disambiguation UI Service Tests
 *
 * Comprehensive test coverage for disambiguation UI formatting including:
 * - Recipe processing helpers
 * - Progress tracking
 * - Header formatting
 * - Action descriptions and hints
 * - Icon and text helpers
 */

import { TestBed } from '@angular/core/testing';
import { DisambiguationUIService } from './disambiguation-ui.service';

describe('DisambiguationUIService', () => {
  let service: DisambiguationUIService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DisambiguationUIService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Recipe Processing Detection', () => {
    it('should detect recipe from isFromRecipe flag', () => {
      const action = { isFromRecipe: true };
      expect(service.isRecipeProcessing(action)).toBe(true);
    });

    it('should detect recipe from isMultiItemSequential flag', () => {
      const action = { isMultiItemSequential: true };
      expect(service.isRecipeProcessing(action)).toBe(true);
    });

    it('should detect recipe from originalInput containing "rezept"', () => {
      const action = { originalInput: 'Das ist ein Rezept' };
      expect(service.isRecipeProcessing(action)).toBe(true);
    });

    it('should detect recipe from many items', () => {
      const action = { allItems: ['1', '2', '3', '4'] };
      expect(service.isRecipeProcessing(action)).toBe(true);
    });

    it('should return false for null action', () => {
      expect(service.isRecipeProcessing(null)).toBe(false);
    });

    it('should detect sequential recipe processing', () => {
      const action = {
        isMultiItemSequential: true,
        items: ['item1', 'item2'],
        currentItemIndex: 0
      };
      expect(service.isSequentialRecipeProcessing(action)).toBe(true);
    });

    it('should return false if not at valid index', () => {
      const action = {
        isMultiItemSequential: true,
        items: ['item1', 'item2'],
        currentItemIndex: 5
      };
      expect(service.isSequentialRecipeProcessing(action)).toBe(false);
    });
  });

  describe('Progress Tracking', () => {
    it('should get current item index', () => {
      const action = { currentItemIndex: 3 };
      expect(service.getCurrentItemIndex(action)).toBe(3);
    });

    it('should return 0 for undefined index', () => {
      expect(service.getCurrentItemIndex({})).toBe(0);
    });

    it('should get total items from allItems', () => {
      const action = { allItems: [1, 2, 3, 4, 5] };
      expect(service.getTotalItems(action)).toBe(5);
    });

    it('should get total items from items if allItems not present', () => {
      const action = { items: [1, 2, 3] };
      expect(service.getTotalItems(action)).toBe(3);
    });

    it('should return 1 for no items', () => {
      expect(service.getTotalItems({})).toBe(1);
    });

    it('should calculate progress percentage', () => {
      const action = {
        isMultiItemSequential: true,
        items: ['a', 'b', 'c', 'd'],
        currentItemIndex: 1,
        allItems: ['a', 'b', 'c', 'd']
      };
      expect(service.getProgressPercentage(action)).toBe(50);
    });

    it('should return 0 for non-sequential processing', () => {
      const action = { items: ['a', 'b'] };
      expect(service.getProgressPercentage(action)).toBe(0);
    });

    it('should determine if can skip all (3+ remaining)', () => {
      const action = {
        isMultiItemSequential: true,
        items: ['a', 'b', 'c', 'd', 'e'],
        currentItemIndex: 0,
        allItems: ['a', 'b', 'c', 'd', 'e']
      };
      expect(service.canSkipAll(action)).toBe(true);
    });

    it('should return false if less than 3 remaining', () => {
      const action = {
        isMultiItemSequential: true,
        items: ['a', 'b'],
        currentItemIndex: 0,
        allItems: ['a', 'b']
      };
      expect(service.canSkipAll(action)).toBe(false);
    });
  });

  describe('Disambiguation Header', () => {
    it('should return blue color for select_list', () => {
      const disambiguation = {
        pendingAction: { type: 'select_list' }
      };
      expect(service.getDisambiguationHeaderColor(disambiguation)).toBe('#2196f3');
    });

    it('should return orange color for other types', () => {
      const disambiguation = {
        pendingAction: { type: 'add_item' }
      };
      expect(service.getDisambiguationHeaderColor(disambiguation)).toBe('#ff9800');
    });

    it('should return playlist_add icon for select_list', () => {
      const disambiguation = {
        pendingAction: { type: 'select_list' }
      };
      expect(service.getDisambiguationHeaderIcon(disambiguation)).toBe('playlist_add');
    });

    it('should return help_outline icon for other types', () => {
      const disambiguation = {
        pendingAction: { type: 'add_item' }
      };
      expect(service.getDisambiguationHeaderIcon(disambiguation)).toBe('help_outline');
    });

    it('should return correct title for select_list', () => {
      const disambiguation = {
        pendingAction: { type: 'select_list' }
      };
      expect(service.getDisambiguationHeaderTitle(disambiguation)).toBe('Liste auswählen');
    });

    it('should return correct title for article selection', () => {
      const disambiguation = {
        pendingAction: { type: 'add_item' }
      };
      expect(service.getDisambiguationHeaderTitle(disambiguation)).toBe('Artikel auswählen');
    });
  });

  describe('Action Descriptions', () => {
    it('should describe multi-item sequential action', () => {
      const action = {
        items: [{ itemName: 'Milch' }],
        currentItemIndex: 0
      };
      expect(service.getActionDescription(action)).toContain('Milch');
      expect(service.getActionDescription(action)).toContain('1/1');
    });

    it('should describe add_item action with list name', () => {
      const action = {
        type: 'add_item',
        listName: 'Einkaufsliste'
      };
      expect(service.getActionDescription(action)).toContain('Einkaufsliste');
    });

    it('should describe create_list action', () => {
      const action = {
        type: 'create_list',
        listName: 'Neue Liste'
      };
      expect(service.getActionDescription(action)).toContain('Neue Liste');
    });

    it('should return default for unknown action', () => {
      expect(service.getActionDescription(null)).toBe('Unbekannte Aktion');
    });
  });

  describe('Action Hints', () => {
    it('should return skip hint for skip option', () => {
      const option = { type: 'skip' };
      const action = { type: 'add_item' };
      expect(service.getActionHint(option, action)).toBe('Überspringen');
    });

    it('should return multi-item hint for list selection', () => {
      const option = { displayName: 'Meine Liste', type: 'existing' };
      const action = {
        type: 'select_list',
        items: ['a', 'b', 'c']
      };
      expect(service.getActionHint(option, action)).toContain('3 Artikel');
      expect(service.getActionHint(option, action)).toContain('Meine Liste');
    });

    it('should return existing article hint', () => {
      const option = { type: 'existing' };
      const action = { type: 'add_item' };
      expect(service.getActionHint(option, action)).toBe('Vorhandenen Artikel verwenden');
    });

    it('should return new article hint', () => {
      const option = { type: 'new' };
      const action = { type: 'add_item' };
      expect(service.getActionHint(option, action)).toBe('Neuen Artikel erstellen');
    });
  });

  describe('Icon Helpers', () => {
    it('should return skip icon', () => {
      expect(service.getDefaultIcon({ type: 'skip' })).toBe('⏭️');
    });

    it('should return new icon', () => {
      expect(service.getDefaultIcon({ type: 'new' })).toBe('➕');
    });

    it('should return existing icon', () => {
      expect(service.getDefaultIcon({ type: 'existing' })).toBe('📦');
    });

    it('should return default icon', () => {
      expect(service.getDefaultIcon({ type: 'other' })).toBe('📋');
    });

    it('should use suggested icon if available', () => {
      const option = { type: 'existing', icon: '🍎' };
      expect(service.getOptionIcon(option)).toBe('🍎');
    });

    it('should skip sparkle icon', () => {
      const option = { type: 'existing', icon: '✨' };
      expect(service.getOptionIcon(option)).toBe('📦');
    });

    it('should use skip icon for skip type', () => {
      const option = { type: 'skip', icon: '🍎' };
      expect(service.getOptionIcon(option)).toBe('⏭️');
    });
  });

  describe('Text Formatting', () => {
    it('should format high confidence', () => {
      expect(service.getConfidenceText(0.95)).toContain('95%');
      expect(service.getConfidenceText(0.95)).toContain('Exakte');
    });

    it('should format medium-high confidence', () => {
      expect(service.getConfidenceText(0.75)).toContain('75%');
      expect(service.getConfidenceText(0.75)).toContain('Sehr ähnlich');
    });

    it('should format medium confidence', () => {
      expect(service.getConfidenceText(0.55)).toContain('55%');
      expect(service.getConfidenceText(0.55)).toContain('Ähnlich');
    });

    it('should format low confidence', () => {
      expect(service.getConfidenceText(0.35)).toContain('35%');
      expect(service.getConfidenceText(0.35)).toContain('Entfernt');
    });

    it('should get department name in German', () => {
      expect(service.getDepartmentName('fruit-vegetables')).toBe('Obst & Gemüse');
      expect(service.getDepartmentName('dairy-products')).toBe('Milchprodukte');
      expect(service.getDepartmentName('frozen-goods')).toBe('Tiefkühl');
    });

    it('should return ID for unknown department', () => {
      expect(service.getDepartmentName('unknown-dept')).toBe('unknown-dept');
    });
  });

  describe('Choice Text Generation', () => {
    it('should generate skip choice text', () => {
      const option: any = { type: 'skip' };
      const action = { itemName: 'Milch' };
      expect(service.generateChoiceText(option, action)).toContain('übersprungen');
      expect(service.generateChoiceText(option, action)).toContain('Milch');
    });

    it('should generate recipe choice text for existing', () => {
      const option: any = { type: 'existing', displayName: 'Vollmilch' };
      const action = {
        isMultiItemSequential: true,
        items: ['a', 'b', 'c'],
        currentItemIndex: 1,
        allItems: ['a', 'b', 'c']
      };
      expect(service.generateChoiceText(option, action)).toContain('🍳');
      expect(service.generateChoiceText(option, action)).toContain('2/3');
      expect(service.generateChoiceText(option, action)).toContain('Vollmilch');
    });

    it('should generate recipe choice text for new', () => {
      const option: any = { type: 'new' };
      const action = {
        isMultiItemSequential: true,
        items: ['a', 'b'],
        currentItemIndex: 0,
        allItems: ['a', 'b'],
        itemName: 'Milch'
      };
      expect(service.generateChoiceText(option, action)).toContain('🍳');
      expect(service.generateChoiceText(option, action)).toContain('1/2');
      expect(service.generateChoiceText(option, action)).toContain('neu erstellen');
    });

    it('should generate list selection choice text', () => {
      const option: any = { type: 'existing', displayName: 'Meine Liste' };
      const action = { type: 'select_list' };
      expect(service.generateChoiceText(option, action)).toContain('Vorhandene Liste');
      expect(service.generateChoiceText(option, action)).toContain('Meine Liste');
    });

    it('should generate existing article choice text', () => {
      const option: any = { type: 'existing', displayName: 'Milch' };
      const action = { type: 'add_item' };
      expect(service.generateChoiceText(option, action)).toContain('Vorhandener Artikel');
      expect(service.generateChoiceText(option, action)).toContain('Milch');
    });

    it('should generate new article choice text', () => {
      const option: any = { type: 'new' };
      const action = { itemName: 'Käse' };
      expect(service.generateChoiceText(option, action)).toContain('Neuer Artikel');
      expect(service.generateChoiceText(option, action)).toContain('Käse');
    });
  });

  describe('Track By', () => {
    it('should track by option id', () => {
      const option = { id: 'opt-123' };
      expect(service.trackByOptionId(0, option)).toBe('opt-123');
    });

    it('should track by index if no id', () => {
      const option = {};
      expect(service.trackByOptionId(5, option)).toBe('5');
    });
  });
});
