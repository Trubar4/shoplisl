import { Article } from '../../core/models';
import { ArticlesState } from './articles.state';
import { articlesAdapter } from './articles.reducer';
import * as ArticlesSelectors from './articles.selectors';

describe('Articles Selectors', () => {
  const mockArticle1: Article = {
    id: 'article1',
    name: 'Bread',
    icon: '🍞',
    categoryId: 'bakery',
    departmentId: 'bread',
    notes: 'Whole wheat',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-02'),
    availableInShops: ['shop1'],
    usageCount: 5,
  };

  const mockArticle2: Article = {
    id: 'article2',
    name: 'Milk',
    amount: '1L',
    icon: '🥛',
    categoryId: 'dairy',
    departmentId: 'dairy-products',
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
    availableInShops: [],
    usageCount: 0,
  };

  const mockArticle3: Article = {
    id: 'article3',
    name: 'Apple',
    icon: '🍎',
    categoryId: 'produce',
    createdAt: new Date('2025-01-20'),
    updatedAt: new Date('2025-01-20'),
    availableInShops: [],
    usageCount: 0,
  };

  const articlesState: ArticlesState = articlesAdapter.addMany(
    [mockArticle1, mockArticle2, mockArticle3],
    articlesAdapter.getInitialState({
      selectedArticleId: 'article1',
      loading: false,
      error: null,
      lastSync: new Date('2025-01-01T12:00:00Z'),
    })
  );

  const appState = {
    lists: {} as any,
    articles: articlesState,
    auth: {} as any,
  };

  describe('Entity Collection Selectors', () => {
    it('should select all article IDs', () => {
      const result = ArticlesSelectors.selectAllArticleIds(appState);
      // Sorted by name alphabetically
      expect(result).toEqual(['article3', 'article1', 'article2']);
    });

    it('should select article entities as a dictionary', () => {
      const result = ArticlesSelectors.selectArticleEntities(appState);
      expect(result['article1']).toEqual(mockArticle1);
      expect(result['article2']).toEqual(mockArticle2);
      expect(result['article3']).toEqual(mockArticle3);
    });

    it('should select all articles as an array', () => {
      const result = ArticlesSelectors.selectAllArticles(appState);
      // Sorted by name alphabetically
      expect(result).toEqual([mockArticle3, mockArticle1, mockArticle2]);
    });

    it('should select total number of articles', () => {
      const result = ArticlesSelectors.selectArticlesTotal(appState);
      expect(result).toBe(3);
    });
  });

  describe('Individual Article Selectors', () => {
    it('should select a specific article by ID', () => {
      const selector = ArticlesSelectors.selectArticleById('article1');
      const result = selector(appState);
      expect(result).toEqual(mockArticle1);
    });

    it('should return null for non-existent article ID', () => {
      const selector = ArticlesSelectors.selectArticleById('non-existent');
      const result = selector(appState);
      expect(result).toBe(null);
    });

    it('should select the currently selected article ID', () => {
      const result = ArticlesSelectors.selectSelectedArticleId(appState);
      expect(result).toBe('article1');
    });

    it('should select the currently selected article', () => {
      const result = ArticlesSelectors.selectSelectedArticle(appState);
      expect(result).toEqual(mockArticle1);
    });

    it('should return null when no article is selected', () => {
      const stateNoSelection = {
        ...appState,
        articles: { ...articlesState, selectedArticleId: null },
      };
      const result = ArticlesSelectors.selectSelectedArticle(stateNoSelection);
      expect(result).toBe(null);
    });
  });

  describe('Loading & Error Selectors', () => {
    it('should select loading state', () => {
      const result = ArticlesSelectors.selectArticlesLoading(appState);
      expect(result).toBe(false);
    });

    it('should select error message', () => {
      const result = ArticlesSelectors.selectArticlesError(appState);
      expect(result).toBe(null);
    });

    it('should select error when present', () => {
      const stateWithError = {
        ...appState,
        articles: { ...articlesState, error: 'Test error' },
      };
      const result = ArticlesSelectors.selectArticlesError(stateWithError);
      expect(result).toBe('Test error');
    });

    it('should select last sync timestamp', () => {
      const result = ArticlesSelectors.selectArticlesLastSync(appState);
      expect(result).toEqual(new Date('2025-01-01T12:00:00Z'));
    });

    it('should check if articles are loading', () => {
      const result = ArticlesSelectors.selectHasLoadingArticles(appState);
      expect(result).toBe(false);

      const loadingState = {
        ...appState,
        articles: { ...articlesState, loading: true },
      };
      const loadingResult = ArticlesSelectors.selectHasLoadingArticles(loadingState);
      expect(loadingResult).toBe(true);
    });

    it('should check if articles have been loaded', () => {
      const result = ArticlesSelectors.selectArticlesLoaded(appState);
      expect(result).toBe(true);

      const notLoadedState = {
        ...appState,
        articles: { ...articlesState, lastSync: null },
      };
      const notLoadedResult = ArticlesSelectors.selectArticlesLoaded(notLoadedState);
      expect(notLoadedResult).toBe(false);
    });
  });

  describe('Computed Selectors', () => {
    it('should select articles sorted by name (default)', () => {
      const result = ArticlesSelectors.selectArticlesSortedByName(appState);
      expect(result[0].name).toBe('Apple');
      expect(result[1].name).toBe('Bread');
      expect(result[2].name).toBe('Milk');
    });

    it('should select articles sorted by creation date (most recent first)', () => {
      const result = ArticlesSelectors.selectArticlesSortedByCreationDate(appState);
      expect(result[0].id).toBe('article3'); // Most recent
      expect(result[1].id).toBe('article2');
      expect(result[2].id).toBe('article1');
    });

    it('should select articles sorted by update date (most recent first)', () => {
      const result = ArticlesSelectors.selectArticlesSortedByUpdateDate(appState);
      expect(result[0].id).toBe('article3'); // Most recently updated
      expect(result[1].id).toBe('article2');
      expect(result[2].id).toBe('article1');
    });

    it('should select articles by department', () => {
      const selector = ArticlesSelectors.selectArticlesByDepartment('bread');
      const result = selector(appState);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('article1');
    });

    it('should select articles by category', () => {
      const selector = ArticlesSelectors.selectArticlesByCategory('dairy');
      const result = selector(appState);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('article2');
    });

    it('should select articles without department', () => {
      const result = ArticlesSelectors.selectArticlesWithoutDepartment(appState);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('article3');
    });

    it('should select articles without category', () => {
      const result = ArticlesSelectors.selectArticlesWithoutCategory(appState);
      expect(result.length).toBe(0); // All have categories
    });

    it('should select articles with notes', () => {
      const result = ArticlesSelectors.selectArticlesWithNotes(appState);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('article1');
    });

    it('should select articles by name search', () => {
      const selector = ArticlesSelectors.selectArticlesByNameSearch('mil');
      const result = selector(appState);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('article2');
    });

    it('should return all articles when search term is empty', () => {
      const selector = ArticlesSelectors.selectArticlesByNameSearch('');
      const result = selector(appState);
      expect(result.length).toBe(3);
    });

    it('should select articles by icon', () => {
      const selector = ArticlesSelectors.selectArticlesByIcon('🍞');
      const result = selector(appState);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('article1');
    });

    it('should select article count by department', () => {
      const result = ArticlesSelectors.selectArticleCountByDepartment(appState);
      expect(result.get('bread')).toBe(1);
      expect(result.get('dairy-products')).toBe(1);
      expect(result.get('none')).toBe(1); // article3 has no department
    });

    it('should select article count by category', () => {
      const result = ArticlesSelectors.selectArticleCountByCategory(appState);
      expect(result.get('bakery')).toBe(1);
      expect(result.get('dairy')).toBe(1);
      expect(result.get('produce')).toBe(1);
    });

    it('should select recently created articles (last 7 days)', () => {
      // Create test with very recent dates
      const recentArticle: Article = {
        ...mockArticle1,
        id: 'recent',
        createdAt: new Date(), // Today
      };

      const oldArticle: Article = {
        ...mockArticle2,
        id: 'old',
        createdAt: new Date('2024-01-01'), // Old date
      };

      const testState = {
        ...appState,
        articles: articlesAdapter.addMany([recentArticle, oldArticle], {
          ...articlesState,
          entities: {},
          ids: [],
        }),
      };

      const result = ArticlesSelectors.selectRecentlyCreatedArticles(testState);
      expect(result.some(a => a.id === 'recent')).toBe(true);
      expect(result.some(a => a.id === 'old')).toBe(false);
    });

    it('should select recently updated articles (last 7 days)', () => {
      const recentArticle: Article = {
        ...mockArticle1,
        id: 'recent',
        updatedAt: new Date(), // Today
      };

      const oldArticle: Article = {
        ...mockArticle2,
        id: 'old',
        updatedAt: new Date('2024-01-01'), // Old date
      };

      const testState = {
        ...appState,
        articles: articlesAdapter.addMany([recentArticle, oldArticle], {
          ...articlesState,
          entities: {},
          ids: [],
        }),
      };

      const result = ArticlesSelectors.selectRecentlyUpdatedArticles(testState);
      expect(result.some(a => a.id === 'recent')).toBe(true);
      expect(result.some(a => a.id === 'old')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty state', () => {
      const emptyState = articlesAdapter.getInitialState({
        selectedArticleId: null,
        loading: false,
        error: null,
        lastSync: null,
      });

      const emptyAppState = {
        lists: {} as any,
        articles: emptyState,
        auth: {} as any,
      };

      const allArticles = ArticlesSelectors.selectAllArticles(emptyAppState);
      expect(allArticles).toEqual([]);

      const total = ArticlesSelectors.selectArticlesTotal(emptyAppState);
      expect(total).toBe(0);

      const selectedArticle = ArticlesSelectors.selectSelectedArticle(emptyAppState);
      expect(selectedArticle).toBe(null);
    });

    it('should handle case-insensitive search', () => {
      const selector = ArticlesSelectors.selectArticlesByNameSearch('BREAD');
      const result = selector(appState);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('article1');
    });

    it('should handle search with whitespace', () => {
      const selector = ArticlesSelectors.selectArticlesByNameSearch('  milk  ');
      const result = selector(appState);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('article2');
    });
  });
});
