import { Component, OnInit, ChangeDetectorRef, OnDestroy, signal, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { map, debounceTime, distinctUntilChanged, take, takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Store } from '@ngrx/store';

// Optimized component imports
import { SearchDisambiguationComponent } from '../../../shared/components/search-disambiguation/search-disambiguation.component';
import { ArticleListComponent, DepartmentGroup } from '../../../shared/components/article-list/article-list.component';
import { FilterFabComponent } from '../../../shared/components/filter-fab/filter-fab.component';
import { ArticleItemData } from '../../../shared/components/article-item/article-item.component';
import { ShoppingModeComponent } from './shopping-mode/shopping-mode.component';
import { EditModeComponent } from './edit-mode/edit-mode.component';
import { HistoryModeComponent } from './history-mode/history-mode.component';

// Services and Models
import { ShoppingList, Article, Department } from '../../../core/models';
import { AppState } from '../../../state/app.state';
import * as ListsActions from '../../../state/lists/lists.actions';
import * as ArticlesActions from '../../../state/articles/articles.actions';
import { selectAllLists, selectListById } from '../../../state/lists/lists.selectors';
import { selectAllArticles } from '../../../state/articles/articles.selectors';
import { DataService } from '../../../core/services/data.service';
import { DepartmentService } from '../../../core/services/department.service';
import { ListUtilsService } from '../../../core/services/list-utils.service';
import { DisambiguationService } from '../../../core/services/ai/disambiguation';
import { DisambiguationOption } from '../../../core/services/ai/ai-models';
import { DEFAULT_DEPARTMENT_ORDER } from '../../../core/models';
import { ListFilterService } from './services/list-filter.service';
import { ArticleSelectionService } from './services/article-selection.service';
import { ListPickerDialogComponent, ListPickerDialogData, ListPickerDialogResult } from '../../../shared/components/list-picker-dialog/list-picker-dialog';
import { ShareDialogComponent, ShareDialogData } from '../share-dialog/share-dialog.component';
import { SharingService } from '../../../core/services/sharing.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserProfileService } from '../../../core/services/user-profile.service';
import { AIService } from '../../../core/services/ai';
import { ApiKeyTipDialogComponent } from '../../../shared/components/api-key-tip-dialog/api-key-tip-dialog.component';
import { ActiveListService } from '../../../core/services/active-list.service';

// Simplified type definitions
type ViewMode = 'shopping' | 'edit';
type ShoppingFilter = 'offen' | 'erledigt' | 'alle';
type EditFilter = 'gelistet' | 'fehlend' | 'alle';

@Component({
  selector: 'app-list-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatToolbarModule, MatIconModule,
    MatButtonModule, MatSnackBarModule, MatDialogModule, MatTooltipModule,
    SearchDisambiguationComponent,
    FilterFabComponent,
    ShoppingModeComponent,
    EditModeComponent,
    HistoryModeComponent
  ],
  providers: [ArticleSelectionService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './list-detail.html',
  styleUrls: ['./list-detail.scss']
})
export class ListDetailComponent implements OnInit, OnDestroy {

  // === SIGNALS ===
  readonly currentMode = signal<ViewMode>('shopping');
  readonly currentShoppingFilter = signal<ShoppingFilter>('offen');
  readonly currentEditFilter = signal<EditFilter>('alle');
  readonly isLoading = signal<boolean>(true);
  readonly isFabExpanded = signal<boolean>(false);
  readonly isSelectionMode = signal<boolean>(false);
  readonly isDialogOpen = signal<boolean>(false);
  readonly isOwner = signal<boolean>(true); // Phase 8: Ownership check for edit/delete permissions
  
  // === OBSERVABLES ===
  private readonly destroy$ = new Subject<void>();
  private readonly listId: string;
  
  readonly list$: Observable<ShoppingList | undefined>;
  readonly departmentGroups$: Observable<DepartmentGroup[]>;
  readonly departmentGroupsEdit$: Observable<DepartmentGroup[]>;
  readonly searchDisambiguation$ = new BehaviorSubject<any>(null);
  
  // === STATE STREAMS ===
  
  // === COMPONENT STATE ===
  searchQuery = '';
  currentList: ShoppingList | null = null;

  // === PRIVATE PROPERTIES ===
  private autoSwitchTimer?: any;
  private disambiguationManuallyClosed = false;
  
  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly store: Store<AppState>,
    private readonly dataService: DataService, // Keep for operations not yet in NgRx
    private readonly departmentService: DepartmentService,
    public readonly listUtils: ListUtilsService,
    private readonly snackBar: MatSnackBar,
    private readonly cdr: ChangeDetectorRef,
    private readonly disambiguationService: DisambiguationService,
    private readonly filterService: ListFilterService,
    public readonly selectionService: ArticleSelectionService,
    private readonly dialog: MatDialog,
    private readonly sharingService: SharingService,
    private readonly authService: AuthService,
    private readonly userProfileService: UserProfileService,
    private readonly aiService: AIService,
    private readonly activeListService: ActiveListService
  ) {
    this.listId = this.route.snapshot.paramMap.get('id') || '';

    // Use NgRx store selector for list data
    this.list$ = this.store.select(selectAllLists).pipe(
      map(lists => lists.find(list => list.id === this.listId)),
      takeUntil(this.destroy$)
    );

    this.departmentGroups$ = this.createUnifiedObservable('shopping');
    this.departmentGroupsEdit$ = this.createUnifiedObservable('edit');
  }

  /**
   * Component initialization
   *
   * Sets up the reactive data streams for the list, articles, and filtering.
   * Initializes shopping mode with "offen" filter by default.
   *
   * Key initialization steps:
   * - Dispatches NgRx actions to load list and articles data
   * - Subscribes to list data updates
   * - Sets up article filtering pipelines
   * - Initializes search functionality
   * - Configures completion monitoring for celebration animation
   * - LAZY LISTENERS: Activates real-time listener for this specific list only
   */
  ngOnInit(): void {
    // Dispatch NgRx actions to load data
    this.store.dispatch(ListsActions.loadLists());
    this.store.dispatch(ArticlesActions.loadArticles());

    // LAZY LISTENERS: Activate listener for this list (98% quota reduction!)
    this.activeListService.setActiveList(this.listId);

    this.initializeComponent();
    this.setupSubscriptions();
    this.setupSearchDisambiguation();
    this.setupSelectionModeSubscription();
  }

  ngOnDestroy(): void {
    // LAZY LISTENERS: Clear active list to cleanup listener
    this.activeListService.clearActiveList();
    this.cleanup();
  }

  // === SELECTION MODE ===

  /**
   * Toggles selection mode on/off in shopping mode
   */
  toggleSelectionMode(): void {
    if (this.selectionService.isSelectionMode) {
      this.exitSelectionMode();
    } else {
      this.enterSelectionMode();
    }
  }

  /**
   * Enters selection mode
   */
  enterSelectionMode(): void {
    this.selectionService.enterSelectionMode();
    this.closeFab(); // Close filter FAB when entering selection mode
  }

  /**
   * Exits selection mode and clears selections
   */
  exitSelectionMode(): void {
    this.selectionService.exitSelectionMode();
  }

  // === NAVIGATION ===
  onBack(): void {
    this.listUtils.resetToDefaultTheme();
    this.router.navigate(['/lists']);
  }
  
  switchToShoppingMode(): void {
    this.currentMode.set('shopping');
    this.cdr.detectChanges();
  }

  switchToEditMode(): void {
    this.currentMode.set('edit');
    this.cdr.detectChanges();
  }

  // === FILTER MANAGEMENT ===
  /**
   * Handles filter changes from FilterFab component
   *
   * Switches between view modes (shopping/edit) and applies the appropriate filter.
   * Shopping mode filters: 'offen' (open), 'erledigt' (completed), 'alle' (all)
   * Edit mode filters: 'gelistet' (in list), 'fehlend' (not in list), 'alle' (all)
   *
   * @param data - Object containing mode and filter selection
   * @param data.mode - View mode: 'shopping' or 'edit'
   * @param data.filter - Filter value based on current mode
   *
   * @example
   * ```typescript
   * // Switch to shopping mode, show only open items
   * onFilterChange({ mode: 'shopping', filter: 'offen' });
   *
   * // Switch to edit mode, show all articles
   * onFilterChange({ mode: 'edit', filter: 'alle' });
   * ```
   */
  onFilterChange(data: { mode: ViewMode; filter: ShoppingFilter | EditFilter }): void {
    if (data.mode === 'shopping') {
      this.setShoppingFilter(data.filter as ShoppingFilter);
    } else {
      this.setEditFilter(data.filter as EditFilter);
    }
  }

  private setShoppingFilter(filter: ShoppingFilter): void {
    console.log('🔄 Switching shopping filter to:', filter);

    this.currentShoppingFilter.set(filter);
    this.filterService.setShoppingFilter(filter);
    this.isFabExpanded.set(false);
    this.searchDisambiguation$.next(null);
    this.disambiguationManuallyClosed = false;
  }

  private setEditFilter(filter: EditFilter): void {
    this.currentEditFilter.set(filter);
    this.filterService.setEditFilter(filter);
    this.isFabExpanded.set(false);
    this.searchDisambiguation$.next(null);
    this.cdr.detectChanges();
  }

  // === FAB CONTROLS ===
  toggleFab(): void { 
    this.isFabExpanded.update(expanded => !expanded);
  }
  
  closeFab(): void { 
    this.isFabExpanded.set(false);
  }

  // === ARTICLE EVENTS ===

  /**
   * Handles article check/uncheck toggle
   *
   * In shopping mode:
   * - Checking an article starts a 5-second undo timer
   * - Shows undo hint during timer period
   * - Triggers celebration animation when all items completed
   * - Clicking during undo period reverses the action
   *
   * In edit mode:
   * - Toggles article inclusion in the list
   *
   * @param article - Article item data including ID, name, and check state
   *
   * @example
   * ```typescript
   * // User checks off "Milch"
   * onArticleToggle({ id: 'article-123', name: 'Milch', isChecked: false, ... });
   * // -> Marks as checked, shows undo hint for 5 seconds
   * //    If clicked again within 5s, unchecks the item
   * ```
   *
   */
  onArticleToggle(article: ArticleItemData): void {
    // Dispatch NgRx action to toggle article checked state
    this.store.dispatch(ListsActions.toggleArticleChecked({
      listId: this.listId,
      articleId: article.id
    }));
    this.triggerChangeDetection();
  }

  onUndoArticleCompletion(article: ArticleItemData): void {
    // Dispatch NgRx action to toggle article (undo)
    this.store.dispatch(ListsActions.toggleArticleChecked({
      listId: this.listId,
      articleId: article.id
    }));
    this.triggerChangeDetection();
  }

  private originalOnUndoArticleCompletion_oldDataServiceCode(article: ArticleItemData): void {
    // OLD CODE KEPT FOR REFERENCE - DELETE AFTER TESTING
    this.dataService.toggleItemChecked(this.listId, article.id).subscribe({
      next: (success) => success && console.log('Undo successful for:', article.name),
      error: (error) => console.error('Undo error:', error)
    });
  }
  onEditAmountFromList(data: { article: ArticleItemData; event: Event }): void {
    data.event.stopPropagation();
    this.editArticleAmount(data.article);
  }

  onToggleArticleInList(article: ArticleItemData): void {
    // Dispatch NgRx action to add or remove article from list
    if (article.isInList) {
      this.store.dispatch(ListsActions.removeArticleFromList({
        listId: this.listId,
        articleId: article.id
      }));
    } else {
      this.store.dispatch(ListsActions.addArticleToList({
        listId: this.listId,
        articleId: article.id,
        amount: ''
      }));
    }

    // Optimistic UI update
    this.snackBar.open(
      `${article.name} ${article.isInList ? 'entfernt' : 'hinzugefügt'}`,
      '', { duration: 1000 }
    );
    this.triggerChangeDetection();
  }

  onArticleInfo(article: ArticleItemData): void {
    if (article?.id) {
      this.router.navigate(['/articles/edit', article.id], {
        queryParams: { returnTo: `/lists/${this.listId}?mode=${this.currentMode()}` }
      });
    }
  }

  // === SELECTION ACTIONS ===

  /**
   * Handles moving selected articles to another list
   * Opens a dialog to pick the target list
   */
  onMoveSelectedArticles(articleIds: string[]): void {
    if (!this.currentList || articleIds.length === 0) return;

    // Set dialog open state
    this.isDialogOpen.set(true);

    // Open list picker dialog
    const dialogRef = this.dialog.open(ListPickerDialogComponent, {
      width: '100vw',
      maxWidth: '100vw',
      height: '100vh',
      maxHeight: '100vh',
      panelClass: 'fullscreen-dialog',
      data: {
        title: 'Artikel verschieben',
        message: `${articleIds.length} Artikel ${articleIds.length === 1 ? 'wurde' : 'wurden'} ausgewählt`,
        currentListId: this.listId
      } as ListPickerDialogData
    });

    dialogRef.afterClosed().subscribe((result: ListPickerDialogResult | null) => {
      // Reset dialog open state
      this.isDialogOpen.set(false);

      if (result) {
        this.dataService.moveArticlesBetweenLists(
          articleIds,
          this.listId,
          result.selectedListId
        ).subscribe({
          next: (response) => {
            if (response.success) {
              this.snackBar.open(
                `${articleIds.length} Artikel zu "${result.selectedListName}" verschoben`,
                '', { duration: 2000 }
              );
              this.exitSelectionMode();
            } else {
              this.snackBar.open(
                'Einige Artikel konnten nicht verschoben werden',
                '', { duration: 3000 }
              );
              console.error('Move errors:', response.errors);
            }
          },
          error: (error) => {
            console.error('Error moving articles:', error);
            this.snackBar.open('Fehler beim Verschieben der Artikel', '', { duration: 2000 });
          }
        });
      }
    });
  }

  /**
   * Handles deleting selected articles from the current list
   */
  onDeleteSelectedArticles(articleIds: string[]): void {
    if (articleIds.length === 0) return;

    const confirmMessage = `${articleIds.length} Artikel ${articleIds.length === 1 ? 'wird' : 'werden'} von der Liste entfernt. Fortfahren?`;

    if (confirm(confirmMessage)) {
      this.dataService.removeMultipleArticlesFromList(this.listId, articleIds).subscribe({
        next: (response) => {
          if (response.success) {
            this.snackBar.open(
              `${articleIds.length} Artikel entfernt`,
              '', { duration: 2000 }
            );
            this.exitSelectionMode();
          } else {
            this.snackBar.open(
              'Einige Artikel konnten nicht entfernt werden',
              '', { duration: 3000 }
            );
            console.error('Delete errors:', response.errors);
          }
        },
        error: (error) => {
          console.error('Error deleting articles:', error);
          this.snackBar.open('Fehler beim Löschen der Artikel', '', { duration: 2000 });
        }
      });
    }
  }

  /**
   * Handles marking selected articles as done
   */
  onMarkSelectedAsDone(articleIds: string[]): void {
    if (articleIds.length === 0) return;

    this.dataService.markMultipleArticlesAsDone(this.listId, articleIds).subscribe({
      next: (response) => {
        if (response.success) {
          this.snackBar.open(
            `${articleIds.length} Artikel als erledigt markiert`,
            '', { duration: 2000 }
          );
          this.exitSelectionMode();
          this.triggerChangeDetection();
        } else {
          this.snackBar.open(
            'Einige Artikel konnten nicht markiert werden',
            '', { duration: 3000 }
          );
          console.error('Mark as done errors:', response.errors);
        }
      },
      error: (error) => {
        console.error('Error marking articles as done:', error);
        this.snackBar.open('Fehler beim Markieren der Artikel', '', { duration: 2000 });
      }
    });
  }

  // === SEARCH MANAGEMENT ===
  onSearchQueryChange(): void {
    this.filterService.setSearchQuery(this.searchQuery.trim());
    this.searchDisambiguation$.next(null);

    // Reset disambiguation flag when search is cleared
    if (!this.searchQuery.trim()) {
      this.disambiguationManuallyClosed = false;
    }

    this.clearAutoSwitchTimer();
    this.autoSwitchTimer = setTimeout(() => {
      this.checkAndAutoSwitchFilter();
    }, 705);
  }

  /**
   * Handles user selection from search disambiguation options
   *
   * When searching for an article results in multiple matches, this processes
   * the user's selection and adds it to the list. Supports both creating new
   * articles and using existing ones.
   *
   * @param option - Selected disambiguation option from search results
   *
   * @example
   * ```typescript
   * // User searched "Milch" and selected "Vollmilch 3,5%"
   * await onSelectSearchDisambiguation({
   *   id: 'article-123',
   *   displayText: 'Vollmilch 3,5%',
   *   type: 'existing'
   * });
   * // -> Adds article to list, clears search, closes disambiguation
   * ```
   *
   * @see {@link DisambiguationService.handleDisambiguationChoice} for processing logic
   */
  async onSelectSearchDisambiguation(option: any): Promise<void> {
    const query = this.searchDisambiguation$.value?.query;
    if (!query) return;

    try {
      if (option.type === 'existing' && option.article) {
        await this.addExistingArticleToList(option.article);
      } else if (option.type === 'new') {
        // Show API key tip dialog if no API key is configured
        if (!this.aiService.hasApiKey()) {
          this.isDialogOpen.set(true);
          const dialogRef = this.dialog.open(ApiKeyTipDialogComponent, {
            width: '400px',
            disableClose: true // User must click OK
          });
          await dialogRef.afterClosed().toPromise();
          this.isDialogOpen.set(false);
        }

        await this.createAndAddNewArticle(query, option);
      }
      this.clearSearch();
    } catch (error) {
      console.error('Error selecting search disambiguation:', error);
      this.snackBar.open('Fehler beim Hinzufügen des Artikels', '', { duration: 2000 });
    }
  }

  onClearSearchDisambiguation(): void {
    // Only close disambiguation, keep search text and filtered results
    this.searchDisambiguation$.next(null);
    this.disambiguationManuallyClosed = true;
  }

  // === LIST ACTIONS ===
  onCreateNewArticle(): void {
    const queryParams: any = { 
      returnTo: `/lists/${this.listId}?mode=edit`,
      listId: this.listId
    };
    if (this.searchQuery.trim()) {
      queryParams.name = this.searchQuery.trim();
    }
    this.router.navigate(['/articles/add'], { queryParams });
  }

  onDepartmentSort(): void {
    if (!this.currentList) return;
    this.router.navigate(['/lists', this.listId, 'departments']);
  }

  onClearAllItems(): void {
    if (!this.currentList) return;

    const count = this.currentList.articleIds.length;
    if (count === 0) {
      this.snackBar.open('Liste ist bereits leer', '', { duration: 1500 });
      return;
    }

    // Confirmation is handled by edit-mode component
    this.dataService.clearAllItemsFromList(this.listId).subscribe({
      next: (success) => this.snackBar.open(
        success ? 'Liste geleert' : 'Fehler beim Leeren der Liste',
        '', { duration: 1500 }
      ),
      error: () => this.snackBar.open('Fehler beim Leeren der Liste', '', { duration: 2000 })
    });
  }

  onEditList(): void {
    if (!this.currentList) return;
    this.router.navigate(['/lists/add'], {
      queryParams: { 
        editId: this.listId, 
        returnTo: `/lists/${this.listId}?mode=edit` 
      }
    });
  }

  onDeleteList(): void {
    if (!this.currentList) return;

    // Confirmation is handled by edit-mode component
    // Dispatch NgRx action to delete list
    this.store.dispatch(ListsActions.deleteList({ listId: this.listId }));

    // Optimistic UI update
    this.snackBar.open('Liste gelöscht', '', { duration: 1500 });
    this.router.navigate(['/lists']);
  }

  // === UTILITY METHODS FOR TEMPLATE ===
  getCurrentListColor(): string { 
    return this.listUtils.getCurrentListColor();
  }

  getContrastColor(hexColor: string): string {
    return this.listUtils.getContrastColor(hexColor);
  }

  // === PRIVATE METHODS ===
  private initializeComponent(): void {
    const mode = this.route.snapshot.queryParamMap.get('mode');
    if (mode === 'edit') {
      this.currentMode.set('edit');
      this.filterService.setEditFilter('alle'); // Ensure edit filter is set to 'alle' by default
    }
  }

  private setupSubscriptions(): void {
    this.list$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (list) => {
        this.currentList = list || null;
        this.isLoading.set(false);

        // Phase 8: Check ownership for edit/delete permissions
        if (list) {
          this.authService.getCurrentUser().pipe(take(1)).subscribe(user => {
            const isOwner = user?.id === list.ownerId;
            this.isOwner.set(isOwner);
          });

          // Phase 8: Preload collaborator profiles for faster display
          // This eagerly fetches user names when entering a shared list
          if (list.sharedWith && list.sharedWith.length > 0) {
            this.userProfileService.preloadUserProfiles([
              list.ownerId,
              ...list.sharedWith
            ]);
          }
        }

        if (list?.color) {
          this.listUtils.updateThemeColors(list.color);
        } else {
          this.listUtils.updateThemeColors('#1a9edb');
        }

        if (!list && !this.isLoading()) {
          this.router.navigate(['/lists']);
        }
      },
      error: (error) => {
        console.error('Error loading list:', error);
        this.isLoading.set(false);
        this.router.navigate(['/lists']);
      }
    });
  }

  /**
   * Subscribes to selection mode changes and updates local signal
   */
  private setupSelectionModeSubscription(): void {
    this.selectionService.isSelectionMode$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(isActive => {
      this.isSelectionMode.set(isActive);
      this.cdr.detectChanges();
    });
  }

  private createUnifiedObservable(mode: ViewMode): Observable<DepartmentGroup[]> {
    const filter$ = mode === 'shopping' ? this.filterService.shoppingFilter$ : this.filterService.editFilter$;

    const articlesWithState$ = combineLatest([
      this.list$,
      this.store.select(selectAllArticles), // Use NgRx store for articles
      this.filterService.searchQuery$.pipe(debounceTime(300), distinctUntilChanged()),
      filter$
    ]).pipe(
      map(([list, articles, query, filter]) => {
        if (!list) return [];

        let filteredArticles = this.getFilteredArticles(list, articles, query, filter, mode);
        return this.groupArticlesByDepartment(filteredArticles, list);
      })
    );

    return combineLatest([
      articlesWithState$,
      this.departmentService.getDepartments()
    ]).pipe(
      map(([articles, departments]) => {
        return this.createDepartmentGroups(articles, departments);
      })
    );
  }

  private getFilteredArticles(
    list: ShoppingList,
    allArticles: Article[],
    query: string,
    filter: ShoppingFilter | EditFilter,
    mode: ViewMode
  ): ArticleItemData[] {
    let articles: ArticleItemData[];

    if (mode === 'shopping') {
      articles = allArticles
        .filter(article => list.articleIds.includes(article.id))
        .map(article => this.mapToArticleItemData(article, list));

      // When searching, skip filter to show all matching results
      if (!query?.trim()) {
        switch (filter as ShoppingFilter) {
          case 'offen':
            // Don't filter here - let shopping-mode child handle hiding via shouldHideArticle
            // This allows checked articles with pending states (undo window) to remain visible
            break;
          case 'erledigt':
            articles = articles.filter(a => a.isChecked);
            break;
        }
      }
    } else {
      // EDIT MODE - Show ALL articles, not just those in the list
      articles = allArticles.map(article => this.mapToArticleItemData(article, list));

      // When searching, skip filter to show all matching results
      if (!query?.trim()) {
        switch (filter as EditFilter) {
          case 'gelistet':
            articles = articles.filter(a => a.isInList);
            break;
          case 'fehlend':
            articles = articles.filter(a => !a.isInList);
            break;
          case 'alle':
            // Show all articles - no filtering
            break;
        }
      }
    }
  
    if (query?.trim()) {
      articles = articles.filter(article =>
        article.name.toLowerCase().includes(query.toLowerCase()) ||
        (article.notes && article.notes.toLowerCase().includes(query.toLowerCase()))
      );
    }
  
    return articles.sort((a, b) => a.name.localeCompare(b.name));
  }

  private mapToArticleItemData(
    article: Article,
    list: ShoppingList
  ): ArticleItemData {
    const itemState = list.itemStates[article.id];

    return {
      id: article.id,
      name: article.name,
      icon: article.icon,
      notes: article.notes,
      amount: article.amount,
      departmentId: article.departmentId,
      isChecked: itemState?.isChecked || false,
      isInList: list.articleIds.includes(article.id),
      listAmount: itemState?.amount || article.amount || '',
      // Phase 8: Sharing fields
      ownerId: article.ownerId,
      copiedFrom: article.copiedFrom
    };
  }

  private groupArticlesByDepartment(articles: ArticleItemData[], list: ShoppingList): ArticleItemData[] {
    const departmentOrder = list.departmentOrder || DEFAULT_DEPARTMENT_ORDER;
    const departmentMap = new Map<string, ArticleItemData[]>();
    
    articles.forEach(article => {
      const deptId = article.departmentId || 'miscellaneous'; // ✅ This should catch empty departments
      if (!departmentMap.has(deptId)) departmentMap.set(deptId, []);
      departmentMap.get(deptId)!.push(article);
    });
    
    const orderedArticles: ArticleItemData[] = [];
    departmentOrder.forEach(deptId => {
      if (departmentMap.has(deptId)) {
        orderedArticles.push(...departmentMap.get(deptId)!);
      }
    });
    
    // ❌ POTENTIAL ISSUE: Articles with departments not in the order are lost!
    // Add this to catch orphaned articles:
    departmentMap.forEach((articles, deptId) => {
      if (!departmentOrder.includes(deptId)) {
        console.warn(`Articles found with unknown department: ${deptId}`, articles);
        orderedArticles.push(...articles); // Add them anyway
      }
    });
    
    return orderedArticles;
  }
  private createDepartmentGroups(articles: ArticleItemData[], departments: Department[]): DepartmentGroup[] {
    const departmentMap = new Map<string, ArticleItemData[]>();
    
    articles.forEach(article => {
      const deptId = article.departmentId || 'miscellaneous';
      if (!departmentMap.has(deptId)) departmentMap.set(deptId, []);
      departmentMap.get(deptId)!.push(article);
    });
    
    const groups: DepartmentGroup[] = [];
    const departmentOrder = this.currentList?.departmentOrder || DEFAULT_DEPARTMENT_ORDER;
    
    departmentOrder.forEach(deptId => {
      if (departmentMap.has(deptId)) {
        const department = departments.find(d => d.id === deptId) || {
          id: 'miscellaneous', 
          nameGerman: 'Sonstiges', 
          nameEnglish: 'Miscellaneous',
          icon: 'Help-Chat-2--Streamline-Core-Remix.png'
        };
        groups.push({
          department,
          articles: departmentMap.get(deptId)!
        });
      }
    });
    
    return groups;
  }

  private setupSearchDisambiguation(): void {
    combineLatest([
      this.filterService.searchQuery$.pipe(debounceTime(500), distinctUntilChanged()),
      this.departmentGroups$.pipe(map(groups => groups.flatMap(g => g.articles))),
      this.departmentGroupsEdit$.pipe(map(groups => groups.flatMap(g => g.articles)))
    ]).pipe(takeUntil(this.destroy$)).subscribe(([query, listArticles, allArticles]) => {
      if (!query.trim()) {
        this.searchDisambiguation$.next(null);
      } else if (this.currentMode() === 'shopping') {
        // Don't show disambiguation in history mode ('erledigt') or if manually closed
        if (this.currentShoppingFilter() === 'erledigt' || this.disambiguationManuallyClosed) {
          this.searchDisambiguation$.next(null);
        } else {
          this.handleNoSearchResults(query.trim(), allArticles);
        }
      } else {
        this.searchDisambiguation$.next(null);
      }
    });
  }

  private async handleNoSearchResults(query: string, allArticles: ArticleItemData[]): Promise<void> {
    try {
      const articlesNotInList = allArticles.filter(article => !article.isInList);
      const hasMatches = articlesNotInList.some(article => 
        article.name.toLowerCase().includes(query.toLowerCase())
      );

      if (hasMatches || query.length >= 3) {
        const options = await this.disambiguationService.getDisambiguationOptions(query);
        
        if (options.length > 0) {
          this.searchDisambiguation$.next({
            query,
            options: options.filter((opt: DisambiguationOption) => opt.type !== 'skip'),
            message: `Für "${query}" wurden ähnliche Artikel gefunden:`
          });
        }
      }
    } catch (error) {
      console.error('Search disambiguation error:', error);
    }
  }

  private editArticleAmount(article: ArticleItemData): void {
    const currentAmount = article.listAmount || article.amount || '';
    const newAmount = prompt(`Menge für ${article.name}:`, currentAmount);

    if (newAmount !== null) {
      // Dispatch NgRx action to update article amount
      this.store.dispatch(ListsActions.updateArticleAmount({
        listId: this.listId,
        articleId: article.id,
        amount: newAmount.trim()
      }));

      // Optimistic UI feedback
      this.snackBar.open('Menge aktualisiert', '', { duration: 1000 });
    }
  }

  private async addExistingArticleToList(article: any): Promise<void> {
    if (!this.currentList) return;
  
    const updatedArticleIds = [...this.currentList.articleIds];
    if (!updatedArticleIds.includes(article.id)) {
      updatedArticleIds.push(article.id);
    }
  
    const updatedItemStates = { ...this.currentList.itemStates };
    updatedItemStates[article.id] = {
      articleId: article.id,
      isChecked: false,
      amount: article.amount || ''
    };
  
    const success = await this.dataService.updateList(this.currentList.id, {
      articleIds: updatedArticleIds,
      itemStates: updatedItemStates
    }).pipe(take(1)).toPromise();
  
    if (success) {
      this.snackBar.open(`"${article.name}" zur Liste hinzugefügt`, '', { duration: 1500 });
      
      // Restore previous filter if we had auto-switched
      this.restorePreviousFilter();
      
      setTimeout(() => this.searchDisambiguation$.next(null), 100);
    }
  }

  private async createAndAddNewArticle(itemName: string, option: any): Promise<void> {
    const articleData = {
      name: itemName,
      amount: '',
      departmentId: option.suggestedDepartmentId || 'miscellaneous',
      icon: option.icon || '📦'
    };
  
    const newArticle = await this.dataService.createArticle(articleData).pipe(take(1)).toPromise();
    if (newArticle) {
      await this.addExistingArticleToList(newArticle);
      // restorePreviousFilter() is called in addExistingArticleToList, so no need to call it here
    }
  }

  private restorePreviousFilter(): void {
    this.filterService.restorePreviousFilter(this.currentMode());
    // Update local signal to match service state
    if (this.currentMode() === 'shopping') {
      this.currentShoppingFilter.set(this.filterService.currentShoppingFilter);
    } else {
      this.currentEditFilter.set(this.filterService.currentEditFilter);
    }
  }

  private checkAndAutoSwitchFilter(): void {
    if (!this.searchQuery.trim()) {
      return;
    }

    this.departmentGroups$.pipe(take(1)).subscribe(groups => {
      const articles = groups.flatMap(g => g.articles);

      if (articles.length === 0) {
        // Keep the filter as it was - don't auto-switch to 'alle'
        // User wants to preserve the current filter state (e.g., 'offen' stays 'offen')

        setTimeout(() => {
          this.handleNoSearchResults(this.searchQuery.trim(), []);
        }, 100);
      }
    });
  }

  private clearSearch(): void {
    this.searchQuery = '';
    this.filterService.clearSearch();
    this.searchDisambiguation$.next(null);
    this.disambiguationManuallyClosed = false;

    // Restore previous filter if it was auto-switched
    this.restorePreviousFilter();
  }

  private clearAutoSwitchTimer(): void {
    if (this.autoSwitchTimer) {
      clearTimeout(this.autoSwitchTimer);
    }
  }

  private triggerChangeDetection(): void {
    setTimeout(() => this.cdr.detectChanges(), 100);
  }

  /**
   * Phase 8C: Opens share dialog to manage list sharing
   */
  openShareDialog(): void {
    console.log('🔍 Share button clicked!');
    console.log('  Current list:', this.currentList);

    if (!this.currentList) {
      console.error('❌ No current list available');
      return;
    }

    console.log('  Opening dialog with list:', {
      id: this.currentList.id,
      name: this.currentList.name,
      ownerId: this.currentList.ownerId,
      sharedWith: this.currentList.sharedWith
    });

    this.dialog.open(ShareDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: {
        list: this.currentList
      } as ShareDialogData
    });
  }

  /**
   * Phase 8C: Gets tooltip text for collaborator badge
   */
  getCollaboratorTooltip(): string {
    if (!this.currentList) return '';

    const totalUsers = 1 + (this.currentList.sharedWith?.length || 0);
    return `Geteilt mit ${totalUsers} ${totalUsers === 1 ? 'Person' : 'Personen'}`;
  }

  private cleanup(): void {
    this.clearAutoSwitchTimer();

    this.destroy$.next();
    this.destroy$.complete();

    this.filterService.cleanup();

    const currentUrl = this.router.url;
    if (!currentUrl.includes('/lists/') || currentUrl === '/lists') {
      this.listUtils.resetToDefaultTheme();
    }
  }

  debugArticleDepartments(): void {
    // Use NgRx store to get articles
    this.store.select(selectAllArticles).pipe(take(1)).subscribe(articles => {
      const problematic = articles.filter(a => !a.departmentId || a.departmentId === '');
      console.log('Articles without departments:', problematic.length);

      problematic.forEach(article => {
        console.log(`${article.name}:`, {
          departmentId: article.departmentId,
          type: typeof article.departmentId,
          hasProperty: Object.hasOwnProperty.call(article, 'departmentId'),
          icon: article.icon
        });
      });
    });
  }
}