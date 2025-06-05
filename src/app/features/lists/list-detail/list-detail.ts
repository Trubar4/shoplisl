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
    this.dataService.toggleItemChecked(this.listId, article.id).subscribe();
  }

  onToggleArticleInList(article: any): void {
    if (article.isInList) {
      this.dataService.removeArticleFromList(this.listId, article.id).subscribe();
    } else {
      this.dataService.addArticleToList(this.listId, article.id).subscribe();
    }
  }

  onSearchQueryChange(): void {
    this.searchQuery$.next(this.searchQuery.trim());
  }

  onCreateNewArticle(): void {
    this.router.navigate(['/articles/add']);
  }

  onArticleInfo(article: any): void {
    if (article?.id) {
      this.router.navigate(['/articles', article.id]);
    }
  }

  getArticleAmount(article: any): string {
    return article?.amount || '';
  }

  onEditAmount(article: any): void {
    console.log('Edit amount:', article?.name);
  }

  onEditAmountInShopping(article: any, event: Event): void {
    event.stopPropagation();
    console.log('Edit amount in shopping:', article?.name);
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