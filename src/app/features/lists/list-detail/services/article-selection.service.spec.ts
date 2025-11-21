import { TestBed } from '@angular/core/testing';
import { ArticleSelectionService } from './article-selection.service';
import { firstValueFrom, skip, take } from 'rxjs';

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
    it('should start with selection mode disabled', async () => {
      const isActive = await firstValueFrom(service.isSelectionMode$);
      expect(isActive).toBe(false);
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
    it('should start with no selections', async () => {
      const ids = await firstValueFrom(service.selectedArticleIds$);
      expect(ids.size).toBe(0);
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
    it('should emit hasSelection based on selection state', async () => {
      const emissions: boolean[] = [];
      const subscription = service.hasSelection$.subscribe(hasSelection => {
        emissions.push(hasSelection);
      });

      // Initial emission: false
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(emissions[0]).toBe(false);

      // Select an article: should emit true
      service.selectArticle('article1');
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(emissions[1]).toBe(true);

      // Clear selection: should emit false
      service.clearSelection();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(emissions[2]).toBe(false);

      subscription.unsubscribe();
    });

    it('should emit selectedCount when selection changes', async () => {
      const emissions: number[] = [];
      const subscription = service.selectedCount$.subscribe(count => {
        emissions.push(count);
      });

      // Initial emission: 0
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(emissions[0]).toBe(0);

      // Select article1: should emit 1
      service.selectArticle('article1');
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(emissions[1]).toBe(1);

      // Select article2: should emit 2
      service.selectArticle('article2');
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(emissions[2]).toBe(2);

      // Clear selection: should emit 0
      service.clearSelection();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(emissions[3]).toBe(0);

      subscription.unsubscribe();
    });
  });
});
