import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditModeComponent } from './edit-mode.component';
import { ShoppingList } from '../../../../core/models';
import { DepartmentGroup } from '../../../../shared/components/article-list/article-list.component';
import { ArticleItemData } from '../../../../shared/components/article-item/article-item.component';

/**
 * Edit Mode Component Tests
 *
 * Tests edit-mode specific functionality:
 * - Article toggle in/out of list
 * - Edit article amount
 * - List management actions
 * - Navigation to create article and department sort
 * - Confirmation dialogs for destructive actions
 */

describe('EditModeComponent', () => {
  let component: EditModeComponent;

  const testList: ShoppingList = {
    id: 'list1',
    name: 'Test List',
    articleIds: ['article1', 'article2', 'article3'],
    itemStates: {
      'article1': { articleId: 'article1', isChecked: false, amount: '1kg' },
      'article2': { articleId: 'article2', isChecked: true, amount: '500g' },
      'article3': { articleId: 'article3', isChecked: false, amount: '' }
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    color: '#1a9edb',
    icon: '🛒',
    departmentOrder: ['dairy', 'fruits', 'bakery']
  };

  const testDepartmentGroups: DepartmentGroup[] = [
    {
      department: { id: 'dairy', nameGerman: 'Milchprodukte', nameEnglish: 'Dairy', icon: 'milk.png' },
      articles: [
        {
          id: 'article1',
          name: 'Milch',
          amount: '',
          departmentId: 'dairy',
          icon: '🥛',
          isChecked: false,
          isInList: true,
          listAmount: '1kg'
        } as ArticleItemData
      ]
    }
  ];

  beforeEach(() => {
    component = new EditModeComponent();
    component.list = testList;
    component.departmentGroups = testDepartmentGroups;
    component.searchQuery = '';
    component.editFilter = 'alle';
    component.listColor = '#1a9edb';
    component.contrastColor = '#ffffff';
    component.lightColor = '#7fcaed';
  });

  it('should create', () => {
    expect(component).toBeDefined();
  });

  // =========================================
  // INITIALIZATION TESTS
  // =========================================

  describe('Initialization', () => {
    it('should initialize with default inputs', () => {
      const newComponent = new EditModeComponent();
      expect(newComponent.list).toBeNull();
      expect(newComponent.departmentGroups).toEqual([]);
      expect(newComponent.searchQuery).toBe('');
      expect(newComponent.editFilter).toBe('alle');
      expect(newComponent.listColor).toBe('#1a9edb');
      expect(newComponent.contrastColor).toBe('#ffffff');
    });

    it('should accept list input', () => {
      expect(component.list).toEqual(testList);
    });

    it('should accept departmentGroups input', () => {
      expect(component.departmentGroups).toEqual(testDepartmentGroups);
    });

    it('should accept filter input', () => {
      component.editFilter = 'gelistet';
      expect(component.editFilter).toBe('gelistet');
    });
  });

  // =========================================
  // ARTICLE TOGGLE TESTS
  // =========================================

  describe('Article Toggle In/Out of List', () => {
    it('should emit toggleInList when article is toggled', () => {
      const article: ArticleItemData = {
        id: 'article1',
        name: 'Milch',
        amount: '',
        departmentId: 'dairy',
        icon: '🥛',
        isChecked: false,
        isInList: true,
        listAmount: '1kg'
      };

      const spy = vi.spyOn(component.toggleInList, 'emit');

      component.onToggleInList(article);

      expect(spy).toHaveBeenCalledWith(article);
    });

    it('should emit toggleInList for article not in list', () => {
      const article: ArticleItemData = {
        id: 'article4',
        name: 'Käse',
        amount: '',
        departmentId: 'dairy',
        icon: '🧀',
        isChecked: false,
        isInList: false,
        listAmount: ''
      };

      const spy = vi.spyOn(component.toggleInList, 'emit');

      component.onToggleInList(article);

      expect(spy).toHaveBeenCalledWith(article);
    });
  });

  // =========================================
  // ARTICLE INFO TESTS
  // =========================================

  describe('Article Info', () => {
    it('should emit articleInfo event', () => {
      const article: ArticleItemData = {
        id: 'article1',
        name: 'Milch',
        amount: '',
        departmentId: 'dairy',
        icon: '🥛',
        isChecked: false,
        isInList: true,
        listAmount: '1kg'
      };

      const spy = vi.spyOn(component.articleInfo, 'emit');

      component.onArticleInfo(article);

      expect(spy).toHaveBeenCalledWith(article);
    });
  });

  // =========================================
  // EDIT AMOUNT TESTS
  // =========================================

  describe('Edit Amount', () => {
    it('should emit editAmount event', () => {
      const article: ArticleItemData = {
        id: 'article1',
        name: 'Milch',
        amount: '',
        departmentId: 'dairy',
        icon: '🥛',
        isChecked: false,
        isInList: true,
        listAmount: '1kg'
      };

      const event = new Event('click');
      const data = { article, event };

      const spy = vi.spyOn(component.editAmount, 'emit');

      component.onEditAmount(data);

      expect(spy).toHaveBeenCalledWith(data);
    });
  });

  // =========================================
  // CREATE ARTICLE TESTS
  // =========================================

  describe('Create Article', () => {
    it('should emit createArticle event', () => {
      const spy = vi.spyOn(component.createArticle, 'emit');

      component.onCreateArticle();

      expect(spy).toHaveBeenCalled();
    });
  });

  // =========================================
  // DEPARTMENT SORT TESTS
  // =========================================

  describe('Department Sort', () => {
    it('should emit departmentSort event', () => {
      const spy = vi.spyOn(component.departmentSort, 'emit');

      component.onDepartmentSort();

      expect(spy).toHaveBeenCalled();
    });
  });

  // =========================================
  // CLEAR ALL ITEMS TESTS
  // =========================================

  describe('Clear All Items', () => {
    it('should emit clearList event with confirmation', () => {
      global.confirm = vi.fn(() => true);
      const spy = vi.spyOn(component.clearList, 'emit');

      component.onClearAllItems();

      expect(global.confirm).toHaveBeenCalledWith('Alle 3 Artikel von der Liste entfernen?');
      expect(spy).toHaveBeenCalled();
    });

    it('should not emit if user cancels confirmation', () => {
      global.confirm = vi.fn(() => false);
      const spy = vi.spyOn(component.clearList, 'emit');

      component.onClearAllItems();

      expect(global.confirm).toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
    });

    it('should emit clearList even for empty list', () => {
      component.list = { ...testList, articleIds: [] };
      const spy = vi.spyOn(component.clearList, 'emit');

      component.onClearAllItems();

      // Should emit for empty list (parent will show snackbar)
      expect(spy).toHaveBeenCalled();
    });

    it('should not emit if list is null', () => {
      component.list = null;
      const spy = vi.spyOn(component.clearList, 'emit');

      component.onClearAllItems();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // =========================================
  // EDIT LIST TESTS
  // =========================================

  describe('Edit List', () => {
    it('should emit editList event', () => {
      const spy = vi.spyOn(component.editList, 'emit');

      component.onEditList();

      expect(spy).toHaveBeenCalled();
    });
  });

  // =========================================
  // DELETE LIST TESTS
  // =========================================

  describe('Delete List', () => {
    it('should emit deleteList event with confirmation', () => {
      global.confirm = vi.fn(() => true);
      const spy = vi.spyOn(component.deleteList, 'emit');

      component.onDeleteList();

      expect(global.confirm).toHaveBeenCalledWith(
        'Liste "Test List" wirklich löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.'
      );
      expect(spy).toHaveBeenCalled();
    });

    it('should not emit if user cancels confirmation', () => {
      global.confirm = vi.fn(() => false);
      const spy = vi.spyOn(component.deleteList, 'emit');

      component.onDeleteList();

      expect(global.confirm).toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not emit if list is null', () => {
      component.list = null;
      const spy = vi.spyOn(component.deleteList, 'emit');

      component.onDeleteList();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // =========================================
  // COLOR PROPS TESTS
  // =========================================

  describe('Color Properties', () => {
    it('should accept listColor input', () => {
      component.listColor = '#ff5722';
      expect(component.listColor).toBe('#ff5722');
    });

    it('should accept contrastColor input', () => {
      component.contrastColor = '#000000';
      expect(component.contrastColor).toBe('#000000');
    });

    it('should accept lightColor input', () => {
      component.lightColor = '#ffccbc';
      expect(component.lightColor).toBe('#ffccbc');
    });
  });
});
