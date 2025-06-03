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
    // Force refresh of the observables to ensure UI updates immediately
    this.refreshData();
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
        this.refreshData();
      }
    });
  } else {
    // Add to list
    this.dataService.addArticleToList(this.listId, article.id).subscribe(success => {
      if (success) {
        this.snackBar.open(`${article.name} hinzugefügt`, 'OK', { duration: 1500 });
        this.refreshData();
      }
    });
  }
}

onEditAmount(article: ArticleWithToggleAndAmount): void {
  // Show prompt to edit amount
  const currentAmount = article.listAmount || article.amount || '';
  const newAmount = prompt(`Menge für ${article.name} bearbeiten:`, currentAmount);
  
  if (newAmount !== null) { // null means cancelled
    this.dataService.updateListItemAmount(this.listId, article.id, newAmount.trim()).subscribe(() => {
      this.snackBar.open('Menge aktualisiert', 'OK', { duration: 1500 });
      this.refreshData();
    });
  }
}

onUpdateListAmount(article: ArticleWithToggleAndAmount, newAmount: string): void {
  // Update the amount for this specific article in this list
  this.dataService.updateListItemAmount(this.listId, article.id, newAmount).subscribe(() => {
    this.refreshData();
  });
}

onAmountInput(article: ArticleWithToggleAndAmount, newAmount: string): void {
  // Optional: Handle real-time input changes if needed
  // For now, we'll rely on the blur event to save changes
}

// Helper method to force refresh data observables
private refreshData(): void {
  // Trigger a fresh fetch of the list data
  this.list$ = this.dataService.getList(this.listId);
  
  // Recreate the observables to ensure they get fresh data
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
  // Helper methods
  getArticleAmount(article: ArticleWithState): string {
    // Get the list-specific amount or fall back to the article's default amount
    const listAmount = this.getCurrentList()?.itemStates[article.id]?.amount;
    const amount = listAmount || article.amount || '';
    return amount.trim(); // Return empty string if no amount, so we can show "Menge" chip
  }

  onEditAmountInShopping(article: ArticleWithState, event: Event): void {
    // Prevent the parent click event from firing (toggle)
    event.stopPropagation();
    
    const currentAmount = this.getArticleAmount(article);
    const newAmount = prompt(`Menge für ${article.name} bearbeiten:`, currentAmount);
    
    if (newAmount !== null) { // null means cancelled
      this.dataService.updateListItemAmount(this.listId, article.id, newAmount.trim()).subscribe(() => {
        this.snackBar.open('Menge aktualisiert', 'OK', { duration: 1500 });
        this.refreshData();
      });
    }
  }

  private getCurrentList(): ShoppingList | undefined {
    let currentList: ShoppingList | undefined;
    this.list$.subscribe(list => currentList = list).unsubscribe();
    return currentList;
  }

  onClearAllItems(): void {
    const confirmed = confirm('Alle Artikel aus der Liste entfernen?');
    if (confirmed) {
      this.dataService.clearAllItemsFromList(this.listId).subscribe(success => {
        if (success) {
          this.snackBar.open('Liste geleert', 'OK', { duration: 2000 });
          this.refreshData();
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

  getCurrentListColor(): string {
    const currentList = this.getCurrentList();
    return currentList?.color || '#f44336'; // Default to red if no color
  }

  getContrastColor(hexColor: string): string {
    // Remove # if present
    const color = hexColor.replace('#', '');
    
    // Convert to RGB
    const r = parseInt(color.substr(0, 2), 16);
    const g = parseInt(color.substr(2, 2), 16);
    const b = parseInt(color.substr(4, 2), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return black for light colors, white for dark colors
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  getLightColor(hexColor: string): string {
    // Remove # if present
    const color = hexColor.replace('#', '');
    
    // Convert to RGB
    const r = parseInt(color.substr(0, 2), 16);
    const g = parseInt(color.substr(2, 2), 16);
    const b = parseInt(color.substr(4, 2), 16);
    
    // Make it lighter by blending with white (85% white, 15% original color)
    const newR = Math.round(r * 0.15 + 255 * 0.85);
    const newG = Math.round(g * 0.15 + 255 * 0.85);
    const newB = Math.round(b * 0.15 + 255 * 0.85);
    
    // Convert back to hex
    const toHex = (n: number) => {
      const hex = n.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
  }

}