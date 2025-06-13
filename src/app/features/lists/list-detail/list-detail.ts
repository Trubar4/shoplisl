import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { map, debounceTime, distinctUntilChanged } from 'rxjs/operators';
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


class Color {
  public r!: number;
  public g!: number;
  public b!: number;

  constructor(r: number, g: number, b: number) {
    this.set(r, g, b);
  }

  toString(): string {
    return `rgb(${Math.round(this.r)}, ${Math.round(this.g)}, ${Math.round(this.b)})`;
  }

  set(r: number, g: number, b: number): void {
    this.r = this.clamp(r);
    this.g = this.clamp(g);
    this.b = this.clamp(b);
  }

  hueRotate(angle = 0): void {
    angle = (angle / 180) * Math.PI;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);

    this.multiply([
      0.213 + cos * 0.787 - sin * 0.213,
      0.715 - cos * 0.715 - sin * 0.715,
      0.072 - cos * 0.072 + sin * 0.928,
      0.213 - cos * 0.213 + sin * 0.143,
      0.715 + cos * 0.285 + sin * 0.14,
      0.072 - cos * 0.072 - sin * 0.283,
      0.213 - cos * 0.213 - sin * 0.787,
      0.715 - cos * 0.715 + sin * 0.715,
      0.072 + cos * 0.928 + sin * 0.072,
    ]);
  }

  grayscale(value = 1): void {
    this.multiply([
      0.2126 + 0.7874 * (1 - value),
      0.7152 - 0.7152 * (1 - value),
      0.0722 - 0.0722 * (1 - value),
      0.2126 - 0.2126 * (1 - value),
      0.7152 + 0.2848 * (1 - value),
      0.0722 - 0.0722 * (1 - value),
      0.2126 - 0.2126 * (1 - value),
      0.7152 - 0.7152 * (1 - value),
      0.0722 + 0.9278 * (1 - value),
    ]);
  }

  sepia(value = 1): void {
    this.multiply([
      0.393 + 0.607 * (1 - value),
      0.769 - 0.769 * (1 - value),
      0.189 - 0.189 * (1 - value),
      0.349 - 0.349 * (1 - value),
      0.686 + 0.314 * (1 - value),
      0.168 - 0.168 * (1 - value),
      0.272 - 0.272 * (1 - value),
      0.534 - 0.534 * (1 - value),
      0.131 + 0.869 * (1 - value),
    ]);
  }

  saturate(value = 1): void {
    this.multiply([
      0.213 + 0.787 * value,
      0.715 - 0.715 * value,
      0.072 - 0.072 * value,
      0.213 - 0.213 * value,
      0.715 + 0.285 * value,
      0.072 - 0.072 * value,
      0.213 - 0.213 * value,
      0.715 - 0.715 * value,
      0.072 + 0.928 * value,
    ]);
  }

  multiply(matrix: number[]): void {
    const newR = this.clamp(
      this.r * matrix[0] + this.g * matrix[1] + this.b * matrix[2]
    );
    const newG = this.clamp(
      this.r * matrix[3] + this.g * matrix[4] + this.b * matrix[5]
    );
    const newB = this.clamp(
      this.r * matrix[6] + this.g * matrix[7] + this.b * matrix[8]
    );
    this.r = newR;
    this.g = newG;
    this.b = newB;
  }

  brightness(value = 1): void {
    this.linear(value);
  }

  contrast(value = 1): void {
    this.linear(value, -(0.5 * value) + 0.5);
  }

  linear(slope = 1, intercept = 0): void {
    this.r = this.clamp(this.r * slope + intercept * 255);
    this.g = this.clamp(this.g * slope + intercept * 255);
    this.b = this.clamp(this.b * slope + intercept * 255);
  }

  invert(value = 1): void {
    this.r = this.clamp((value + (this.r / 255) * (1 - 2 * value)) * 255);
    this.g = this.clamp((value + (this.g / 255) * (1 - 2 * value)) * 255);
    this.b = this.clamp((value + (this.b / 255) * (1 - 2 * value)) * 255);
  }

  hsl(): { h: number; s: number; l: number } {
    const r = this.r / 255;
    const g = this.g / 255;
    const b = this.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h: number, s: number, l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
        default:
          h = 0;
      }
      h /= 6;
    }

    return {
      h: h * 100,
      s: s * 100,
      l: l * 100,
    };
  }

  clamp(value: number): number {
    if (value > 255) {
      value = 255;
    } else if (value < 0) {
      value = 0;
    }
    return value;
  }
}

