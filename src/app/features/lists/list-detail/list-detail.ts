import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, combineLatest, BehaviorSubject } from 'rxjs';
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
  listId: string;
  list$: Observable<ShoppingList | undefined>;
  
  // Mode management
  currentMode: ViewMode = 'shopping';
  
  // Shopping mode data
  listArticles$: Observable<ArticleWithState[]>;
  
  // Edit mode data
  searchQuery$ = new BehaviorSubject<string>('');
  allArticlesWithState$: Observable<ArticleWithToggleAndAmount[]>;
  searchQuery = '';
  
  isLoading = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dataService: DataService,
    private snackBar: MatSnackBar
  ) {
    this.listId = this.route.snapshot.paramMap.get('id') || '';
    this.list$ = this.dataService.getList(this.listId);
    
    // Articles in the list (for shopping mode)
    this.listArticles$ = combineLatest([
      this.list$,
      this.dataService.getArticles()
    ]).pipe(
      map(([list, allArticles]) => {
        if (!list) return [];
        return allArticles
          .filter(article => list.articleIds.includes(article.id))
          .map(article => ({
            ...article,
            isChecked: list.itemStates[article.id]?.isChecked || false,
            isInList: true
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      })
    );
    
    // ALL articles with toggle states (edit mode)
    this.allArticlesWithState$ = combineLatest([
      this.list$,
      this.dataService.getArticles(),
      this.searchQuery$.pipe(
        debounceTime(300),
        distinctUntilChanged()
      )
    ]).pipe(
      map(([list, allArticles, query]) => {
        if (!list) return [];
        
        let filtered = allArticles;
        
        // Filter by search query if exists
        if (query.trim()) {
          filtered = filtered.filter(article =>
            article.name.toLowerCase().includes(query.toLowerCase().trim())
          );
        }
        
        // Map articles with their toggle state and list-specific amount
        return filtered
          .map(article => ({
            ...article,
            isInList: list.articleIds.includes(article.id),
            listAmount: list.itemStates[article.id]?.amount || article.amount || ''
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      })
    );
  }

  ngOnInit(): void {
    this.list$.subscribe(list => {
      if (!list) {
        this.router.navigate(['/lists']);
      }
      this.isLoading = false;
    });
  }

  // Mode switching
  switchToShoppingMode(): void {
    this.currentMode = 'shopping';
    this.searchQuery = '';
    this.searchQuery$.next('');
  }

  switchToEditMode(): void {
    this.currentMode = 'edit';
  }

  // Shopping mode actions
  onArticleToggle(article: ArticleWithState): void {
    this.dataService.toggleItemChecked(this.listId, article.id).subscribe(() => {
      // The observable will automatically update the UI
    });
  }

  onArticleInfo(article: ArticleWithState): void {
    // Store the current list ID so we can return here
    this.router.navigate(['/articles', article.id], {
      queryParams: { returnTo: `/lists/${this.listId}` }
    });
  }

  // Edit mode actions
  onSearchQueryChange(): void {
    this.searchQuery$.next(this.searchQuery.trim());
  }

  onToggleArticleInList(article: ArticleWithToggleAndAmount): void {
    if (article.isInList) {
      // Remove from list
      this.dataService.removeArticleFromList(this.listId, article.id).subscribe(success => {
        if (success) {
          this.snackBar.open(`${article.name} entfernt`, 'OK', { duration: 1500 });
        }
      });
    } else {
      // Add to list
      this.dataService.addArticleToList(this.listId, article.id).subscribe(success => {
        if (success) {
          this.snackBar.open(`${article.name} hinzugefügt`, 'OK', { duration: 1500 });
        }
      });
    }
  }

  onUpdateListAmount(article: ArticleWithToggleAndAmount, newAmount: string): void {
    // Update the amount for this specific article in this list
    this.dataService.updateListItemAmount(this.listId, article.id, newAmount).subscribe();
  }

  onClearAllItems(): void {
    const confirmed = confirm('Alle Artikel aus der Liste entfernen?');
    if (confirmed) {
      this.dataService.clearAllItemsFromList(this.listId).subscribe(success => {
        if (success) {
          this.snackBar.open('Liste geleert', 'OK', { duration: 2000 });
        }
      });
    }
  }

  onEditList(): void {
    // Navigate to edit list (we'll implement this later)
    this.snackBar.open('Liste bearbeiten - Coming soon!', 'OK', { duration: 2000 });
  }

  onDeleteList(): void {
    const confirmed = confirm('Liste wirklich löschen?');
    if (confirmed) {
      this.dataService.deleteList(this.listId).subscribe(success => {
        if (success) {
          this.snackBar.open('Liste gelöscht', 'OK', { duration: 2000 });
          this.router.navigate(['/lists']);
        }
      });
    }
  }

  onCreateNewArticle(): void {
    this.router.navigate(['/articles/add']);
  }

  onBack(): void {
    this.router.navigate(['/lists']);
  }

  getCheckedCount(): number {
    let count = 0;
    this.listArticles$.subscribe(articles => {
      count = articles.filter(article => article.isChecked).length;
    }).unsubscribe();
    return count;
  }

  getTotalCount(): number {
    let count = 0;
    this.listArticles$.subscribe(articles => {
      count = articles.length;
    }).unsubscribe();
    return count;
  }
}