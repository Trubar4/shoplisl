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

// Services and Models
import { ShoppingList, Article, Department } from '../../../core/models';
import { DataService } from '../../../core/services/data.service';
import { DepartmentService } from '../../../core/services/department.service';
import { ListUtilsService } from '../../../core/services/list-utils.service';
import { SimplifiedDisambiguationService } from '../../../core/services/ai/simplified-disambiguation.service';
import { DisambiguationOption } from '../../../core/services/ai/ai-models';
import { DEFAULT_DEPARTMENT_ORDER } from '../../../core/models';

// Simplified interfaces
interface PendingState {
  pendingHideTimestamp?: number;
  showUndoHint?: boolean;
}

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
    FilterFabComponent
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
  readonly showCelebrationAnimation = signal<boolean>(false);
  
  // === OBSERVABLES ===
  private readonly destroy$ = new Subject<void>();
  private readonly listId: string;
  
  readonly list$: Observable<ShoppingList | undefined>;
  readonly departmentGroups$: Observable<DepartmentGroup[]>;
  readonly departmentGroupsEdit$: Observable<DepartmentGroup[]>;
  readonly searchDisambiguation$ = new BehaviorSubject<any>(null);
  
  // === STATE STREAMS ===
  private readonly shoppingFilter$ = new BehaviorSubject<ShoppingFilter>('offen');
  private readonly editFilter$ = new BehaviorSubject<EditFilter>('alle');
  private readonly searchQuery$ = new BehaviorSubject<string>('');
  private readonly pendingStates$ = new BehaviorSubject<Record<string, PendingState>>({});
  
  // === COMPONENT STATE ===
  searchQuery = '';
  currentList: ShoppingList | null = null;
  
  // === PRIVATE PROPERTIES ===
  private readonly undoHintTimeouts = new Map<string, any>();
  private celebrationTimeout?: any;
  private autoSwitchTimer?: any;
  private readonly HIDE_DELAY_MS = 5000;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly dataService: DataService,
    private readonly departmentService: DepartmentService,
    public readonly listUtils: ListUtilsService,
    private readonly snackBar: MatSnackBar,
    private readonly cdr: ChangeDetectorRef,
    private readonly disambiguationService: SimplifiedDisambiguationService
  ) {
    this.listId = this.route.snapshot.paramMap.get('id') || '';
    this.list$ = this.dataService.getLists().pipe(
      map(lists => lists.find(list => list.id === this.listId)),
      takeUntil(this.destroy$)
    );

    this.departmentGroups$ = this.createUnifiedObservable('shopping');
    this.departmentGroupsEdit$ = this.createUnifiedObservable('edit');
  }

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
    this.cdr.detectChanges();
  }
  
  switchToEditMode(): void { 
    this.currentMode.set('edit');
    this.cdr.detectChanges();
  }

  // === FILTER MANAGEMENT ===
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
    this.shoppingFilter$.next(filter);
    this.isFabExpanded.set(false);
    this.searchDisambiguation$.next(null);
    
    // Reset celebration when switching filters
    if (this.showCelebrationAnimation()) {
      this.closeCelebrationAnimation();
    }
  }
  
  private setEditFilter(filter: EditFilter): void {
    this.currentEditFilter.set(filter);
    this.editFilter$.next(filter);
    this.isFabExpanded.set(false);
    this.searchDisambiguation$.next(null); // Add this line
    this.cdr.detectChanges(); // Add this line
  }

  // === FAB CONTROLS ===
  toggleFab(): void { 
    this.isFabExpanded.update(expanded => !expanded);
  }
  
  closeFab(): void { 
    this.isFabExpanded.set(false);
  }

  // === ARTICLE EVENTS ===
  onArticleToggle(article: ArticleItemData): void {
    if (article.isChecked && article.pendingHideTimestamp) {
      this.undoArticleCompletion(article);
      return;
    }
    
    this.dataService.toggleItemChecked(this.listId, article.id).subscribe({
      next: (success) => { 
        if (success) {
          if (!article.isChecked) {
            // Article was just checked - start pending hide
            this.startPendingHide(article);
          }
          this.triggerChangeDetection();
          
          // Check for completion after a short delay to allow state to update
          setTimeout(() => {
            if (this.currentMode() === 'shopping') {
              this.setupCompletionMonitoring(); // Re-trigger monitoring
            }
          }, 150);
        }
      },
      error: (error) => console.error('Toggle error:', error)
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

  undoArticleCompletion(article: ArticleItemData): void {
    this.removePendingState(article.id);
    this.dataService.toggleItemChecked(this.listId, article.id).subscribe({
      next: (success) => success && console.log('Undo successful for:', article.name),
      error: (error) => console.error('Undo error:', error)
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
    this.searchQuery$.next(this.searchQuery.trim());
    this.searchDisambiguation$.next(null);
    
    this.clearAutoSwitchTimer();
    this.autoSwitchTimer = setTimeout(() => {
      this.checkAndAutoSwitchFilter();
    }, 705);
  }

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

  // === CELEBRATION ===
  closeCelebrationAnimation(): void {
    this.clearCelebrationTimeout();
    this.showCelebrationAnimation.set(false);
  }

  onGifError(event: any): void {
    event.target.style.display = 'none';
    const fallback = event.target.nextElementSibling;
    if (fallback) fallback.style.display = 'flex';
  }

  onGifLoad(event: any): void {
    console.log('GIF loaded successfully');
  }

  // === UTILITY METHODS FOR TEMPLATE ===
  getCurrentListColor(): string { 
    return this.listUtils.getCurrentListColor();
  }

  getContrastColor(hexColor: string): string {
    return this.listUtils.getContrastColor(hexColor);
  }

  shouldHideArticle = (article: ArticleItemData): boolean => {
    return this.currentShoppingFilter() === 'offen' && 
           article.isChecked && 
           !article.pendingHideTimestamp;
  };

  // === PRIVATE METHODS ===
  private initializeComponent(): void {
    const mode = this.route.snapshot.queryParamMap.get('mode');
    if (mode === 'edit') {
      this.currentMode.set('edit');
      this.editFilter$.next('alle'); // Ensure edit filter is set to 'alle' by default
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

    this.setupCompletionMonitoring();
  }

  private createUnifiedObservable(mode: ViewMode): Observable<DepartmentGroup[]> {
    const filter$ = mode === 'shopping' ? this.shoppingFilter$ : this.editFilter$;
    
    const articlesWithState$ = combineLatest([
      this.list$, 
      this.dataService.getArticles(), 
      this.searchQuery$.pipe(debounceTime(300), distinctUntilChanged()), 
      filter$,
      ...(mode === 'shopping' ? [this.pendingStates$] : [])
    ]).pipe(
      map(([list, articles, query, filter, ...rest]) => {
        if (!list) return [];
        
        const pendingStates = mode === 'shopping' ? (rest[0] || {}) : {};
        
        let filteredArticles = this.getFilteredArticles(list, articles, query, filter, mode, pendingStates);
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
    mode: ViewMode,
    pendingStates: Record<string, PendingState>
  ): ArticleItemData[] {
    let articles: ArticleItemData[];
    
    if (mode === 'shopping') {
      articles = allArticles
        .filter(article => list.articleIds.includes(article.id))
        .map(article => this.mapToArticleItemData(article, list, pendingStates));
      
      switch (filter as ShoppingFilter) {
        case 'offen': 
          articles = articles.filter(a => !a.isChecked || a.pendingHideTimestamp);
          break;
        case 'erledigt': 
          articles = articles.filter(a => a.isChecked);
          break;
      }
    } else {
      // EDIT MODE - Show ALL articles, not just those in the list
      articles = allArticles.map(article => this.mapToArticleItemData(article, list, {}));
      
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
    list: ShoppingList, 
    pendingStates: Record<string, PendingState>
  ): ArticleItemData {
    const pendingState = pendingStates[article.id] || {};
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
      pendingHideTimestamp: pendingState.pendingHideTimestamp,
      showUndoHint: pendingState.showUndoHint
    };
  }

  private groupArticlesByDepartment(articles: ArticleItemData[], list: ShoppingList): ArticleItemData[] {
    const departmentOrder = list.departmentOrder || DEFAULT_DEPARTMENT_ORDER;
    const departmentMap = new Map<string, ArticleItemData[]>();
    
    articles.forEach(article => {
      const deptId = article.departmentId || 'miscellaneous';
      if (!departmentMap.has(deptId)) departmentMap.set(deptId, []);
      departmentMap.get(deptId)!.push(article);
    });
    
    const orderedArticles: ArticleItemData[] = [];
    departmentOrder.forEach(deptId => {
      if (departmentMap.has(deptId)) {
        orderedArticles.push(...departmentMap.get(deptId)!);
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
      this.searchQuery$.pipe(debounceTime(500), distinctUntilChanged()),
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
    }
  }

  private setupCompletionMonitoring(): void {
    // Monitor the actual list articles (not filtered view)
    const listArticles$ = combineLatest([
      this.list$,
      this.dataService.getArticles()
    ]).pipe(
      map(([list, articles]) => {
        if (!list) return [];
        
        return articles
          .filter(article => list.articleIds.includes(article.id))
          .map(article => ({
            ...article,
            isChecked: list.itemStates[article.id]?.isChecked || false
          }));
      })
    );
  
    listArticles$.pipe(takeUntil(this.destroy$)).subscribe(articles => {
      // Only check in shopping mode
      if (this.currentMode() === 'shopping') {
        this.checkForCompletion(articles);
      }
    });
  }

  private checkForCompletion(articles: any[]): void {
    // Must be in shopping mode and have articles
    if (this.currentMode() !== 'shopping' || !articles?.length) {
      return;
    }
    
    // Count truly unchecked articles (not in pending state)
    const uncheckedArticles = articles.filter(article => !article.isChecked);
    
    console.log('🎯 Completion check:', { 
      mode: this.currentMode(),
      totalArticles: articles.length,
      uncheckedArticles: uncheckedArticles.length,
      allChecked: uncheckedArticles.length === 0
    });
    
    // Trigger celebration only when all articles are checked AND we're showing "offen" filter
    // This prevents celebration when switching to "erledigt" filter with no articles
    if (uncheckedArticles.length === 0 && 
        articles.length > 0 && 
        this.currentShoppingFilter() === 'offen') {
      console.log('🎉 All articles completed - triggering celebration!');
      this.triggerCelebrationAnimation();
    }
  }

  private triggerCelebrationAnimation(): void {
    // Double-check conditions before showing animation
    if (this.currentMode() !== 'shopping' || 
        this.currentShoppingFilter() !== 'offen' ||
        this.showCelebrationAnimation()) {
      console.log('❌ Celebration blocked:', {
        mode: this.currentMode(),
        filter: this.currentShoppingFilter(),
        alreadyShowing: this.showCelebrationAnimation()
      });
      return;
    }
    
    console.log('🎉 Showing celebration animation');
    this.showCelebrationAnimation.set(true);
    this.cdr.detectChanges();
    
    this.celebrationTimeout = setTimeout(() => {
      console.log('🎉 Auto-closing celebration animation');
      this.showCelebrationAnimation.set(false);
      this.cdr.detectChanges();
    }, 3000);
  }

  private checkAndAutoSwitchFilter(): void {
    if (this.currentMode() !== 'shopping' || this.currentShoppingFilter() === 'alle' || !this.searchQuery.trim()) {
      return;
    }

    this.departmentGroups$.pipe(take(1)).subscribe(groups => {
      const articles = groups.flatMap(g => g.articles);
      if (articles.length === 0) {
        this.setShoppingFilter('alle');
        this.snackBar.open('Filter auf Alle gestellt', '', { 
          duration: 400,
          verticalPosition: 'bottom'
        });
        
        setTimeout(() => {
          this.handleNoSearchResults(this.searchQuery.trim(), []);
        }, 100);
      }
    });
  }

  private clearSearch(): void {
    this.searchQuery = '';
    this.searchQuery$.next('');
    this.searchDisambiguation$.next(null);
  }

  private startPendingHide(article: ArticleItemData): void {
    const now = Date.now();
    const hideTime = now + this.HIDE_DELAY_MS;
    
    const currentStates = this.pendingStates$.value;
    this.pendingStates$.next({
      ...currentStates,
      [article.id]: {
        pendingHideTimestamp: hideTime,
        showUndoHint: true
      }
    });
    
    this.clearTimeoutsForArticle(article.id);
    
    const completeTimeout = setTimeout(() => {
      this.removePendingState(article.id);
    }, this.HIDE_DELAY_MS);
    
    this.undoHintTimeouts.set(article.id, completeTimeout);
  }

  private removePendingState(articleId: string): void {
    const currentStates = this.pendingStates$.value;
    const { [articleId]: removed, ...remaining } = currentStates;
    
    this.pendingStates$.next(remaining);
    this.clearTimeoutsForArticle(articleId);
  }

  private clearTimeoutsForArticle(articleId: string): void {
    const timeout = this.undoHintTimeouts.get(articleId);
    if (timeout) {
      clearTimeout(timeout);
      this.undoHintTimeouts.delete(articleId);
    }
  }

  private clearAutoSwitchTimer(): void {
    if (this.autoSwitchTimer) {
      clearTimeout(this.autoSwitchTimer);
    }
  }

  private clearCelebrationTimeout(): void {
    if (this.celebrationTimeout) {
      clearTimeout(this.celebrationTimeout);
      this.celebrationTimeout = undefined;
    }
  }

  private triggerChangeDetection(): void {
    setTimeout(() => this.cdr.detectChanges(), 100);
  }

  private cleanup(): void {
    this.undoHintTimeouts.forEach(timeout => clearTimeout(timeout));
    this.undoHintTimeouts.clear();
    
    this.clearCelebrationTimeout();
    this.clearAutoSwitchTimer();
    
    this.destroy$.next();
    this.destroy$.complete();
    this.pendingStates$.complete();
    this.searchQuery$.complete();
    this.shoppingFilter$.complete();
    this.editFilter$.complete();

    const currentUrl = this.router.url;
    if (!currentUrl.includes('/lists/') || currentUrl === '/lists') {
      this.listUtils.resetToDefaultTheme();
    }
  }
}