class ColorFilterSolver {
  private target: Color;
  private targetHSL: { h: number; s: number; l: number };
  private reusedColor: Color;

  constructor(target: Color) {
    this.target = target;
    this.targetHSL = target.hsl();
    this.reusedColor = new Color(0, 0, 0);
  }

  solve(): { values: number[]; loss: number; filter: string } {
    const result = this.solveNarrow(this.solveWide());
    return {
      values: result.values,
      loss: result.loss,
      filter: this.css(result.values),
    };
  }

  private solveWide(): { values: number[]; loss: number } {
    const A = 5;
    const c = 15;
    const a = [60, 180, 18000, 600, 1.2, 1.2];

    let best = { loss: Infinity, values: [] as number[] };
    for (let i = 0; best.loss > 25 && i < 3; i++) {
      const initial = [50, 20, 3750, 50, 100, 100];
      const result = this.spsa(A, a, c, initial, 1000);
      if (result.loss < best.loss) {
        best = result;
      }
    }
    return best;
  }

  private solveNarrow(wide: { values: number[]; loss: number }): { values: number[]; loss: number } {
    const A = wide.loss;
    const c = 2;
    const A1 = A + 1;
    const a = [0.25 * A1, 0.25 * A1, A1, 0.25 * A1, 0.2 * A1, 0.2 * A1];
    return this.spsa(A, a, c, wide.values, 500);
  }

  private spsa(A: number, a: number[], c: number, values: number[], iters: number): { values: number[]; loss: number } {
    const alpha = 1;
    const gamma = 0.16666666666666666;

    let best: number[] | null = null;
    let bestLoss = Infinity;
    const deltas = new Array(6);
    const highArgs = new Array(6);
    const lowArgs = new Array(6);

    for (let k = 0; k < iters; k++) {
      const ck = c / Math.pow(k + 1, gamma);
      for (let i = 0; i < 6; i++) {
        deltas[i] = Math.random() > 0.5 ? 1 : -1;
        highArgs[i] = values[i] + ck * deltas[i];
        lowArgs[i] = values[i] - ck * deltas[i];
      }

      const lossDiff = this.loss(highArgs) - this.loss(lowArgs);
      for (let i = 0; i < 6; i++) {
        const g = (lossDiff / (2 * ck)) * deltas[i];
        const ak = a[i] / Math.pow(A + k + 1, alpha);
        values[i] = this.fix(values[i] - ak * g, i);
      }

      const loss = this.loss(values);
      if (loss < bestLoss) {
        best = values.slice(0);
        bestLoss = loss;
      }
    }

    return { values: best!, loss: bestLoss };
  }

  private fix(value: number, idx: number): number {
    let max = 100;
    if (idx === 2 /* saturate */) {
      max = 7500;
    } else if (idx === 4 /* brightness */ || idx === 5 /* contrast */) {
      max = 200;
    }

    if (idx === 3 /* hue-rotate */) {
      if (value > max) {
        value %= max;
      } else if (value < 0) {
        value = max + (value % max);
      }
    } else if (value < 0) {
      value = 0;
    } else if (value > max) {
      value = max;
    }

    return value;
  }

  private loss(filters: number[]): number {
    // Argument is array of percentages.
    const color = this.reusedColor;
    color.set(0, 0, 0);

    color.invert(filters[0] / 100);
    color.sepia(filters[1] / 100);
    color.saturate(filters[2] / 100);
    color.hueRotate(filters[3] * 3.6);
    color.brightness(filters[4] / 100);
    color.contrast(filters[5] / 100);

    const colorHSL = color.hsl();
    return (
      Math.abs(color.r - this.target.r) +
      Math.abs(color.g - this.target.g) +
      Math.abs(color.b - this.target.b) +
      Math.abs(colorHSL.h - this.targetHSL.h) +
      Math.abs(colorHSL.s - this.targetHSL.s) +
      Math.abs(colorHSL.l - this.targetHSL.l)
    );
  }

