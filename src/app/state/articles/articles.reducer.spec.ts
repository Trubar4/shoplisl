import { articlesReducer, articlesAdapter } from './articles.reducer';
import { ArticlesState } from './articles.state';
import * as ArticlesActions from './articles.actions';
import { Article } from '../../core/models';

describe('Articles Reducer', () => {
  const mockArticle1: Article = {
    id: 'article1',
    name: 'Milk',
    amount: '1L',
    notes: 'Organic',
    icon: '🥛',
    categoryId: 'dairy',
    departmentId: 'dairy-products',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-02'),
    availableInShops: ['shop1'],
    usageCount: 5,
  };

  const mockArticle2: Article = {
    id: 'article2',
    name: 'Bread',
    icon: '🍞',
    categoryId: 'bakery',
    departmentId: 'bread',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    availableInShops: [],
    usageCount: 0,
  };

  const initialState: ArticlesState = articlesAdapter.getInitialState({
    selectedArticleId: null,
    loading: false,
    error: null,
    lastSync: null,
  });

  describe('Initial State', () => {
    it('should return the initial state', () => {
      const action = { type: 'UNKNOWN' };
      const state = articlesReducer(undefined, action as any);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.selectedArticleId).toBe(null);
      expect(state.lastSync).toBe(null);
    });
  });

  describe('Load Articles Actions', () => {
    it('should set loading to true on loadArticles', () => {
      const action = ArticlesActions.loadArticles();
      const state = articlesReducer(initialState, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);
    });

    it('should load articles successfully', () => {
      const articles = [mockArticle1, mockArticle2];
      const action = ArticlesActions.loadArticlesSuccess({ articles });
      const state = articlesReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.ids.length).toBe(2);
      expect(state.entities['article1']).toEqual(mockArticle1);
      expect(state.entities['article2']).toEqual(mockArticle2);
      expect(state.lastSync).toBeTruthy();
    });

    it('should handle loadArticles failure', () => {
      const error = 'Failed to load articles';
      const action = ArticlesActions.loadArticlesFailure({ error });
      const state = articlesReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(error);
    });
  });

  describe('Load Single Article Actions', () => {
    it('should set loading to true on loadArticle', () => {
      const action = ArticlesActions.loadArticle({ articleId: 'article1' });
      const state = articlesReducer(initialState, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);
    });

    it('should load single article successfully', () => {
      const action = ArticlesActions.loadArticleSuccess({ article: mockArticle1 });
      const state = articlesReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.entities['article1']).toEqual(mockArticle1);
    });

    it('should handle loadArticle failure', () => {
      const error = 'Article not found';
      const action = ArticlesActions.loadArticleFailure({ error });
      const state = articlesReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(error);
    });
  });

  describe('Create Article Actions', () => {
    it('should set loading to true on createArticle', () => {
      const action = ArticlesActions.createArticle({ name: 'New Article' });
      const state = articlesReducer(initialState, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);
    });

    it('should create article successfully and auto-select it', () => {
      const action = ArticlesActions.createArticleSuccess({ article: mockArticle1 });
      const state = articlesReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.entities['article1']).toEqual(mockArticle1);
      expect(state.selectedArticleId).toBe('article1');
    });

    it('should handle createArticle failure', () => {
      const error = 'Failed to create article';
      const action = ArticlesActions.createArticleFailure({ error });
      const state = articlesReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(error);
    });
  });

  describe('Create Article with Check Actions', () => {
    it('should set loading to true on createArticleWithCheck', () => {
      const action = ArticlesActions.createArticleWithCheck({ name: 'New Article' });
      const state = articlesReducer(initialState, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);
    });

    it('should create article with check successfully', () => {
      const action = ArticlesActions.createArticleWithCheckSuccess({
        article: mockArticle1,
        isDuplicate: false,
      });
      const state = articlesReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.entities['article1']).toEqual(mockArticle1);
      expect(state.selectedArticleId).toBe('article1');
    });

    it('should handle createArticleWithCheck failure', () => {
      const error = 'Duplicate article name';
      const action = ArticlesActions.createArticleWithCheckFailure({ error });
      const state = articlesReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(error);
    });
  });

  describe('Update Article Actions', () => {
    let stateWithArticle: ArticlesState;

    beforeEach(() => {
      stateWithArticle = articlesAdapter.addOne(mockArticle1, initialState);
    });

    it('should set loading to true on updateArticle', () => {
      const action = ArticlesActions.updateArticle({
        articleId: 'article1',
        changes: { name: 'Updated Name' },
      });
      const state = articlesReducer(stateWithArticle, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);
    });

    it('should update article successfully', () => {
      const updatedArticle = { ...mockArticle1, name: 'Updated Milk' };
      const action = ArticlesActions.updateArticleSuccess({ article: updatedArticle });
      const state = articlesReducer(stateWithArticle, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.entities['article1']?.name).toBe('Updated Milk');
    });

    it('should handle updateArticle failure', () => {
      const error = 'Failed to update article';
      const action = ArticlesActions.updateArticleFailure({ error });
      const state = articlesReducer(stateWithArticle, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(error);
    });
  });

  describe('Delete Article Actions', () => {
    let stateWithArticle: ArticlesState;

    beforeEach(() => {
      stateWithArticle = articlesAdapter.addOne(mockArticle1, {
        ...initialState,
        selectedArticleId: 'article1',
      });
    });

    it('should set loading to true on deleteArticle', () => {
      const action = ArticlesActions.deleteArticle({ articleId: 'article1' });
      const state = articlesReducer(stateWithArticle, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);
    });

    it('should delete article successfully', () => {
      const action = ArticlesActions.deleteArticleSuccess({ articleId: 'article1' });
      const state = articlesReducer(stateWithArticle, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.entities['article1']).toBeUndefined();
      expect(state.selectedArticleId).toBe(null); // Should clear selection
    });

    it('should preserve selectedArticleId if deleting a different article', () => {
      const stateWithTwoArticles = articlesAdapter.addOne(mockArticle2, stateWithArticle);
      const action = ArticlesActions.deleteArticleSuccess({ articleId: 'article2' });
      const state = articlesReducer(stateWithTwoArticles, action);

      expect(state.selectedArticleId).toBe('article1'); // Should keep article1 selected
    });

    it('should handle deleteArticle failure', () => {
      const error = 'Failed to delete article';
      const action = ArticlesActions.deleteArticleFailure({ error });
      const state = articlesReducer(stateWithArticle, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(error);
    });
  });

  describe('Delete Article with Cleanup Actions', () => {
    let stateWithArticle: ArticlesState;

    beforeEach(() => {
      stateWithArticle = articlesAdapter.addOne(mockArticle1, {
        ...initialState,
        selectedArticleId: 'article1',
      });
    });

    it('should set loading to true on deleteArticleWithCleanup', () => {
      const action = ArticlesActions.deleteArticleWithCleanup({ articleId: 'article1' });
      const state = articlesReducer(stateWithArticle, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);
    });

    it('should delete article with cleanup successfully', () => {
      const action = ArticlesActions.deleteArticleWithCleanupSuccess({
        articleId: 'article1',
        listsUpdated: 2,
      });
      const state = articlesReducer(stateWithArticle, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.entities['article1']).toBeUndefined();
      expect(state.selectedArticleId).toBe(null);
    });

    it('should handle deleteArticleWithCleanup failure', () => {
      const error = 'Article is in active lists';
      const action = ArticlesActions.deleteArticleWithCleanupFailure({ error });
      const state = articlesReducer(stateWithArticle, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(error);
      expect(state.entities['article1']).toBeDefined(); // Article not deleted
    });
  });

  describe('Check Article Name Actions', () => {
    it('should not change state on checkArticleNameExists', () => {
      const action = ArticlesActions.checkArticleNameExists({ name: 'Test' });
      const state = articlesReducer(initialState, action);

      expect(state).toEqual(initialState);
    });

    it('should not change state on checkArticleNameExistsResult', () => {
      const action = ArticlesActions.checkArticleNameExistsResult({
        exists: true,
        name: 'Test',
      });
      const state = articlesReducer(initialState, action);

      expect(state).toEqual(initialState);
    });
  });

  describe('UI State Actions', () => {
    it('should select an article', () => {
      const action = ArticlesActions.selectArticle({ articleId: 'article1' });
      const state = articlesReducer(initialState, action);

      expect(state.selectedArticleId).toBe('article1');
    });

    it('should clear article selection', () => {
      const stateWithSelection = { ...initialState, selectedArticleId: 'article1' };
      const action = ArticlesActions.selectArticle({ articleId: null });
      const state = articlesReducer(stateWithSelection as ArticlesState, action);

      expect(state.selectedArticleId).toBe(null);
    });

    it('should clear error', () => {
      const stateWithError = { ...initialState, error: 'Some error' };
      const action = ArticlesActions.clearError();
      const state = articlesReducer(stateWithError as ArticlesState, action);

      expect(state.error).toBe(null);
    });

    it('should not change state on setArticleFilter', () => {
      const action = ArticlesActions.setArticleFilter({ filter: 'search term' });
      const state = articlesReducer(initialState, action);

      expect(state).toEqual(initialState);
    });
  });
});
