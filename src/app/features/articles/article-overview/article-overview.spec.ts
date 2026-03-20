import { vi } from 'vitest';
import { of } from 'rxjs';
import { ArticleOverviewComponent, ArticleWithStats } from './article-overview';

const makeArticle = (id: string, name: string, ownerId = 'user1'): ArticleWithStats =>
  ({ id, name, ownerId } as ArticleWithStats);

describe('ArticleOverviewComponent', () => {
  let storeMock: any;
  let routerMock: any;
  let snackBarMock: any;
  let dialogMock: any;
  let articleStatsServiceMock: any;
  let authServiceMock: any;
  let firebaseDataMock: any;
  let listUtilsMock: any;
  let component: ArticleOverviewComponent;

  const makeComponent = (): ArticleOverviewComponent =>
    new ArticleOverviewComponent(
      storeMock,
      routerMock,
      snackBarMock,
      dialogMock,
      articleStatsServiceMock,
      authServiceMock,
      firebaseDataMock,
      listUtilsMock
    );

  beforeEach(() => {
    localStorage.clear();
    storeMock = {
      select: vi.fn().mockReturnValue(of([])),
      dispatch: vi.fn()
    };
    routerMock = { navigate: vi.fn() };
    snackBarMock = { open: vi.fn(), dismiss: vi.fn() };
    dialogMock = { open: vi.fn().mockReturnValue({ afterClosed: () => of(false) }) };
    articleStatsServiceMock = { getAllArticleStats: vi.fn().mockReturnValue(of(new Map())) };
    authServiceMock = { getCurrentUserId: vi.fn().mockReturnValue('user1') };
    firebaseDataMock = { loadAllOwnedArticles: vi.fn() };
    listUtilsMock = { updateThemeColors: vi.fn(), resetToDefaultTheme: vi.fn() };
    component = makeComponent();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize currentUserId from authService', () => {
    expect(component.currentUserId).toBe('user1');
  });

  it('should initialize with default sort option "name"', () => {
    expect(component.sortOption).toBe('name');
  });

  it('should initialize with default filter option "all"', () => {
    expect(component.filterOption).toBe('all');
  });

  it('should initialize with isFabExpanded false', () => {
    expect(component.isFabExpanded).toBe(false);
  });

  // --- Search ---

  describe('onSearchQueryChange()', () => {
    it('should push trimmed query to searchQuery$', () => {
      component.searchQuery = 'Milch';
      component.onSearchQueryChange();
      expect(component.searchQuery$.value).toBe('Milch');
    });

    it('should trim whitespace before pushing', () => {
      component.searchQuery = '  Butter  ';
      component.onSearchQueryChange();
      expect(component.searchQuery$.value).toBe('Butter');
    });

    it('should push empty string when query is blank', () => {
      component.searchQuery = '   ';
      component.onSearchQueryChange();
      expect(component.searchQuery$.value).toBe('');
    });
  });

  // --- Sort ---

  describe('onSortChange()', () => {
    it('should update sortOption property', () => {
      component.onSortChange('checkCount');
      expect(component.sortOption).toBe('checkCount');
    });

    it('should push new value to sortOption$', () => {
      component.onSortChange('lastChecked');
      expect(component.sortOption$.value).toBe('lastChecked');
    });

    it('should persist sort option in localStorage', () => {
      component.onSortChange('lastAdded');
      expect(localStorage.getItem('article-overview-sort-option')).toBe('lastAdded');
    });

    it('should close FAB after sort change', () => {
      component.isFabExpanded = true;
      component.onSortChange('name');
      expect(component.isFabExpanded).toBe(false);
    });
  });

  describe('loadSavedSortOption()', () => {
    it('should restore valid sort option from localStorage', () => {
      localStorage.setItem('article-overview-sort-option', 'checkCount');
      expect(makeComponent().sortOption).toBe('checkCount');
    });

    it('should fall back to "name" for invalid stored value', () => {
      localStorage.setItem('article-overview-sort-option', 'ungueltig');
      expect(makeComponent().sortOption).toBe('name');
    });

    it('should return "name" when nothing is stored', () => {
      expect(component.sortOption).toBe('name');
    });
  });

  // --- Filter ---

  describe('onFilterChange()', () => {
    it('should update filterOption property', () => {
      component.onFilterChange('owned');
      expect(component.filterOption).toBe('owned');
    });

    it('should push new value to filterOption$', () => {
      component.onFilterChange('shared');
      expect(component.filterOption$.value).toBe('shared');
    });

    it('should persist filter option in localStorage', () => {
      component.onFilterChange('owned');
      expect(localStorage.getItem('article-overview-filter-option')).toBe('owned');
    });
  });

  describe('loadSavedFilterOption()', () => {
    it('should restore valid filter option from localStorage', () => {
      localStorage.setItem('article-overview-filter-option', 'owned');
      expect(makeComponent().filterOption).toBe('owned');
    });

    it('should fall back to "all" for invalid stored value', () => {
      localStorage.setItem('article-overview-filter-option', 'ungueltig');
      expect(makeComponent().filterOption).toBe('all');
    });

    it('should return "all" when nothing is stored', () => {
      expect(component.filterOption).toBe('all');
    });
  });

  // --- FAB ---

  describe('toggleFab()', () => {
    it('should expand FAB when collapsed', () => {
      component.toggleFab();
      expect(component.isFabExpanded).toBe(true);
    });

    it('should collapse FAB when expanded', () => {
      component.isFabExpanded = true;
      component.toggleFab();
      expect(component.isFabExpanded).toBe(false);
    });
  });

  describe('closeFab()', () => {
    it('should set isFabExpanded to false', () => {
      component.isFabExpanded = true;
      component.closeFab();
      expect(component.isFabExpanded).toBe(false);
    });
  });

  // --- Ownership helpers ---

  describe('isSharedArticle()', () => {
    it('should return true for articles owned by another user', () => {
      expect(component.isSharedArticle(makeArticle('1', 'Milch', 'other-user'))).toBe(true);
    });

    it('should return false for own articles', () => {
      expect(component.isSharedArticle(makeArticle('1', 'Milch', 'user1'))).toBe(false);
    });

    it('should return false when currentUserId is null', () => {
      authServiceMock.getCurrentUserId.mockReturnValue(null);
      const c = makeComponent();
      expect(c.isSharedArticle(makeArticle('1', 'Milch', 'other-user'))).toBe(false);
    });
  });

  describe('isCopiedArticle()', () => {
    it('should return true for articles with copiedFrom set', () => {
      const article = { ...makeArticle('1', 'Milch'), copiedFrom: 'original-id' } as any;
      expect(component.isCopiedArticle(article)).toBe(true);
    });

    it('should return false for original articles', () => {
      expect(component.isCopiedArticle(makeArticle('1', 'Milch'))).toBe(false);
    });

    it('should return false when copiedFrom is null', () => {
      const article = { ...makeArticle('1', 'Milch'), copiedFrom: null } as any;
      expect(component.isCopiedArticle(article)).toBe(false);
    });
  });

  // --- Navigation ---

  describe('onArticleClick()', () => {
    it('should navigate to article edit page', () => {
      component.onArticleClick(makeArticle('42', 'Mehl'));
      expect(routerMock.navigate).toHaveBeenCalledWith(['/articles/edit', '42']);
    });

    it('should not navigate when swipe is active', () => {
      const article = makeArticle('42', 'Mehl');
      component.swipeStates['42'] = {
        isSwipeActive: true, swipeDistance: 80,
        startX: 0, currentX: 0, startY: 0, currentY: 0
      };
      component.onArticleClick(article);
      expect(routerMock.navigate).not.toHaveBeenCalled();
    });
  });

  describe('onAddArticle()', () => {
    it('should navigate to /articles/add', () => {
      component.onAddArticle();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/articles/add']);
    });
  });

  describe('onAddNewArticleFromSearch()', () => {
    it('should navigate with name param when search query is set', () => {
      component.searchQuery = 'Zucker';
      component.onAddNewArticleFromSearch();
      expect(routerMock.navigate).toHaveBeenCalledWith(
        ['/articles/add'], { queryParams: { name: 'Zucker' } }
      );
    });

    it('should navigate without param when search query is empty', () => {
      component.searchQuery = '';
      component.onAddNewArticleFromSearch();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/articles/add']);
    });

    it('should trim whitespace from search query before passing as param', () => {
      component.searchQuery = '  Salz  ';
      component.onAddNewArticleFromSearch();
      expect(routerMock.navigate).toHaveBeenCalledWith(
        ['/articles/add'], { queryParams: { name: 'Salz' } }
      );
    });
  });

  // --- Lifecycle ---

  describe('ngOnInit()', () => {
    it('should dispatch loadArticles action', () => {
      component.ngOnInit();
      const types = storeMock.dispatch.mock.calls.map((c: any[]) => c[0].type);
      expect(types).toContain('[Articles] Load Articles');
    });

    it('should dispatch loadLists action', () => {
      component.ngOnInit();
      const types = storeMock.dispatch.mock.calls.map((c: any[]) => c[0].type);
      expect(types).toContain('[Lists] Load Lists');
    });

    it('should trigger lazy article loading from Firestore', () => {
      component.ngOnInit();
      expect(firebaseDataMock.loadAllOwnedArticles).toHaveBeenCalled();
    });

    it('should update theme color to article-overview blue', () => {
      component.ngOnInit();
      expect(listUtilsMock.updateThemeColors).toHaveBeenCalledWith('#1a9edb');
    });
  });

  describe('ngOnDestroy()', () => {
    it('should reset theme on destroy', () => {
      component.ngOnDestroy();
      expect(listUtilsMock.resetToDefaultTheme).toHaveBeenCalled();
    });
  });

  // --- Private logic (via cast) ---

  describe('applyFilter()', () => {
    const articles = [
      makeArticle('1', 'Apfel', 'user1'),
      makeArticle('2', 'Birne', 'other')
    ];

    it('should return all articles for filter "all"', () => {
      const result = (component as any).applyFilter(articles, 'all');
      expect(result.length).toBe(2);
    });

    it('should return only own articles for filter "owned"', () => {
      const result = (component as any).applyFilter(articles, 'owned');
      expect(result).toEqual([articles[0]]);
    });

    it('should return only shared articles for filter "shared"', () => {
      const result = (component as any).applyFilter(articles, 'shared');
      expect(result).toEqual([articles[1]]);
    });

    it('should return all articles when currentUserId is null', () => {
      authServiceMock.getCurrentUserId.mockReturnValue(null);
      const c = makeComponent();
      const result = (c as any).applyFilter(articles, 'owned');
      expect(result.length).toBe(2);
    });
  });

  describe('sortArticles()', () => {
    it('should sort by name alphabetically ascending', () => {
      const articles = [makeArticle('1', 'Zucker'), makeArticle('2', 'Apfel'), makeArticle('3', 'Milch')];
      const result = (component as any).sortArticles(articles, 'name');
      expect(result.map((a: any) => a.name)).toEqual(['Apfel', 'Milch', 'Zucker']);
    });

    it('should sort by checkCount descending', () => {
      const articles = [
        { ...makeArticle('1', 'A'), stats: { numberOfChecks: 3 } },
        { ...makeArticle('2', 'B'), stats: { numberOfChecks: 10 } },
        { ...makeArticle('3', 'C'), stats: { numberOfChecks: 1 } }
      ];
      const result = (component as any).sortArticles(articles, 'checkCount');
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('1');
      expect(result[2].id).toBe('3');
    });

    it('should sort by lastChecked descending', () => {
      const now = Date.now();
      const articles = [
        { ...makeArticle('1', 'A'), stats: { lastCheckedDate: new Date(now - 1000) } },
        { ...makeArticle('2', 'B'), stats: { lastCheckedDate: new Date(now) } },
        { ...makeArticle('3', 'C'), stats: { lastCheckedDate: new Date(now - 5000) } }
      ];
      const result = (component as any).sortArticles(articles, 'lastChecked');
      expect(result[0].id).toBe('2');
      expect(result[2].id).toBe('3');
    });

    it('should sort by lastAdded descending', () => {
      const now = Date.now();
      const articles = [
        { ...makeArticle('1', 'A'), stats: { lastAddedToListDate: new Date(now - 2000) } },
        { ...makeArticle('2', 'B'), stats: { lastAddedToListDate: new Date(now) } }
      ];
      const result = (component as any).sortArticles(articles, 'lastAdded');
      expect(result[0].id).toBe('2');
    });

    it('should sort equal-count articles by name as tiebreaker', () => {
      const articles = [
        { ...makeArticle('1', 'Zucker'), stats: { numberOfChecks: 5 } },
        { ...makeArticle('2', 'Apfel'), stats: { numberOfChecks: 5 } }
      ];
      const result = (component as any).sortArticles(articles, 'checkCount');
      expect(result[0].name).toBe('Apfel');
    });
  });

  describe('getTimestamp()', () => {
    it('should return getTime() from a Date object', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      expect((component as any).getTimestamp(date)).toBe(date.getTime());
    });

    it('should return number as-is', () => {
      expect((component as any).getTimestamp(1700000000000)).toBe(1700000000000);
    });

    it('should parse ISO string to timestamp', () => {
      const iso = '2024-06-01T00:00:00.000Z';
      expect((component as any).getTimestamp(iso)).toBe(new Date(iso).getTime());
    });

    it('should call .toDate() on Firestore Timestamp objects', () => {
      const firestoreTs = { toDate: () => new Date('2024-03-01') };
      expect((component as any).getTimestamp(firestoreTs)).toBe(new Date('2024-03-01').getTime());
    });

    it('should return 0 for null', () => {
      expect((component as any).getTimestamp(null)).toBe(0);
    });

    it('should return 0 for undefined', () => {
      expect((component as any).getTimestamp(undefined)).toBe(0);
    });

    it('should return 0 for invalid date string', () => {
      expect((component as any).getTimestamp('kein-datum')).toBe(0);
    });
  });

  // --- Swipe gestures ---

  describe('onTouchStart()', () => {
    it('should initialize swipe state for article', () => {
      const event = { touches: [{ clientX: 300, clientY: 150 }] } as unknown as TouchEvent;
      component.onTouchStart(event, 'art1');
      expect(component.swipeStates['art1']).toBeDefined();
      expect(component.swipeStates['art1'].startX).toBe(300);
      expect(component.swipeStates['art1'].startY).toBe(150);
      expect(component.swipeStates['art1'].isSwipeActive).toBe(false);
    });
  });

  describe('onTouchMove()', () => {
    it('should activate horizontal left swipe', () => {
      component.onTouchStart({ touches: [{ clientX: 300, clientY: 100 }] } as any, 'art1');
      const moveEvent = {
        touches: [{ clientX: 175, clientY: 103 }],
        preventDefault: vi.fn()
      } as unknown as TouchEvent;
      component.onTouchMove(moveEvent, 'art1');
      expect(component.swipeStates['art1'].isSwipeActive).toBe(true);
      expect(component.swipeStates['art1'].swipeDistance).toBe(125);
    });

    it('should cap swipe distance at MAX_SWIPE_DISTANCE (120px)', () => {
      component.onTouchStart({ touches: [{ clientX: 300, clientY: 100 }] } as any, 'art1');
      const moveEvent = {
        touches: [{ clientX: 50, clientY: 102 }],
        preventDefault: vi.fn()
      } as unknown as TouchEvent;
      component.onTouchMove(moveEvent, 'art1');
      expect(component.swipeStates['art1'].swipeDistance).toBe(120);
    });

    it('should not activate swipe for predominantly vertical movement', () => {
      component.onTouchStart({ touches: [{ clientX: 300, clientY: 100 }] } as any, 'art1');
      const moveEvent = {
        touches: [{ clientX: 295, clientY: 200 }],
        preventDefault: vi.fn()
      } as unknown as TouchEvent;
      component.onTouchMove(moveEvent, 'art1');
      expect(component.swipeStates['art1'].isSwipeActive).toBe(false);
      expect(moveEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('should do nothing when swipe state not initialized', () => {
      const moveEvent = {
        touches: [{ clientX: 100, clientY: 100 }],
        preventDefault: vi.fn()
      } as unknown as TouchEvent;
      expect(() => component.onTouchMove(moveEvent, 'unbekannt')).not.toThrow();
    });
  });
});
