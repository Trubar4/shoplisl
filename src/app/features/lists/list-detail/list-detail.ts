import { Component, OnInit, ChangeDetectorRef, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { map, debounceTime, distinctUntilChanged, take, takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';

// Import new sub-components
import { SearchDisambiguationComponent } from '../../../shared/components/search-disambiguation/search-disambiguation.component';
import { ArticleListComponent } from '../../../shared/components/article-list/article-list.component';
import { FilterFabComponent } from '../../../shared/components/filter-fab/filter-fab.component';
import { type ArticleItem } from '../../../shared/components/article-list/article-list.component';

// Models and Services
import { ShoppingList, Article, Department } from '../../../core/models';
import { DataService } from '../../../core/services/data.service';
import { DepartmentService } from '../../../core/services/department.service';
import { DEFAULT_DEPARTMENT_ORDER } from '../../../core/models';
import { SimplifiedDisambiguationService } from '../../../core/services/ai/simplified-disambiguation.service';
import { DisambiguationOption } from '../../../core/services/ai/ai-models';

// Local interfaces
interface ArticleWithState extends Article {
  isChecked: boolean;
  isInList: boolean;
  pendingHideTimestamp?: number;
  showUndoHint?: boolean;
}

interface ArticleWithToggleAndAmount extends Article {
  isInList: boolean;
  listAmount?: string;
  isChecked: boolean;
}

interface DepartmentGroup {
  department: Department;
  articles: ArticleWithState[];
}

interface DepartmentGroupEdit {
  department: Department;
  articles: ArticleWithToggleAndAmount[];  
}

interface PendingState {
  pendingHideTimestamp?: number;
  showUndoHint?: boolean;
}

type ViewMode = 'shopping' | 'edit';
type ShoppingFilter = 'offen' | 'erledigt' | 'alle';
type EditFilter = 'gelistet' | 'fehlend' | 'alle';

/**
 * ListDetailComponent - Main component for managing shopping list details
 * 
 * Features:
 * - Shopping mode: Check off items while shopping
 * - Edit mode: Add/remove articles from list
 * - Search with AI disambiguation
 * - Department-based organization
 * - Progressive completion animations
 * 
 * @example
 * Navigate to: /lists/:id?mode=shopping|edit
 */
@Component({
  selector: 'app-list-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatToolbarModule, MatListModule, MatIconModule, 
    MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, 
    MatSnackBarModule, MatSlideToggleModule, MatTooltipModule, MatDialogModule,
    SearchDisambiguationComponent,
    ArticleListComponent,
    FilterFabComponent
  ],
  templateUrl: './list-detail.html',
  styleUrls: ['./list-detail.scss']
})
export class ListDetailComponent implements OnInit, OnDestroy {
  
  // === SIGNALS & REACTIVE STATE ===
  currentMode = signal<ViewMode>('shopping');
  currentShoppingFilter = signal<ShoppingFilter>('offen');
  currentEditFilter = signal<EditFilter>('alle');
  isLoading = signal<boolean>(true);
  isFabExpanded = signal<boolean>(false);
  showCelebrationAnimation = signal<boolean>(false);
  
  // === OBSERVABLES ===
  private readonly destroy$ = new Subject<void>();
  private readonly listId: string;
  
  readonly list$: Observable<ShoppingList | undefined>;
  readonly departmentGroups$: Observable<DepartmentGroup[]>;
  readonly departmentGroupsEdit$: Observable<DepartmentGroupEdit[]>;
  readonly searchDisambiguation$ = new BehaviorSubject<any>(null);
  
  // === REACTIVE STATE ===
  private readonly shoppingFilter$ = new BehaviorSubject<ShoppingFilter>('offen');
  private readonly editFilter$ = new BehaviorSubject<EditFilter>('alle');
  private readonly searchQuery$ = new BehaviorSubject<string>('');
  private readonly pendingStates$ = new BehaviorSubject<Record<string, PendingState>>({});
  
  // === COMPONENT STATE ===
  searchQuery = '';
  currentList: ShoppingList | null = null;
  
  // === PRIVATE PROPERTIES ===
  private departmentIconFilterCache = '';
  private readonly undoHintTimeouts = new Map<string, any>();
  private celebrationTimeout?: any;
  private autoSwitchTimer?: any;
  private readonly HIDE_DELAY_MS = 5000;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly dataService: DataService,
    private readonly departmentService: DepartmentService,
    private readonly snackBar: MatSnackBar,
    private readonly cdr: ChangeDetectorRef,
    private readonly dialog: MatDialog,
    private readonly disambiguationService: SimplifiedDisambiguationService
  ) {
    this.showCelebrationAnimation.set(false);
    this.isLoading.set(false);
    this.listId = this.route.snapshot.paramMap.get('id') || '';

    // Initialize list observable
    this.list$ = this.dataService.getLists().pipe(
      map(lists => lists.find(list => list.id === this.listId)),
      takeUntil(this.destroy$)
    );

    // Setup observables
    this.departmentGroups$ = this.createShoppingModeObservable();
    this.departmentGroups$.subscribe(groups => {
      console.log('DepartmentGroups$ emitted:', groups?.length || 0, 'groups');
      groups?.forEach(g => console.log('  -', g.department.nameGerman, ':', g.articles.length, 'articles'));
    });

    this.departmentGroupsEdit$ = this.createEditModeObservable();
  }

  ngOnInit(): void {
    console.log('Current mode value:', this.currentMode());
    console.log('Is loading value:', this.isLoading());
    this.showCelebrationAnimation.set(false);
    
    this.initializeComponent();
    this.setupSubscriptions();
    this.setupSearchDisambiguation();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  // === PUBLIC METHODS ===

  /**
   * Toggles article completion state in shopping mode
   * Handles undo functionality and completion celebrations
   */
  onArticleToggle(article: ArticleItem): void {
    const articleWithState = article as ArticleWithState;
    if (article.isChecked && article.pendingHideTimestamp) {
      this.undoArticleCompletion(articleWithState);
      return;
    }
    
    this.dataService.toggleItemChecked(this.listId, article.id).subscribe({
      next: (success) => { 
        if (success && !article.isChecked) {
          this.startPendingHide(article);
        }
        this.triggerChangeDetection();
      },
      error: (error) => console.error('Toggle error:', error)
    });
  }

  /**
   * Handles search query changes with debouncing and auto-filter switching
   */
  onSearchQueryChange(): void { 
    this.searchQuery$.next(this.searchQuery.trim());
    this.searchDisambiguation$.next(null);
    
    this.clearAutoSwitchTimer();
    this.autoSwitchTimer = setTimeout(() => {
      this.checkAndAutoSwitchFilter();
    }, 705);
  }

  /**
   * Navigation methods
   */
  onBack(): void {
    this.resetToDefaultTheme();
    this.router.navigate(['/lists']);
  }
  
  switchToShoppingMode(): void { 
    this.currentMode.set('shopping');
    this.cdr.detectChanges();
  }
  
  switchToEditMode(): void { 
    this.currentMode.set('edit');
    this.editFilter$.next(this.currentEditFilter());
    this.cdr.detectChanges();
  }

  /**
   * Filter management - Updated to handle new component events
   */
  onFilterChange(data: { mode: ViewMode; filter: ShoppingFilter | EditFilter }): void {
    if (data.mode === 'shopping') {
      this.setShoppingFilter(data.filter as ShoppingFilter);
    } else {
      this.setEditFilter(data.filter as EditFilter);
    }
  }

  setShoppingFilter(filter: ShoppingFilter): void {
    this.currentShoppingFilter.set(filter);
    this.shoppingFilter$.next(filter);
    this.isFabExpanded.set(false);
    this.searchDisambiguation$.next(null);
    this.cdr.detectChanges();
  }
  
  setEditFilter(filter: EditFilter): void {
    this.currentEditFilter.set(filter);
    this.editFilter$.next(filter);
    this.isFabExpanded.set(false);
    this.cdr.detectChanges();
  }

  /**
   * FAB controls
   */
  toggleFab(): void { 
    this.isFabExpanded.update(expanded => !expanded);
  }
  
  closeFab(): void { 
    this.isFabExpanded.set(false);
  }

  /**
   * Article management in edit mode
   */
  onToggleArticleInList(article: any): void {
    const action = article.isInList 
      ? this.dataService.removeArticleFromList(this.listId, article.id)
      : this.dataService.addArticleToList(this.listId, article.id);
    
    action.subscribe({
      next: (success) => {
        if (success) {
          this.snackBar.open(
            `${article.name} ${article.isInList ? 'entfernt' : 'hinzugefügt'}`, 
            '', 
            { duration: 1000 }
          );
          this.triggerChangeDetection();
        }
      },
      error: (error) => console.error('Toggle list error:', error)
    });
  }

  /**
   * Amount editing - Updated to handle new component event structure
   */
  onEditAmountFromList(data: { article: any; event?: Event }): void {
    if (data.event) {
      data.event.stopPropagation();
    }
    this.onEditAmount(data.article);
  }

  onEditAmount(article: any): void {
    const currentAmount = article.listAmount || article.amount || '';
    const newAmount = prompt(`Menge für ${article.name}:`, currentAmount);
    
    if (newAmount !== null) {
      this.dataService.updateListItemAmount(this.listId, article.id, newAmount.trim()).subscribe({
        next: () => this.snackBar.open('Menge aktualisiert', '', { duration: 1000 }),
        error: (error) => console.error('Error updating amount:', error)
      });
    }
  }

  onEditAmountInShopping(article: any, event: Event): void {
    event.stopPropagation();
    this.onEditAmount(article);
  }

  /**
   * List management actions
   */
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
          '', 
          { duration: 1500 }
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
            '', 
            { duration: 1500 }
          );
          if (success) this.router.navigate(['/lists']);
        },
        error: () => this.snackBar.open('Fehler beim Löschen', '', { duration: 2000 })
      });
    }
  }

  /**
   * Navigation helpers
   */
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

  onArticleInfo(article: any): void {
    if (article?.id) {
      this.router.navigate(['/articles/edit', article.id], {
        queryParams: { returnTo: `/lists/${this.listId}?mode=shopping` }
      });
    }
  }

  onDepartmentSort(): void {
    if (!this.currentList) return;
    this.router.navigate(['/lists', this.listId, 'departments']);
  }

  /**
   * Search disambiguation handlers
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

  /**
   * Celebration animation controls
   */
  closeCelebrationAnimation(): void {
    this.clearCelebrationTimeout();
    this.showCelebrationAnimation.set(false);
    this.cdr.detectChanges();
  }

  onGifError(event: any): void {
    console.error('GIF failed to load:', event.target.src);
    event.target.style.display = 'none';
    
    const fallback = event.target.nextElementSibling;
    if (fallback) {
      fallback.style.display = 'flex';
    }
  }

  onGifLoad(event: any): void {
    console.log('GIF loaded successfully:', event.target.src);
  }

  /**
   * Utility methods for template
   */
  getCurrentListColor(): string { 
    return this.currentList?.color || '#1a9edb'; 
  }

  getContrastColor(hexColor: string): string {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#333333' : '#ffffff';
  }

  getLightColor(hexColor: string): string {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const lightR = Math.round(r + (255 - r) * 0.7);
    const lightG = Math.round(g + (255 - g) * 0.7);
    const lightB = Math.round(b + (255 - b) * 0.7);
    return `rgb(${lightR}, ${lightG}, ${lightB})`;
  }

  getDarkColor(hexColor: string): string {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    return `rgb(${Math.round(r * 0.8)}, ${Math.round(g * 0.8)}, ${Math.round(b * 0.8)})`;
  }

  getDepartmentIconPath(departmentId: string): string {
    return this.departmentService.getDepartmentIconPath(departmentId);
  }

  getDepartmentIconFilter(): string {
    if (this.departmentIconFilterCache) return this.departmentIconFilterCache;
    this.departmentIconFilterCache = `hue-rotate(${this.getHueRotation()}deg) saturate(1.2)`;
    return this.departmentIconFilterCache;
  }

  getDepartmentNameGerman(departmentId: string): string {
    return this.departmentService.getDepartmentName(departmentId, 'german');
  }

  getArticleAmount(article: any): string {
    try {
      return this.currentList?.itemStates[article.id]?.amount || article.amount || '';
    } catch { 
      return article?.amount || ''; 
    }
  }

  shouldHideArticle(article: ArticleItem): boolean {
    const articleWithState = article as ArticleWithState;
    return this.currentShoppingFilter() === 'offen' && 
           articleWithState.isChecked && 
           !articleWithState.pendingHideTimestamp;
  }

  /**
   * Undo completion for articles in pending state
   */
  undoArticleCompletion(article: ArticleItem): void {
    const articleWithState = article as ArticleWithState;
    this.removePendingState(articleWithState.id);
        
    this.dataService.toggleItemChecked(this.listId, article.id).subscribe({
      next: (success) => {
        if (success) {
          console.log('Undo successful for:', article.name);
        }
      },
      error: (error) => console.error('Undo error:', error)
    });
  }

  // === PRIVATE METHODS ===

  private initializeComponent(): void {
    const mode = this.route.snapshot.queryParamMap.get('mode');
    if (mode === 'edit') {
      this.currentMode.set('edit');
    }
    
    this.editFilter$.next('alle');
  }

  private setupSubscriptions(): void {
    // List subscription with theme management
    this.list$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (list) => {
        console.log('List loaded:', list);
        this.currentList = list || null;
        this.isLoading.set(false); // <-- Make sure this line exists
        this.departmentIconFilterCache = '';
        
        if (list?.color) {
          this.updateThemeColors(list.color);
        } else {
          this.updateThemeColors('#1a9edb');
        }
        
        if (!list && !this.isLoading()) {
          this.router.navigate(['/lists']);
        }
        this.isLoading.set(false); // Make sure this runs
      },
      error: (error) => {
        console.error('Error loading list:', error);
        this.isLoading.set(false); // Make sure this runs on error too
        this.router.navigate(['/lists']);
      }
    });

    // Completion monitoring
    this.setupCompletionMonitoring();
  }

  private createShoppingModeObservable(): Observable<DepartmentGroup[]> {
    const listArticles$ = combineLatest([
      this.list$, 
      this.dataService.getArticles(), 
      this.searchQuery$.pipe(debounceTime(300), distinctUntilChanged()), 
      this.shoppingFilter$,
      this.pendingStates$
    ]).pipe(
      map(([list, articles, query, filter, pendingStates]) => {
        console.log('🔍 Shopping mode observable:', { list: list?.name, articlesCount: articles?.length, query, filter });
        
        if (!list) return [];
        
        let filteredArticles = articles
          .filter(article => list.articleIds.includes(article.id))
          .map(article => {
            const pendingState = pendingStates[article.id] || {};
            
            return {
              ...article,
              isChecked: list.itemStates[article.id]?.isChecked || false,
              isInList: true,
              pendingHideTimestamp: pendingState.pendingHideTimestamp,
              showUndoHint: pendingState.showUndoHint
            } as ArticleWithState;
          });
  
        console.log('🔍 Filtered articles:', filteredArticles.length);
       
        if (query?.trim()) {
          filteredArticles = filteredArticles.filter(article =>
            article.name.toLowerCase().includes(query.toLowerCase()) ||
            (article.notes && article.notes.toLowerCase().includes(query.toLowerCase()))
          );
        }

        filteredArticles = filteredArticles.sort((a, b) => a.name.localeCompare(b.name));

        switch (filter) {
          case 'offen': 
            return filteredArticles.filter(article => 
              !article.isChecked || 
              (article.isChecked && article.pendingHideTimestamp)
            );
          case 'erledigt': 
            return filteredArticles.filter(article => article.isChecked);
          default: 
            return filteredArticles;
        }
      })
    );

    return combineLatest([
      listArticles$, 
      this.departmentService.getDepartments(), 
      this.list$
    ]).pipe(
      map(([articles, departments, list]) => {
        return this.groupArticlesByDepartment(articles, departments, list);
      })
    );
  }

  private createEditModeObservable(): Observable<DepartmentGroupEdit[]> {
    const allArticlesWithState$ = combineLatest([
      this.list$, 
      this.dataService.getArticles(), 
      this.searchQuery$.pipe(debounceTime(300), distinctUntilChanged()), 
      this.editFilter$
    ]).pipe(
      map(([list, allArticles, query, filter]) => {
        if (!list) return [];
        
        let filtered = query?.trim() 
          ? allArticles.filter(article => article.name.toLowerCase().includes(query.toLowerCase()))
          : allArticles;
        
        let articlesWithState = filtered
          .map(article => ({
            ...article,
            isInList: list.articleIds.includes(article.id),
            listAmount: list.itemStates[article.id]?.amount || article.amount || '',
            isChecked: list.itemStates[article.id]?.isChecked || false  // Add this line
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
  
        switch (filter) {
          case 'gelistet': return articlesWithState.filter(article => article.isInList);
          case 'fehlend': return articlesWithState.filter(article => !article.isInList);
          default: return articlesWithState;
        }
      })
    );

    return combineLatest([
      allArticlesWithState$, 
      this.departmentService.getDepartments(), 
      this.list$
    ]).pipe(
      map(([articles, departments, list]) => {
        return this.groupArticlesByDepartmentEdit(articles, departments, list);
      })
    );
  }

  private groupArticlesByDepartment(
    articles: ArticleWithState[], 
    departments: Department[], 
    list: ShoppingList | undefined
  ): DepartmentGroup[] {
    if (!list) return [];
    
    const departmentOrder = list.departmentOrder || DEFAULT_DEPARTMENT_ORDER;
    const departmentMap = new Map<string, ArticleWithState[]>();
    
    articles.forEach(article => {
      const deptId = article.departmentId || 'miscellaneous';
      if (!departmentMap.has(deptId)) departmentMap.set(deptId, []);
      departmentMap.get(deptId)!.push(article);
    });
    
    const groups: DepartmentGroup[] = [];
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
          articles: departmentMap.get(deptId)!.sort((a, b) => a.name.localeCompare(b.name))
        });
      }
    });
    return groups;
  }

  private groupArticlesByDepartmentEdit(
    articles: ArticleWithToggleAndAmount[], 
    departments: Department[], 
    list: ShoppingList | undefined
  ): DepartmentGroupEdit[] {
    if (!list) return [];
    
    const departmentOrder = list.departmentOrder || DEFAULT_DEPARTMENT_ORDER;
    const departmentMap = new Map<string, ArticleWithToggleAndAmount[]>();
    
    articles.forEach(article => {
      const deptId = article.departmentId || 'miscellaneous';
      if (!departmentMap.has(deptId)) departmentMap.set(deptId, []);
      departmentMap.get(deptId)!.push(article);
    });
    
    const groups: DepartmentGroupEdit[] = [];
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
          articles: departmentMap.get(deptId)!.sort((a, b) => a.name.localeCompare(b.name))
        });
      }
    });
    return groups;
  }

  private setupSearchDisambiguation(): void {
    combineLatest([
      this.searchQuery$.pipe(debounceTime(500), distinctUntilChanged()),
      this.createShoppingModeObservable().pipe(map(groups => groups.flatMap(g => g.articles))),
      this.createEditModeObservable().pipe(map(groups => groups.flatMap(g => g.articles)))
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

  private async handleNoSearchResults(query: string, allArticles: any[]): Promise<void> {
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
      setTimeout(() => {
        this.searchDisambiguation$.next(null);
      }, 100);
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

    const allListArticles$ = combineLatest([
      this.list$,
      this.dataService.getArticles()
    ]).pipe(
      map(([list, articles]) => {
        if (!list) return [];
        
        return articles
          .filter(article => list.articleIds.includes(article.id))
          .map(article => ({
            ...article,
            isChecked: list.itemStates[article.id]?.isChecked || false,
            isInList: true
          }));
      })
    );
  
    allListArticles$.pipe(takeUntil(this.destroy$)).subscribe(articles => {
      this.checkForCompletion(articles);
    });
  }

  private checkForCompletion(articles: ArticleWithState[]): void {

    if (!articles?.length || this.currentMode() !== 'shopping') return;
    
    const uncheckedCount = articles.filter(article => !article.isChecked).length;
    const totalCount = articles.length;
  
    if (uncheckedCount === 0 && totalCount > 0) {
      this.triggerCelebrationAnimation();
    }
  }

  private triggerCelebrationAnimation(): void {
    if (this.showCelebrationAnimation()) return;
    
    this.showCelebrationAnimation.set(true);
    this.cdr.detectChanges();
    
    this.celebrationTimeout = setTimeout(() => {
      this.showCelebrationAnimation.set(false);
      this.cdr.detectChanges();
    }, 3000);
  }

  private updateThemeColors(color: string): void {
    const root = document.documentElement;
    root.style.setProperty('--list-primary-color', color);
    root.style.setProperty('--list-contrast-color', this.getContrastColor(color));
    root.style.setProperty('--list-light-color', this.getLightColor(color));
    root.style.setProperty('--list-dark-color', this.getDarkColor(color));
    this.updateThemeColorMeta(color);
  }

  private updateThemeColorMeta(color: string): void {
    let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.name = 'theme-color';
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.content = color;
    document.documentElement.style.backgroundColor = color;
  }

  private resetToDefaultTheme(): void {
    const defaultColor = '#1a9edb';
    const root = document.documentElement;
    
    root.style.setProperty('--list-primary-color', defaultColor);
    root.style.setProperty('--list-contrast-color', 'white');
    root.style.setProperty('--list-light-color', '#a8d4f0');
    root.style.setProperty('--list-dark-color', '#1976d2');
    root.style.setProperty('--list-primary-color-rgb', '26, 158, 219');
    
    this.updateThemeColorMeta(defaultColor);
    document.documentElement.style.backgroundColor = defaultColor;
  }

  private getHueRotation(): number {
    const color = this.getCurrentListColor();
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return Math.floor((r + g + b) / 3 / 255 * 360);
  }

  private checkAndAutoSwitchFilter(): void {
    if (this.currentMode() !== 'shopping' || this.currentShoppingFilter() === 'alle' || !this.searchQuery.trim()) {
      return;
    }

    const listArticles$ = this.createShoppingModeObservable().pipe(
      map(groups => groups.flatMap(g => g.articles))
    );

    listArticles$.pipe(take(1)).subscribe(articles => {
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

  private startPendingHide(article: ArticleWithState): void {
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

  private triggerChangeDetection(): void {
    setTimeout(() => this.cdr.detectChanges(), 100);
  }

  private cleanup(): void {
    // Clean up timers
    this.undoHintTimeouts.forEach(timeout => clearTimeout(timeout));
    this.undoHintTimeouts.clear();
    
    this.clearCelebrationTimeout();
    this.clearAutoSwitchTimer();
    
    // Complete subjects
    this.destroy$.next();
    this.destroy$.complete();
    this.pendingStates$.complete();
    this.searchQuery$.complete();
    this.shoppingFilter$.complete();
    this.editFilter$.complete();

    // Reset theme if not navigating to another list
    const currentUrl = this.router.url;
    if (!currentUrl.includes('/lists/') || currentUrl === '/lists') {
      this.resetToDefaultTheme();
      
      setTimeout(() => {
        this.updateThemeColorMeta('#1a9edb');
      }, 0);
    }
  }
}