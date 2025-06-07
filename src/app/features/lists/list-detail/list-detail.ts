import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
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

import { ShoppingList, Article } from '../../../core/models';
import { DataService } from '../../../core/services/data';

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
    MatSlideToggleModule
  ],
  templateUrl: './list-detail.html',
  styleUrls: ['./list-detail.scss']
})
export class ListDetailComponent implements OnInit {
  listId: string = '';
  list$!: Observable<ShoppingList | undefined>;
  
  // Simple mode management
  currentMode: ViewMode = 'shopping';
  
  // Filter states
  currentShoppingFilter: ShoppingFilter = 'alle';
  currentEditFilter: EditFilter = 'alle';
  private shoppingFilter$ = new BehaviorSubject<ShoppingFilter>('alle');
  private editFilter$ = new BehaviorSubject<EditFilter>('alle');
  
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
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
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
    
    console.log('🔴 Constructor finished successfully');
  }

  ngOnInit(): void {
    console.log('🔴 ngOnInit starting...');
    
    // Check for mode parameter
    const mode = this.route.snapshot.queryParamMap.get('mode');
    if (mode === 'edit') {
      this.currentMode = 'edit';
    }
    
    // Simple subscription to check if list exists
    this.list$.subscribe({
      next: (list) => {
        console.log('🔴 List received:', list?.name || 'No list');
        this.currentList = list || null;
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

  // Filter methods for shopping mode
  setShoppingFilter(filter: ShoppingFilter): void {
    this.currentShoppingFilter = filter;
    this.shoppingFilter$.next(filter);
  }

  // Filter methods for edit mode
  setEditFilter(filter: EditFilter): void {
    this.currentEditFilter = filter;
    this.editFilter$.next(filter);
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
    return '#f44336';
  }

  getContrastColor(hexColor: string): string {
    return '#ffffff';
  }

  getLightColor(hexColor: string): string {
    return '#ffcdd2';
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
        returnToList: this.listId,
        autoAdd: 'true'
      }
    });
  }

  onArticleInfo(article: any): void {
    if (article?.id) {
      // Pass returnTo parameter to preserve edit mode
      this.router.navigate(['/articles', article.id], {
        queryParams: { 
          returnTo: `/lists/${this.listId}?mode=edit`
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
    console.log('Clear all items');
  }

  onEditList(): void {
    this.snackBar.open('Liste bearbeiten - Coming soon!', '', { duration: 1500 });
  }

  onDeleteList(): void {
    if (confirm('Liste wirklich löschen?')) {
      this.router.navigate(['/lists']);
    }
  }
}