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
import { MatDialogModule } from '@angular/material/dialog';

// Optimized component imports
import { SearchDisambiguationComponent } from '../../../shared/components/search-disambiguation/search-disambiguation.component';
import { ArticleListComponent, DepartmentGroup } from '../../../shared/components/article-list/article-list.component';
import { FilterFabComponent } from '../../../shared/components/filter-fab/filter-fab.component';
import { ArticleItemData } from '../../../shared/components/article-item/article-item.component';
import { ShoppingModeComponent } from './shopping-mode/shopping-mode.component';

// Services and Models
import { ShoppingList, Article, Department } from '../../../core/models';
import { DataService } from '../../../core/services/data.service';
import { DepartmentService } from '../../../core/services/department.service';
import { ListUtilsService } from '../../../core/services/list-utils.service';
import { DisambiguationService } from '../../../core/services/ai/disambiguation';
import { DisambiguationOption } from '../../../core/services/ai/ai-models';
import { DEFAULT_DEPARTMENT_ORDER } from '../../../core/models';
import { ListFilterService } from './services/list-filter.service';

// Simplified type definitions
type ViewMode = 'shopping' | 'edit';
type ShoppingFilter = 'offen' | 'erledigt' | 'alle';
type EditFilter = 'gelistet' | 'fehlend' | 'alle';

@Component({
  selector: 'app-list-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatToolbarModule, MatIconModule,
    MatButtonModule, MatSnackBarModule, MatDialogModule,
    SearchDisambiguationComponent,
    ArticleListComponent,
    FilterFabComponent,
    ShoppingModeComponent
  ],
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
  
  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly dataService: DataService,
    private readonly departmentService: DepartmentService,
    public readonly listUtils: ListUtilsService,
    private readonly snackBar: MatSnackBar,
    private readonly cdr: ChangeDetectorRef,
    private readonly disambiguationService: DisambiguationService,
    private readonly filterService: ListFilterService
  ) {
    this.listId = this.route.snapshot.paramMap.get('id') || '';
    this.list$ = this.dataService.getLists().pipe(
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
   * - Subscribes to list data updates
   * - Sets up article filtering pipelines
   * - Initializes search functionality
   * - Configures completion monitoring for celebration animation
   */
  ngOnInit(): void {
    this.initializeComponent();
    this.setupSubscriptions();
    this.setupSearchDisambiguation();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  // === NAVIGATION ===
  onBack(): void {
    this.listUtils.resetToDefaultTheme();
    this.router.navigate(['/lists']);
  }
  
  switchToShoppingMode(): void { 
    this.currentMode.set('shopping');
    this.wasIncompleteLastCheck = false; // Reset completion tracker
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
    this.wasIncompleteLastCheck = false;

    // Reset celebration when switching filters
    if (this.showCelebrationAnimation()) {
      this.closeCelebrationAnimation();
    }
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
    this.dataService.toggleItemChecked(this.listId, article.id).subscribe({
      next: (success) => {
        if (success) {
          this.triggerChangeDetection();
        }
      },
      error: (error) => console.error('Toggle error:', error)
    });
  }

  onUndoArticleCompletion(article: ArticleItemData): void {
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
    const action = article.isInList 
      ? this.dataService.removeArticleFromList(this.listId, article.id)
      : this.dataService.addArticleToList(this.listId, article.id);
    
    action.subscribe({
      next: (success) => {
        if (success) {
          this.snackBar.open(
            `${article.name} ${article.isInList ? 'entfernt' : 'hinzugefügt'}`, 
            '', { duration: 1000 }
          );
          this.triggerChangeDetection();
        }
      },
      error: (error) => console.error('Toggle list error:', error)
    });
  }

  onArticleInfo(article: ArticleItemData): void {
    if (article?.id) {
      this.router.navigate(['/articles/edit', article.id], {
        queryParams: { returnTo: `/lists/${this.listId}?mode=${this.currentMode()}` }
      });
    }
  }

  // === SEARCH MANAGEMENT ===
  onSearchQueryChange(): void {
    this.filterService.setSearchQuery(this.searchQuery.trim());
    this.searchDisambiguation$.next(null);

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
        await this.createAndAddNewArticle(query, option);
      }
      this.clearSearch();
    } catch (error) {
      console.error('Error selecting search disambiguation:', error);
      this.snackBar.open('Fehler beim Hinzufügen des Artikels', '', { duration: 2000 });
    }
  }

  onClearSearchDisambiguation(): void {
    this.searchDisambiguation$.next(null);
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
    
    if (confirm(`Alle ${count} Artikel von der Liste entfernen?`)) {
      this.dataService.clearAllItemsFromList(this.listId).subscribe({
        next: (success) => this.snackBar.open(
          success ? 'Liste geleert' : 'Fehler beim Leeren der Liste', 
          '', { duration: 1500 }
        ),
        error: () => this.snackBar.open('Fehler beim Leeren der Liste', '', { duration: 2000 })
      });
    }
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
    
    const confirmMessage = `Liste "${this.currentList.name}" wirklich löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`;
    
    if (confirm(confirmMessage)) {
      this.dataService.deleteList(this.listId).subscribe({
        next: (success) => {
          this.snackBar.open(
            success ? 'Liste gelöscht' : 'Fehler beim Löschen', 
            '', { duration: 1500 }
          );
          if (success) this.router.navigate(['/lists']);
        },
        error: () => this.snackBar.open('Fehler beim Löschen', '', { duration: 2000 })
      });
    }
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

  private createUnifiedObservable(mode: ViewMode): Observable<DepartmentGroup[]> {
    const filter$ = mode === 'shopping' ? this.filterService.shoppingFilter$ : this.filterService.editFilter$;

    const articlesWithState$ = combineLatest([
      this.list$,
      this.dataService.getArticles(),
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
      
      switch (filter as ShoppingFilter) {
        case 'offen':
          articles = articles.filter(a => !a.isChecked);
          break;
        case 'erledigt':
          articles = articles.filter(a => a.isChecked);
          break;
      }
    } else {
      // EDIT MODE - Show ALL articles, not just those in the list
      articles = allArticles.map(article => this.mapToArticleItemData(article, list));
      
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
      listAmount: itemState?.amount || article.amount || ''
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
      } else if (this.currentMode() === 'shopping' && listArticles.length === 0 && this.currentShoppingFilter() === 'alle') {
        this.handleNoSearchResults(query.trim(), allArticles);
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
      this.dataService.updateListItemAmount(this.listId, article.id, newAmount.trim()).subscribe({
        next: () => this.snackBar.open('Menge aktualisiert', '', { duration: 1000 }),
        error: (error) => console.error('Error updating amount:', error)
      });
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
        const didSwitch = this.filterService.autoSwitchToAllFilter(this.currentMode());

        if (didSwitch) {
          // Update local signal to match service state
          if (this.currentMode() === 'shopping') {
            this.currentShoppingFilter.set('alle');
          } else {
            this.currentEditFilter.set('alle');
          }

          this.snackBar.open('Filter auf Alle gestellt', '', {
            duration: 400,
            verticalPosition: 'bottom'
          });
        }

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
    this.dataService.getArticles().subscribe(articles => {
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