  private css(filters: number[]): string {
    const fmt = (idx: number, multiplier = 1): number => {
      return Math.round(filters[idx] * multiplier);
    };

    return `invert(${fmt(0)}%) sepia(${fmt(1)}%) saturate(${fmt(2)}%) hue-rotate(${fmt(3, 3.6)}deg) brightness(${fmt(4)}%) contrast(${fmt(5)}%)`;
  }
}


@Component({
  selector: 'app-list-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatDialogModule
  ],
  templateUrl: './list-detail.html',
  styleUrls: ['./list-detail.scss']
})
export class ListDetailComponent implements OnInit, OnDestroy {
  private departmentIconFilterCache: string = '';
  listId: string = '';
  list$!: Observable<ShoppingList | undefined>;
  departmentGroups$!: Observable<DepartmentGroup[]>;
  departmentGroupsEdit$!: Observable<DepartmentGroupEdit[]>;
  
  // Simple mode management
  currentMode: ViewMode = 'shopping';
  
  // Filter states
  currentShoppingFilter: ShoppingFilter = 'alle';
  currentEditFilter: EditFilter = 'alle';
  private shoppingFilter$ = new BehaviorSubject<ShoppingFilter>('alle');
  private editFilter$ = new BehaviorSubject<EditFilter>('alle');
  
  // FAB state
  isFabExpanded = false;
  
  // Simple data properties
  listArticles$!: Observable<ArticleWithState[]>;
  allArticlesWithState$!: Observable<ArticleWithToggleAndAmount[]>;
  searchQuery$ = new BehaviorSubject<string>('');
  searchQuery = '';
  
