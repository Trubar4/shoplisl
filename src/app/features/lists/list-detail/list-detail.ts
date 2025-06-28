import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { map, debounceTime, distinctUntilChanged, take } from 'rxjs/operators';
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
import { ShoppingList, Article, Department } from '../../../core/models';
import { DataService } from '../../../core/services/data';
import { DepartmentService } from '../../../core/services/department.service';
import { DEFAULT_DEPARTMENT_ORDER } from '../../../core/models';

type ViewMode = 'shopping' | 'edit';
type ShoppingFilter = 'alle' | 'offen' | 'erledigt';
type EditFilter = 'alle' | 'gelistet' | 'fehlend';

interface ArticleWithState extends Article {
  isChecked: boolean;
  isInList: boolean;
}

interface ArticleWithToggleAndAmount extends Article {
  isInList: boolean;
  listAmount?: string;
}

interface DepartmentGroup {
  department: Department;
  articles: ArticleWithState[];
}

interface DepartmentGroupEdit {
  department: Department;
  articles: ArticleWithToggleAndAmount[];
}

@Component({
  selector: 'app-list-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatToolbarModule, MatListModule, MatIconModule, 
    MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, 
    MatSnackBarModule, MatSlideToggleModule, MatTooltipModule, MatDialogModule
  ],
  templateUrl: './list-detail.html',
  styleUrls: ['./list-detail.scss']
})
export class ListDetailComponent implements OnInit, OnDestroy {
  listId: string = '';
  list$!: Observable<ShoppingList | undefined>;
  departmentGroups$!: Observable<DepartmentGroup[]>;
  departmentGroupsEdit$!: Observable<DepartmentGroupEdit[]>;
  
  currentMode: ViewMode = 'shopping';
  currentShoppingFilter: ShoppingFilter = 'offen';
  currentEditFilter: EditFilter = 'alle';
  private shoppingFilter$ = new BehaviorSubject<ShoppingFilter>('offen');
  private editFilter$ = new BehaviorSubject<EditFilter>('alle');
  private allListArticles$!: Observable<ArticleWithState[]>;
  
  isFabExpanded = false;
  listArticles$!: Observable<ArticleWithState[]>;
  allArticlesWithState$!: Observable<ArticleWithToggleAndAmount[]>;
  searchQuery$ = new BehaviorSubject<string>('');
  searchQuery = '';
  
  isLoading = true;
  currentList: ShoppingList | null = null;
  private departmentIconFilterCache: string = '';

