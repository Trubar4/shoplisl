import { TestBed } from '@angular/core/testing';
import { ListValidationService } from './list-validation.service';
import { LoggerService } from './logger.service';
import { ShoppingList } from '../models';

describe('ListValidationService', () => {
  let service: ListValidationService;
  let loggerSpy: jasmine.SpyObj<LoggerService>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('LoggerService', ['debug', 'info', 'warn', 'error']);

    TestBed.configureTestingModule({
      providers: [
        ListValidationService,
        { provide: LoggerService, useValue: spy }
      ]
    });

    service = TestBed.inject(ListValidationService);
    loggerSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('validateList', () => {
    it('should pass validation for consistent list', () => {
      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        color: '#000000',
        icon: '🛒',
        ownerId: 'user1',
        sharedWith: [],
        articleIds: ['article1', 'article2'],
        itemStates: {
          article1: { articleId: 'article1', isChecked: false, addedAt: new Date() },
          article2: { articleId: 'article2', isChecked: true, addedAt: new Date() },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = service.validateList(list);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should detect article in articleIds but not in itemStates', () => {
      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        color: '#000000',
        icon: '🛒',
        ownerId: 'user1',
        sharedWith: [],
        articleIds: ['article1', 'article2'],
        itemStates: {
          article1: { articleId: 'article1', isChecked: false, addedAt: new Date() },
          // article2 missing from itemStates
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = service.validateList(list);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Article article2 in articleIds but missing from itemStates');
    });

    it('should detect article in itemStates but not in articleIds', () => {
      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        color: '#000000',
        icon: '🛒',
        ownerId: 'user1',
        sharedWith: [],
        articleIds: ['article1'],
        itemStates: {
          article1: { articleId: 'article1', isChecked: false, addedAt: new Date() },
          article2: { articleId: 'article2', isChecked: true, addedAt: new Date() },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = service.validateList(list);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Article article2 in itemStates but missing from articleIds');
    });

    it('should warn about temporary articles', () => {
      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        color: '#000000',
        icon: '🛒',
        ownerId: 'user1',
        sharedWith: [],
        articleIds: ['temp_123', 'article1'],
        itemStates: {
          temp_123: { articleId: 'temp_123', isChecked: false, addedAt: new Date() },
          article1: { articleId: 'article1', isChecked: false, addedAt: new Date() },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = service.validateList(list);

      expect(result.isValid).toBe(true); // Temp articles are warnings, not errors
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('temporary'))).toBe(true);
    });
  });

  describe('repairList', () => {
    it('should remove orphaned articleIds', () => {
      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        color: '#000000',
        icon: '🛒',
        ownerId: 'user1',
        sharedWith: [],
        articleIds: ['article1', 'article2'],
        itemStates: {
          article1: { articleId: 'article1', isChecked: false, addedAt: new Date() },
          // article2 missing from itemStates
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const repaired = service.repairList(list);

      expect(repaired.articleIds).toContain('article1');
      expect(repaired.articleIds).toContain('article2'); // Should be kept with default itemState
      expect(repaired.itemStates.article1).toBeDefined();
      expect(repaired.itemStates.article2).toBeDefined(); // Should have default itemState
    });

    it('should remove orphaned itemStates', () => {
      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        color: '#000000',
        icon: '🛒',
        ownerId: 'user1',
        sharedWith: [],
        articleIds: ['article1'],
        itemStates: {
          article1: { articleId: 'article1', isChecked: false, addedAt: new Date() },
          article2: { articleId: 'article2', isChecked: true, addedAt: new Date() },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const repaired = service.repairList(list);

      expect(repaired.articleIds).toEqual(['article1']);
      expect(repaired.itemStates.article1).toBeDefined();
      expect(repaired.itemStates.article2).toBeUndefined(); // Should be removed
    });

    it('should remove temporary articles', () => {
      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        color: '#000000',
        icon: '🛒',
        ownerId: 'user1',
        sharedWith: [],
        articleIds: ['temp_123', 'article1'],
        itemStates: {
          temp_123: { articleId: 'temp_123', isChecked: false, addedAt: new Date() },
          article1: { articleId: 'article1', isChecked: false, addedAt: new Date() },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const repaired = service.repairList(list);

      expect(repaired.articleIds).toEqual(['article1']);
      expect(repaired.itemStates.temp_123).toBeUndefined();
      expect(repaired.itemStates.article1).toBeDefined();
    });

    it('should handle empty lists', () => {
      const list: ShoppingList = {
        id: 'list1',
        name: 'Empty List',
        color: '#000000',
        icon: '🛒',
        ownerId: 'user1',
        sharedWith: [],
        articleIds: [],
        itemStates: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const repaired = service.repairList(list);

      expect(repaired.articleIds).toEqual([]);
      expect(Object.keys(repaired.itemStates)).toEqual([]);
    });
  });

  describe('validateLists', () => {
    it('should validate multiple lists', () => {
      const list1: ShoppingList = {
        id: 'list1',
        name: 'List 1',
        color: '#000000',
        icon: '🛒',
        ownerId: 'user1',
        sharedWith: [],
        articleIds: ['article1'],
        itemStates: {
          article1: { articleId: 'article1', isChecked: false, addedAt: new Date() },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const list2: ShoppingList = {
        id: 'list2',
        name: 'List 2',
        color: '#000000',
        icon: '🛒',
        ownerId: 'user1',
        sharedWith: [],
        articleIds: ['article2', 'article3'],
        itemStates: {
          article2: { articleId: 'article2', isChecked: false, addedAt: new Date() },
          // article3 missing
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const results = service.validateLists([list1, list2]);

      expect(results.length).toBe(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(false);
    });
  });

  describe('getValidationStatistics', () => {
    it('should calculate statistics correctly', () => {
      const results = [
        { isValid: true, errors: [], warnings: [] },
        { isValid: false, errors: ['error1', 'error2'], warnings: [] },
        { isValid: true, errors: [], warnings: ['warning1'] },
      ];

      const stats = service.getValidationStatistics(results);

      expect(stats.total).toBe(3);
      expect(stats.valid).toBe(2);
      expect(stats.invalid).toBe(1);
      expect(stats.withWarnings).toBe(1);
      expect(stats.totalErrors).toBe(2);
      expect(stats.totalWarnings).toBe(1);
    });
  });
});