  isLoading = true;
  currentList: ShoppingList | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dataService: DataService,
    private departmentService: DepartmentService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) {
    console.log('🔴 Constructor starting...');
    
    // Get the list ID from route
    this.listId = this.route.snapshot.paramMap.get('id') || '';
    console.log('🔴 Got listId:', this.listId);
    
    // Initialize the observables
    console.log('🔴 About to call dataService.getList...');
    // Use real-time lists data instead of one-time getList call
    this.list$ = this.dataService.getLists().pipe(
      map(lists => lists.find(list => list.id === this.listId))
    );
    console.log('🔴 Called dataService.getList successfully');
    
    // Real article data for shopping mode - with reactive updates and filtering
    this.listArticles$ = combineLatest([
      this.list$,
      this.dataService.getArticles(),
      this.shoppingFilter$
    ]).pipe(
      map(([list, articles, filter]) => {
        if (!list) return [];
        
        let filteredArticles = articles
          .filter(article => list.articleIds.includes(article.id))
          .map(article => ({
            ...article,
            isChecked: list.itemStates[article.id]?.isChecked || false,
            isInList: true
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        // Apply shopping filter
        switch (filter) {
          case 'offen':
            filteredArticles = filteredArticles.filter(article => !article.isChecked);
            break;
          case 'erledigt':
            filteredArticles = filteredArticles.filter(article => article.isChecked);
            break;
          case 'alle':
          default:
            // Show all articles
            break;
        }

        return filteredArticles;
      })
    );

    // Real edit mode with search, toggle states, and filtering - with reactive updates
    this.allArticlesWithState$ = combineLatest([
      this.list$,
      this.dataService.getArticles(),
      this.searchQuery$.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ),
      this.editFilter$
    ]).pipe(
      map(([list, allArticles, query, filter]) => {
        if (!list) return [];
        
        let filtered = allArticles;
        
        // Filter by search query if exists
        if (query && query.trim()) {
          filtered = filtered.filter(article =>
            article.name.toLowerCase().includes(query.toLowerCase())
          );
        }
        
        // Map articles with their toggle state and list-specific amount
        let articlesWithState = filtered
          .map(article => ({
            ...article,
            isInList: list.articleIds.includes(article.id),
            listAmount: list.itemStates[article.id]?.amount || article.amount || ''
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        // Apply edit filter
        switch (filter) {
          case 'gelistet':
            articlesWithState = articlesWithState.filter(article => article.isInList);
            break;
          case 'fehlend':
            articlesWithState = articlesWithState.filter(article => !article.isInList);
            break;
          case 'alle':
          default:
            // Show all articles
            break;
        }

        return articlesWithState;
      })
    );
    
    // Grouped observables for department sections
    this.departmentGroups$ = combineLatest([
      this.listArticles$,
      this.departmentService.getDepartments(),
      this.list$
    ]).pipe(
      map(([articles, departments]) => {
        const groups: DepartmentGroup[] = [];
        
        // Group articles by department
        const departmentMap = new Map<string, ArticleWithState[]>();
        
        articles.forEach(article => {
          const deptId = article.departmentId || 'miscellaneous';
          if (!departmentMap.has(deptId)) {
            departmentMap.set(deptId, []);
          }
          departmentMap.get(deptId)!.push(article);
        });
        
        // Create groups with department info, only for departments that have articles
        departmentMap.forEach((articles, deptId) => {
          const department = departments.find(d => d.id === deptId) || {
            id: 'miscellaneous',
            nameGerman: 'Sonstiges',
            nameEnglish: 'Miscellaneous',
            icon: 'Help-Chat-2--Streamline-Core-Remix.png'
          };
          
          groups.push({
            department,
            articles: articles.sort((a, b) => a.name.localeCompare(b.name))
          });
        });
        
        // Sort groups by department name
        return groups.sort((a, b) => a.department.nameGerman.localeCompare(b.department.nameGerman));
      })
    );

    this.departmentGroupsEdit$ = combineLatest([
      this.allArticlesWithState$,
      this.departmentService.getDepartments(),
      this.list$
    ]).pipe(
      map(([articles, departments, list]) => {
        const groups: DepartmentGroupEdit[] = [];
        
        // Group articles by department
        const departmentMap = new Map<string, ArticleWithToggleAndAmount[]>();
        
        articles.forEach(article => {
          const deptId = article.departmentId || 'miscellaneous';
          if (!departmentMap.has(deptId)) {
            departmentMap.set(deptId, []);
          }
          departmentMap.get(deptId)!.push(article);
        });
        
        // Create groups with department info, only for departments that have articles
        departmentMap.forEach((articles, deptId) => {
          const department = departments.find(d => d.id === deptId) || {
            id: 'miscellaneous',
            nameGerman: 'Sonstiges', 
            nameEnglish: 'Miscellaneous',
            icon: 'Help-Chat-2--Streamline-Core-Remix.png'
          };
          
          groups.push({
            department,
            articles: articles.sort((a, b) => a.name.localeCompare(b.name))
          });
        });
        
        // Sort groups by department name
        return groups.sort((a, b) => a.department.nameGerman.localeCompare(b.department.nameGerman));
      })
    );

    console.log('🔴 Constructor finished successfully');
  }

  ngOnInit(): void {
    console.log('🔴 ngOnInit starting...');
    
    // Check for mode parameter
    const mode = this.route.snapshot.queryParamMap.get('mode');
    if (mode === 'edit') {
      this.currentMode = 'edit';
    }
    
    // UPDATED: Use custom department order for grouping
    this.departmentGroups$ = combineLatest([
      this.listArticles$,
      this.departmentService.getDepartments(),
      this.list$
    ]).pipe(
      map(([articles, departments, list]) => {
        if (!list) return [];
        
        console.log('🔍 Building department groups...');
        console.log('🔍 List:', list.name);
        console.log('🔍 List departmentOrder:', list.departmentOrder);
        console.log('🔍 DEFAULT_DEPARTMENT_ORDER:', DEFAULT_DEPARTMENT_ORDER);
        
        const groups: DepartmentGroup[] = [];
        
        // Get custom department order for this list, fallback to default
        const departmentOrder = list.departmentOrder || DEFAULT_DEPARTMENT_ORDER;
        console.log('🔍 Using departmentOrder:', departmentOrder);
        
        // Group articles by department
        const departmentMap = new Map<string, ArticleWithState[]>();
        
        articles.forEach(article => {
          const deptId = article.departmentId || 'miscellaneous';
          if (!departmentMap.has(deptId)) {
            departmentMap.set(deptId, []);
          }
          departmentMap.get(deptId)!.push(article);
        });
        
        // Create groups in the custom order, only for departments that have articles
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
      })
    );
  
    this.departmentGroupsEdit$ = combineLatest([
      this.allArticlesWithState$,
      this.departmentService.getDepartments(),
      this.list$
    ]).pipe(
      map(([articles, departments, list]) => {
        if (!list) return [];
        
        console.log('🔍 Building department groups EDIT...');
        console.log('🔍 List departmentOrder:', list.departmentOrder);
        
        const groups: DepartmentGroupEdit[] = [];
        
        // Get custom department order for this list, fallback to default
        const departmentOrder = list.departmentOrder || DEFAULT_DEPARTMENT_ORDER;
        console.log('🔍 Using departmentOrder EDIT:', departmentOrder);
            
        // Group articles by department
        const departmentMap = new Map<string, ArticleWithToggleAndAmount[]>();
        
        articles.forEach(article => {
          const deptId = article.departmentId || 'miscellaneous';
          if (!departmentMap.has(deptId)) {
            departmentMap.set(deptId, []);
          }
          departmentMap.get(deptId)!.push(article);
        });
        
        // Create groups in the custom order, only for departments that have articles
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
      })
    );
  
    this.list$.subscribe({
      next: (list) => {
        console.log('🔴 List received:', list?.name || 'No list');
        this.currentList = list || null;
        
        // Clear filter cache when list changes
        this.departmentIconFilterCache = '';
        
        // Set CSS custom properties for dynamic theming
        if (list && list.color) {
          this.updateThemeColors(list.color);
        } else {
          this.updateThemeColors('#1a9edb');
        }
        
        if (!list && !this.isLoading) {
          console.log('🔴 No list found, navigating back');
          this.router.navigate(['/lists']);
        }
        this.isLoading = false;
        console.log('🔴 Set isLoading to false');
      },
      error: (error) => {
        console.error('🔴 Error loading list:', error);
        this.isLoading = false;
        this.router.navigate(['/lists']);
      }
    });
    
    console.log('🔴 ngOnInit finished');
  }

  ngOnDestroy(): void {
    // Reset theme color to default blue when leaving list
    this.updateThemeColorMeta('#1a9edb');
  }

  // Update CSS custom properties for dynamic theming
  private updateThemeColors(color: string): void {
    const root = document.documentElement;
    root.style.setProperty('--list-primary-color', color);
    root.style.setProperty('--list-contrast-color', this.getContrastColor(color));
    root.style.setProperty('--list-light-color', this.getLightColor(color));
    root.style.setProperty('--list-dark-color', this.getDarkColor(color));
    
  // Update theme-color meta tag for PWA status bar
    this.updateThemeColorMeta(color);
  }

  // Update theme-color meta tag for PWA status bar
  private updateThemeColorMeta(color: string): void {
    let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.name = 'theme-color';
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.content = color;
    
    // Also update HTML background for PWA
    document.documentElement.style.backgroundColor = color;
  }

  // Filter methods for shopping mode
  setShoppingFilter(filter: ShoppingFilter): void {
    console.log('🔍 setShoppingFilter called with:', filter);
    console.log('🔍 Current mode:', this.currentMode);
    console.log('🔍 Previous filter:', this.currentShoppingFilter);
    
    this.currentShoppingFilter = filter;
    this.shoppingFilter$.next(filter);
    this.isFabExpanded = false; // Close FAB after selection
    
    console.log('🔍 Filter updated to:', this.currentShoppingFilter);
    console.log('🔍 FAB expanded:', this.isFabExpanded);
    
    // Force change detection
    this.cdr.detectChanges();
  }

  // Filter methods for edit mode
  setEditFilter(filter: EditFilter): void {
    console.log('🔍 setEditFilter called with:', filter);
    console.log('🔍 Current mode:', this.currentMode);
    console.log('🔍 Previous filter:', this.currentEditFilter);
    
    this.currentEditFilter = filter;
    this.editFilter$.next(filter);
    this.isFabExpanded = false; // Close FAB after selection
    
    console.log('🔍 Filter updated to:', this.currentEditFilter);
    console.log('🔍 FAB expanded:', this.isFabExpanded);
    
    // Force change detection
    this.cdr.detectChanges();
  }

  // FAB methods
  toggleFab(): void {
    console.log('🔍 toggleFab called, current state:', this.isFabExpanded);
    this.isFabExpanded = !this.isFabExpanded;
    console.log('🔍 FAB expanded after toggle:', this.isFabExpanded);
  }
  
  closeFab(): void {
    console.log('🔍 closeFab called');
    this.isFabExpanded = false;
  }

  // Force Angular change detection after Firebase updates
  private triggerChangeDetection(): void {
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 100);
  }

  // All required methods
  onBack(): void {
    this.router.navigate(['/lists']);
  }

  switchToShoppingMode(): void {
    this.currentMode = 'shopping';
    this.searchQuery = '';
    this.searchQuery$.next('');
  }

  switchToEditMode(): void {
    this.currentMode = 'edit';
  }

  getCurrentListColor(): string {
    return this.currentList?.color || '#1a9edb'; // Use list color or default blue
  }

  getContrastColor(hexColor: string): string {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return white for dark colors, dark for light colors
    return luminance > 0.5 ? '#333333' : '#ffffff';
  }

  getLightColor(hexColor: string): string {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    
    // Create a lighter version by blending with white
    const lightR = Math.round(r + (255 - r) * 0.7);
    const lightG = Math.round(g + (255 - g) * 0.7);
    const lightB = Math.round(b + (255 - b) * 0.7);
    
    return `rgb(${lightR}, ${lightG}, ${lightB})`;
  }

  getDarkColor(hexColor: string): string {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    
    // Create a darker version
    const darkR = Math.round(r * 0.8);
    const darkG = Math.round(g * 0.8);
    const darkB = Math.round(b * 0.8);
    
    return `rgb(${darkR}, ${darkG}, ${darkB})`;
  }

  getDepartmentIconPath(departmentId: string): string {
    return this.departmentService.getDepartmentIconPath(departmentId);
  }

  onArticleToggle(article: any): void {
    this.dataService.toggleItemChecked(this.listId, article.id).subscribe({
      next: (success) => {
        if (success) {
          this.triggerChangeDetection();
        }
      },
      error: (error) => console.error('🔴 Toggle error:', error)
    });
  }

  onToggleArticleInList(article: any): void {    
    if (article.isInList) {
      this.dataService.removeArticleFromList(this.listId, article.id).subscribe({
        next: (success) => {
          if (success) {
            this.snackBar.open(`${article.name} entfernt`, '', { duration: 1000 });
            this.triggerChangeDetection();
          }
        },
        error: (error) => console.error('🔴 Remove error:', error)
      });
    } else {
      this.dataService.addArticleToList(this.listId, article.id).subscribe({
        next: (success) => {
          if (success) {
            this.snackBar.open(`${article.name} hinzugefügt`, '', { duration: 1000 });
            this.triggerChangeDetection();
          }
        },
        error: (error) => console.error('🔴 Add error:', error)
      });
    }
  }

  onSearchQueryChange(): void {
    this.searchQuery$.next(this.searchQuery.trim());
  }

  onCreateNewArticle(): void {
    this.router.navigate(['/articles/add'], {
      queryParams: { 
        returnTo: `/lists/${this.listId}?mode=edit`,
        listId: this.listId
      }
    });
  }

  onArticleInfo(article: any): void {
    if (article?.id) {
      // Pass returnTo parameter to preserve edit mode
      this.router.navigate(['/articles/edit', article.id], {
        queryParams: { 
          returnTo: `/lists/${this.listId}?mode=shopping`
        }
      });
    }
  }

  getArticleAmount(article: any): string {
    try {
      const listAmount = this.currentList?.itemStates[article.id]?.amount;
      return listAmount || article.amount || '';
    } catch {
      return article?.amount || '';
    }
  }

  onEditAmount(article: any): void {
    const currentAmount = article.listAmount || article.amount || '';
    const newAmount = prompt(`Menge für ${article.name}:`, currentAmount);
    
    if (newAmount !== null) {
      this.dataService.updateListItemAmount(this.listId, article.id, newAmount.trim()).subscribe({
        next: () => {
          this.snackBar.open('Menge aktualisiert', '', { duration: 1000 });
        },
        error: (error) => console.error('Error updating amount:', error)
      });
    }
  }

  onEditAmountInShopping(article: any, event: Event): void {
    event.stopPropagation();
    
    const currentAmount = this.getArticleAmount(article);
    const newAmount = prompt(`Menge für ${article.name}:`, currentAmount);
    
    if (newAmount !== null) {
      this.dataService.updateListItemAmount(this.listId, article.id, newAmount.trim()).subscribe({
        next: () => {
          this.snackBar.open('Menge aktualisiert', '', { duration: 1000 });
        },
        error: (error) => console.error('Error updating amount:', error)
      });
    }
  }

  onClearAllItems(): void {
    if (!this.currentList) return;
    
    const count = this.currentList.articleIds.length;
    if (count === 0) {
      this.snackBar.open('Liste ist bereits leer', '', { duration: 1500 });
      return;
    }
    
    const confirmed = confirm(`Alle ${count} Artikel von der Liste entfernen?`);
    if (confirmed) {
      this.dataService.clearAllItemsFromList(this.listId).subscribe({
        next: (success) => {
          if (success) {
            this.snackBar.open('Liste geleert', '', { duration: 1500 });
          } else {
            this.snackBar.open('Fehler beim Leeren der Liste', '', { duration: 2000 });
          }
        },
        error: (error) => {
          console.error('Error clearing list:', error);
          this.snackBar.open('Fehler beim Leeren der Liste', '', { duration: 2000 });
        }
      });
    }
  }

  onEditList(): void {
    if (!this.currentList) return;
    
    // Navigate to the add-list form but in edit mode
    this.router.navigate(['/lists/add'], {
      queryParams: { 
        editId: this.listId,
        returnTo: `/lists/${this.listId}?mode=edit`
      }
    });
  }

  onDeleteList(): void {
    if (!this.currentList) return;
    
    const confirmed = confirm(`Liste "${this.currentList.name}" wirklich löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`);
    
    if (confirmed) {
      this.dataService.deleteList(this.listId).subscribe({
        next: (success) => {
          if (success) {
            this.snackBar.open('Liste gelöscht', '', { duration: 1500 });
            this.router.navigate(['/lists']);
          } else {
            this.snackBar.open('Fehler beim Löschen', '', { duration: 2000 });
          }
        },
        error: (error) => {
          console.error('Error deleting list:', error);
          this.snackBar.open('Fehler beim Löschen', '', { duration: 2000 });
        }
      });
    }
  }

  getDepartmentIconFilter(): string {
    if (this.departmentIconFilterCache) {
      return this.departmentIconFilterCache;
    }
  
    const hex = this.getCurrentListColor();
    if (!hex) return '';
    
    const rgb = this.hexToRgb(hex);
    if (!rgb) return '';
    
    this.departmentIconFilterCache = this.rgbToCssFilter(rgb);
    return this.departmentIconFilterCache;
  }
  
  private hexToRgb(hex: string): { r: number, g: number, b: number } | null {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    const shorthandRegex = /^([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => {
      return r + r + g + g + b + b;
    });
  
    const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
  
  private rgbToCssFilter({ r, g, b }: { r: number, g: number, b: number }): string {
    const target = new Color(r, g, b);
    const solver = new ColorFilterSolver(target);
    const result = solver.solve();
    
    // Log the accuracy for debugging
    if (result.loss < 1) {
      console.log('Perfect color match achieved');
    } else if (result.loss < 5) {
      console.log('Close color match');
    } else if (result.loss < 15) {
      console.log('Acceptable color match, loss:', result.loss);
    } else {
      console.warn('Poor color match, loss:', result.loss, 'Consider re-running');
    }
    
    return result.filter;
  }

  onDepartmentSort(): void {
    console.log('🔍 onDepartmentSort called');
    console.log('🔍 Current list:', this.currentList);
    console.log('🔍 List ID:', this.listId);
    
    if (!this.currentList) {
      console.error('🔍 No current list available');
      return;
    }
    
    console.log('🔍 Navigating to departments...');
    this.router.navigate(['/lists', this.listId, 'departments']).then(
      (success) => {
        console.log('🔍 Navigation result:', success);
      },
      (error) => {
        console.error('🔍 Navigation error:', error);
      }
    );
  }
  
}