  // Animation properties
  showCelebrationAnimation = false;
  private previousCheckedCount = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dataService: DataService,
    private departmentService: DepartmentService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) {
    this.listId = this.route.snapshot.paramMap.get('id') || '';
    
    this.list$ = this.dataService.getLists().pipe(
      map(lists => lists.find(list => list.id === this.listId))
    );

    // Setup completion monitoring
    this.setupCompletionMonitoring();
    
    this.listArticles$ = combineLatest([
      this.list$, this.dataService.getArticles(), 
      this.searchQuery$.pipe(debounceTime(300), distinctUntilChanged()), 
      this.shoppingFilter$
    ]).pipe(
      map(([list, articles, query, filter]) => {
        if (!list) return [];
        
        let filteredArticles = articles
          .filter(article => list.articleIds.includes(article.id))
          .map(article => ({
            ...article,
            isChecked: list.itemStates[article.id]?.isChecked || false,
            isInList: true
          }));

        if (query?.trim()) {
          filteredArticles = filteredArticles.filter(article =>
            article.name.toLowerCase().includes(query.toLowerCase()) ||
            (article.notes && article.notes.toLowerCase().includes(query.toLowerCase()))
          );
        }

        filteredArticles = filteredArticles.sort((a, b) => a.name.localeCompare(b.name));

        switch (filter) {
          case 'offen': return filteredArticles.filter(article => !article.isChecked);
          case 'erledigt': return filteredArticles.filter(article => article.isChecked);
          default: return filteredArticles;
        }
      })
    );

    this.allArticlesWithState$ = combineLatest([
      this.list$, this.dataService.getArticles(), 
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
            listAmount: list.itemStates[article.id]?.amount || article.amount || ''
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        switch (filter) {
          case 'gelistet': return articlesWithState.filter(article => article.isInList);
          case 'fehlend': return articlesWithState.filter(article => !article.isInList);
          default: return articlesWithState;
        }
      })
    );

  }

  ngOnInit(): void {
    const mode = this.route.snapshot.queryParamMap.get('mode');
    if (mode === 'edit') this.currentMode = 'edit';
    
    this.setupDepartmentGroups();

    this.setupCompletionMonitoring();
    
    this.list$.subscribe({
      next: (list) => {
        this.currentList = list || null;
        this.departmentIconFilterCache = '';
        
        if (list?.color) {
          this.updateThemeColors(list.color);
        } else {
          this.updateThemeColors('#1a9edb');
        }
        
        if (!list && !this.isLoading) {
          this.router.navigate(['/lists']);
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading list:', error);
        this.isLoading = false;
        this.router.navigate(['/lists']);
      }
    });
  }

  ngOnDestroy(): void {
    this.updateThemeColorMeta('#1a9edb');
  }

  private setupDepartmentGroups(): void {
    this.departmentGroups$ = combineLatest([
      this.listArticles$, this.departmentService.getDepartments(), this.list$
    ]).pipe(
      map(([articles, departments, list]) => {
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
              id: 'miscellaneous', nameGerman: 'Sonstiges', nameEnglish: 'Miscellaneous',
              icon: 'Help-Chat-2--Streamline-Core-Remix.png'
            };
            groups.push({
              department,
              articles: departmentMap.get(deptId)!.sort((a, b) => a.name.localeCompare(b.name))
            });
          }
        });
        return groups;
      })
    );

    this.departmentGroupsEdit$ = combineLatest([
      this.allArticlesWithState$, this.departmentService.getDepartments(), this.list$
    ]).pipe(
      map(([articles, departments, list]) => {
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
              id: 'miscellaneous', nameGerman: 'Sonstiges', nameEnglish: 'Miscellaneous',
              icon: 'Help-Chat-2--Streamline-Core-Remix.png'
            };
            groups.push({
              department,
              articles: departmentMap.get(deptId)!.sort((a, b) => a.name.localeCompare(b.name))
            });
          }
        });
        return groups;
      })
    );
  }

  private checkForCompletion(articles: ArticleWithState[]): void {
    if (!articles?.length) return;
  
    const uncheckedCount = articles.filter(article => !article.isChecked).length;
    const totalCount = articles.length;
  
    console.log('🔍 Checking completion:', { uncheckedCount, totalCount });
  
    // Simple logic: if no unchecked items and we have items
    if (uncheckedCount === 0 && totalCount > 0) {
      console.log('🎉 List completed! Showing celebration');
      this.triggerCelebrationAnimation();
    }
  }

  private triggerCelebrationAnimation(): void {
    if (this.showCelebrationAnimation) {
      console.log('🔍 Animation already showing, skipping');
      return;
    }
    
    console.log('🎉 STARTING CELEBRATION ANIMATION!');
    this.showCelebrationAnimation = true;
    this.cdr.detectChanges();
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      console.log('🎉 Ending celebration animation');
      this.showCelebrationAnimation = false;
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

  // Public methods
  onBack(): void { this.router.navigate(['/lists']); }
  
  switchToShoppingMode(): void { 
    this.currentMode = 'shopping'; 
    this.searchQuery = ''; 
    this.searchQuery$.next(''); 
  }
  
  switchToEditMode(): void { 
    this.currentMode = 'edit'; 
    this.searchQuery = ''; 
    this.searchQuery$.next(''); 
  }

  getCurrentListColor(): string { return this.currentList?.color || '#1a9edb'; }

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

  private getHueRotation(): number {
    const color = this.getCurrentListColor();
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return Math.floor((r + g + b) / 3 / 255 * 360);
  }

  onArticleToggle(article: any): void {
    console.log('🔍 Toggling article:', article.name);
    
    this.dataService.toggleItemChecked(this.listId, article.id).subscribe({
      next: (success) => { 
        if (success) {
          console.log('✅ Toggle successful, checking for completion...');
          this.triggerChangeDetection();
          
          // Use multiple methods to ensure detection
          setTimeout(() => {
            console.log('🔍 Running completion checks...');
            
            // Method 1: Unfiltered articles
            this.checkCompletionAfterToggle();
            
            // Method 2: Direct list state check (fallback)
            setTimeout(() => {
              this.checkCompletionDirectly();
            }, 100);
            
          }, 200);
        }
      },
      error: (error) => console.error('❌ Toggle error:', error)
    });
  }

  onGifError(event: any): void {
    console.error('❌ GIF failed to load!');
    console.error('❌ Attempted path:', event.target.src);
    console.error('❌ Error details:', event);
    
    // Hide broken GIF
    event.target.style.display = 'none';
    
    // Show fallback
    const fallback = event.target.nextElementSibling;
    if (fallback) {
      fallback.style.display = 'flex';
      console.log('✅ Showing emoji fallback');
    }
  }

  onToggleArticleInList(article: any): void {
    const action = article.isInList 
      ? this.dataService.removeArticleFromList(this.listId, article.id)
      : this.dataService.addArticleToList(this.listId, article.id);
    
    action.subscribe({
      next: (success) => {
        if (success) {
          this.snackBar.open(`${article.name} ${article.isInList ? 'entfernt' : 'hinzugefügt'}`, '', { duration: 1000 });
          this.triggerChangeDetection();
        }
      },
      error: (error) => console.error('Toggle list error:', error)
    });
  }

  onSearchQueryChange(): void { this.searchQuery$.next(this.searchQuery.trim()); }

  onCreateNewArticle(): void {
    const queryParams: any = { 
      returnTo: `/lists/${this.listId}?mode=edit`,
      listId: this.listId
    };
    if (this.searchQuery.trim()) queryParams.name = this.searchQuery.trim();
    this.router.navigate(['/articles/add'], { queryParams });
  }

  onArticleInfo(article: any): void {
    if (article?.id) {
      this.router.navigate(['/articles/edit', article.id], {
        queryParams: { returnTo: `/lists/${this.listId}?mode=shopping` }
      });
    }
  }

  getArticleAmount(article: any): string {
    try {
      return this.currentList?.itemStates[article.id]?.amount || article.amount || '';
    } catch { return article?.amount || ''; }
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

  setShoppingFilter(filter: ShoppingFilter): void {
    this.currentShoppingFilter = filter;
    this.shoppingFilter$.next(filter);
    this.isFabExpanded = false;
    this.cdr.detectChanges();
  }

  setEditFilter(filter: EditFilter): void {
    this.currentEditFilter = filter;
    this.editFilter$.next(filter);
    this.isFabExpanded = false;
    this.cdr.detectChanges();
  }

  toggleFab(): void { this.isFabExpanded = !this.isFabExpanded; }
  closeFab(): void { this.isFabExpanded = false; }

  onClearAllItems(): void {
    if (!this.currentList) return;
    const count = this.currentList.articleIds.length;
    if (count === 0) {
      this.snackBar.open('Liste ist bereits leer', '', { duration: 1500 });
      return;
    }
    if (confirm(`Alle ${count} Artikel von der Liste entfernen?`)) {
      this.dataService.clearAllItemsFromList(this.listId).subscribe({
        next: (success) => this.snackBar.open(success ? 'Liste geleert' : 'Fehler beim Leeren der Liste', '', { duration: 1500 }),
        error: () => this.snackBar.open('Fehler beim Leeren der Liste', '', { duration: 2000 })
      });
    }
  }

  onEditList(): void {
    if (!this.currentList) return;
    this.router.navigate(['/lists/add'], {
      queryParams: { editId: this.listId, returnTo: `/lists/${this.listId}?mode=edit` }
    });
  }

  onDeleteList(): void {
    if (!this.currentList) return;
    if (confirm(`Liste "${this.currentList.name}" wirklich löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`)) {
      this.dataService.deleteList(this.listId).subscribe({
        next: (success) => {
          this.snackBar.open(success ? 'Liste gelöscht' : 'Fehler beim Löschen', '', { duration: 1500 });
          if (success) this.router.navigate(['/lists']);
        },
        error: () => this.snackBar.open('Fehler beim Löschen', '', { duration: 2000 })
      });
    }
  }

  onDepartmentSort(): void {
    if (!this.currentList) return;
    this.router.navigate(['/lists', this.listId, 'departments']);
  }

  testCelebrationAnimation(): void {
    console.log('🧪 MANUAL TEST: Triggering celebration animation');
    this.checkGifPath(); // Check if GIF works
    this.triggerCelebrationAnimation();
  }

  private setupCompletionMonitoring(): void {
    // Separate observable for completion checking - NO FILTER APPLIED
    this.allListArticles$ = combineLatest([
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
  }

  private triggerChangeDetection(): void {
    setTimeout(() => this.cdr.detectChanges(), 100);
  }

// GIF load success handler
onGifLoad(event: any): void {
  console.log('✅ GIF loaded successfully!');
  console.log('✅ GIF source:', event.target.src);
  console.log('✅ GIF dimensions:', event.target.naturalWidth + 'x' + event.target.naturalHeight);
}

// Enhanced GIF path checker
checkGifPath(): void {
  const gifPath = '/assets/animations/celebration.gif';
  console.log('🔍 Testing GIF path:', gifPath);
  
  const img = new Image();
  img.onload = () => console.log('✅ GIF loads successfully!');
  img.onerror = () => console.error('❌ GIF path is broken!');
  img.src = gifPath;
}

// Debug current list state
debugListState(): void {
  this.listArticles$.pipe(take(1)).subscribe(articles => {
    console.log('🔍 DEBUG: Current list state');
    console.log('🔍 Mode:', this.currentMode);
    console.log('🔍 Total articles:', articles.length);
    console.log('🔍 Articles breakdown:');
    articles.forEach(article => {
      console.log(`  - ${article.name}: ${article.isChecked ? '✅' : '❌'}`);
    });
    
    const unchecked = articles.filter(a => !a.isChecked).length;
    console.log('🔍 Unchecked count:', unchecked);
    console.log('🔍 Should celebrate:', unchecked === 0 && articles.length > 0);
  });
}

private checkCompletionAfterToggle(): void {
  if (this.currentMode !== 'shopping') {
    console.log('🔍 Not in shopping mode, skipping completion check');
    return;
  }
  
  // Use UNFILTERED articles for completion checking
  this.allListArticles$.pipe(take(1)).subscribe(articles => {
    console.log('🔍 Checking completion with UNFILTERED articles...');
    console.log('🔍 All articles:', articles.map(a => ({ name: a.name, checked: a.isChecked })));
    
    if (!articles?.length) {
      console.log('🔍 No articles found in list');
      return;
    }

    const uncheckedCount = articles.filter(article => !article.isChecked).length;
    const totalCount = articles.length;
    const checkedCount = articles.filter(article => article.isChecked).length;

    console.log('🔍 Completion status:', { 
      uncheckedCount, 
      checkedCount,
      totalCount, 
      isComplete: uncheckedCount === 0,
      mode: this.currentMode,
      currentFilter: this.currentShoppingFilter
    });

    // Trigger celebration if all items are checked
    if (uncheckedCount === 0 && totalCount > 0) {
      console.log('🎉 ALL ITEMS COMPLETED! Triggering celebration!');
      this.triggerCelebrationAnimation();
    } else {
      console.log(`🔍 Not complete: ${checkedCount}/${totalCount} items checked`);
    }
  });
}

private checkCompletionDirectly(): void {
  if (this.currentMode !== 'shopping') return;
  
  this.list$.pipe(take(1)).subscribe(list => {
    if (!list || !list.articleIds.length) {
      console.log('🔍 No list or no articles');
      return;
    }
    
    const totalItems = list.articleIds.length;
    const checkedItems = Object.values(list.itemStates || {})
      .filter(state => state.isChecked).length;
    
    console.log('🔍 Direct completion check:', {
      totalItems,
      checkedItems,
      isComplete: checkedItems === totalItems,
      itemStates: list.itemStates
    });
    
    if (checkedItems === totalItems && totalItems > 0) {
      console.log('🎉 DIRECTLY CONFIRMED: ALL ITEMS COMPLETED!');
      this.triggerCelebrationAnimation();
    }
  });
}

}