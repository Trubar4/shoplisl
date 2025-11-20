import { TestBed } from '@angular/core/testing';
import { ArticleSelectionService } from './article-selection.service';

describe('ArticleSelectionService', () => {
  let service: ArticleSelectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ArticleSelectionService]
    });
    service = TestBed.inject(ArticleSelectionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Selection Mode', () => {
    it('should start with selection mode disabled', (done) => {
      service.isSelectionMode$.subscribe(isActive => {
        expect(isActive).toBe(false);
        done();
      });
    });

    it('should enter selection mode', () => {
      service.enterSelectionMode();
      expect(service.isSelectionMode).toBe(true);
    });

    it('should exit selection mode and clear selections', () => {
      service.enterSelectionMode();
      service.selectArticle('article1');
      service.exitSelectionMode();

      expect(service.isSelectionMode).toBe(false);
      expect(service.selectedCount).toBe(0);
    });

    it('should toggle selection mode', () => {
      expect(service.isSelectionMode).toBe(false);
      service.toggleSelectionMode();
      expect(service.isSelectionMode).toBe(true);
      service.toggleSelectionMode();
      expect(service.isSelectionMode).toBe(false);
    });
  });

  describe('Article Selection', () => {
    it('should start with no selections', (done) => {
      service.selectedArticleIds$.subscribe(ids => {
        expect(ids.size).toBe(0);
        done();
      });
    });

    it('should select an article', () => {
      service.selectArticle('article1');
      expect(service.isArticleSelected('article1')).toBe(true);
      expect(service.selectedCount).toBe(1);
    });

    it('should deselect an article', () => {
      service.selectArticle('article1');
      service.deselectArticle('article1');
      expect(service.isArticleSelected('article1')).toBe(false);
      expect(service.selectedCount).toBe(0);
    });

    it('should toggle article selection', () => {
      service.toggleArticle('article1');
      expect(service.isArticleSelected('article1')).toBe(true);
      service.toggleArticle('article1');
      expect(service.isArticleSelected('article1')).toBe(false);
    });

    it('should select multiple articles', () => {
      service.selectAll(['article1', 'article2', 'article3']);
      expect(service.selectedCount).toBe(3);
      expect(service.isArticleSelected('article1')).toBe(true);
      expect(service.isArticleSelected('article2')).toBe(true);
      expect(service.isArticleSelected('article3')).toBe(true);
    });

    it('should deselect multiple articles', () => {
      service.selectAll(['article1', 'article2', 'article3']);
      service.deselectAll(['article1', 'article3']);
      expect(service.selectedCount).toBe(1);
      expect(service.isArticleSelected('article2')).toBe(true);
    });

    it('should clear all selections', () => {
      service.selectAll(['article1', 'article2', 'article3']);
      service.clearSelection();
      expect(service.selectedCount).toBe(0);
    });
  });

  describe('Select All Functionality', () => {
    it('should check if all articles are selected', () => {
      const articles = ['article1', 'article2', 'article3'];
      expect(service.areAllSelected(articles)).toBe(false);

      service.selectAll(articles);
      expect(service.areAllSelected(articles)).toBe(true);
    });

    it('should check if some articles are selected', () => {
      const articles = ['article1', 'article2', 'article3'];
      expect(service.areSomeSelected(articles)).toBe(false);

      service.selectArticle('article1');
      expect(service.areSomeSelected(articles)).toBe(true);

      service.selectAll(articles);
      expect(service.areSomeSelected(articles)).toBe(false); // All selected, not "some"
    });

    it('should toggle all articles', () => {
      const articles = ['article1', 'article2', 'article3'];

      // None selected -> select all
      service.toggleAll(articles);
      expect(service.areAllSelected(articles)).toBe(true);

      // All selected -> deselect all
      service.toggleAll(articles);
      expect(service.selectedCount).toBe(0);
    });

    it('should handle empty article array', () => {
      expect(service.areAllSelected([])).toBe(false);
      expect(service.areSomeSelected([])).toBe(false);
    });
  });

  describe('Observable Emissions', () => {
    it('should emit hasSelection based on selection state', (done) => {
      let emissionCount = 0;
      const expectedValues = [false, true, false];

      service.hasSelection$.subscribe(hasSelection => {
        expect(hasSelection).toBe(expectedValues[emissionCount]);
        emissionCount++;

        if (emissionCount === expectedValues.length) {
          done();
        }
      });

      service.selectArticle('article1');
      service.clearSelection();
    });

    it('should emit selectedCount when selection changes', (done) => {
      let emissionCount = 0;
      const expectedValues = [0, 1, 2, 0];

      service.selectedCount$.subscribe(count => {
        expect(count).toBe(expectedValues[emissionCount]);
        emissionCount++;

        if (emissionCount === expectedValues.length) {
          done();
        }
      });

      service.selectArticle('article1');
      service.selectArticle('article2');
      service.clearSelection();
    });
  });
});
