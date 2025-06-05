import { Component, OnInit } from '@angular/core';
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
    private snackBar: MatSnackBar
  ) {
    console.log('🔴 Constructor starting...');
    
    // Get the list ID from route
    this.listId = this.route.snapshot.paramMap.get('id') || '';
    console.log('🔴 Got listId:', this.listId);
    
    // Initialize the observables
    console.log('🔴 About to call dataService.getList...');
    this.list$ = this.dataService.getList(this.listId);
    console.log('🔴 Called dataService.getList successfully');
    
    // Real article data for shopping mode
    this.listArticles$ = this.dataService.getArticles().pipe(
      map(articles => {
        if (!this.currentList) return [];
        
        return articles
          .filter(article => this.currentList?.articleIds.includes(article.id))
          .map(article => ({
            ...article,
            isChecked: this.currentList?.itemStates[article.id]?.isChecked || false,
            isInList: true
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      })
    );

    // Real edit mode with search and toggle states
    this.allArticlesWithState$ = combineLatest([
      this.dataService.getArticles(),
      this.searchQuery$.pipe(
        debounceTime(300),
        distinctUntilChanged()
      )
    ]).pipe(
      map(([allArticles, query]) => {
        if (!this.currentList) return [];
        
        let filtered = allArticles;
        
        // Filter by search query if exists
        if (query && query.trim()) {
          filtered = filtered.filter(article =>
            article.name.toLowerCase().includes(query.toLowerCase())
          );
        }
        
        // Map articles with their toggle state and list-specific amount
        return filtered
          .map(article => ({
            ...article,
            isInList: this.currentList?.articleIds.includes(article.id) || false,
            listAmount: this.currentList?.itemStates[article.id]?.amount || article.amount || ''
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      })
    );
    
    console.log('🔴 Constructor finished successfully');
  }

  ngOnInit(): void {
    console.log('🔴 ngOnInit starting...');
    
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

  // Simple mode switching
  switchToShoppingMode(): void {
    console.log('🔴 Switching to shopping mode');
    this.currentMode = 'shopping';
    this.searchQuery = '';
    this.searchQuery$.next('');
  }

  switchToEditMode(): void {
    console.log('🔴 Switching to edit mode');
    this.currentMode = 'edit';
  }

  // Navigation
  onBack(): void {
    console.log('🔴 Going back to lists');
    this.router.navigate(['/lists']);
  }

  // Simple color methods
  getCurrentListColor(): string {
    return '#f44336';
  }

  getContrastColor(hexColor: string): string {
    return '#ffffff';
  }

  getLightColor(hexColor: string): string {
    return '#ffcdd2';
  }

  // Working action methods
  onArticleToggle(article: any): void {
    console.log('🔴 Toggle article:', article?.name || 'unknown');
    this.dataService.toggleItemChecked(this.listId, article.id).subscribe({
      next: (success) => {
        if (success) {
          console.log('🔴 Toggle successful');
        }
      },
      error: (error) => console.error('🔴 Toggle error:', error)
    });
  }

  onToggleArticleInList(article: any): void {
    console.log('🔴 Toggle article in list:', article?.name || 'unknown');
    
    if (article.isInList) {
      this.dataService.removeArticleFromList(this.listId, article.id).subscribe({
        next: (success) => {
          if (success) {
            this.snackBar.open(`${article.name} entfernt`, '', { duration: 1000 });
          }
        },
        error: (error) => console.error('🔴 Remove error:', error)
      });
    } else {
      this.dataService.addArticleToList(this.listId, article.id).subscribe({
        next: (success) => {
          if (success) {
            this.snackBar.open(`${article.name} hinzugefügt`, '', { duration: 1000 });
          }
        },
        error: (error) => console.error('🔴 Add error:', error)
      });
    }
  }

  onSearchQueryChange(): void {
    console.log('🔴 Search query changed to:', this.searchQuery);
    this.searchQuery$.next(this.searchQuery.trim());
  }

  onCreateNewArticle(): void {
    console.log('🔴 Create new article');
    if (this.searchQuery.trim()) {
      this.router.navigate(['/articles/add'], {
        queryParams: { 
          name: this.searchQuery.trim(),
          returnTo: `/lists/${this.listId}` 
        }
      });
    } else {
      this.router.navigate(['/articles/add'], {
        queryParams: { returnTo: `/lists/${this.listId}` }
      });
    }
  }

  onEditAmount(article: any): void {
    console.log('🔴 Edit amount for:', article?.name || 'unknown');
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

  onArticleInfo(article: any): void {
    console.log('🔴 Show article info:', article?.name || 'unknown');
    if (article?.id) {
      this.router.navigate(['/articles', article.id], {
        queryParams: { returnTo: `/lists/${this.listId}` }
      });
    }
  }

  onEditAmountInShopping(article: any, event: Event): void {
    event.stopPropagation();
    console.log('🔴 Edit amount in shopping:', article?.name || 'unknown');
    
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

  getArticleAmount(article: any): string {
    console.log('🔴 Get article amount for:', article?.name || 'unknown');
    try {
      const listAmount = this.currentList?.itemStates[article.id]?.amount;
      return listAmount || article.amount || '';
    } catch {
      return article?.amount || '';
    }
  }

  onClearAllItems(): void {
    console.log('🔴 Clear all items');
    if (confirm('Alle Artikel aus der Liste entfernen?')) {
      this.dataService.clearAllItemsFromList(this.listId).subscribe({
        next: (success) => {
          if (success) {
            this.snackBar.open('Liste geleert', '', { duration: 1500 });
          }
        },
        error: (error) => console.error('Error clearing list:', error)
      });
    }
  }

  onEditList(): void {
    console.log('🔴 Edit list');
    this.snackBar.open('Liste bearbeiten - Coming soon!', '', { duration: 1500 });
  }

  onDeleteList(): void {
    console.log('🔴 Delete list');
    if (confirm('Liste wirklich löschen?')) {
      this.dataService.deleteList(this.listId).subscribe({
        next: (success) => {
          if (success) {
            this.snackBar.open('Liste gelöscht', '', { duration: 1500 });
            this.router.navigate(['/lists']);
          }
        },
        error: (error) => console.error('Error deleting list:', error)
      });
    }
  }
}