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
  
  // Simple mode management - back to basics
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
    console.log('🏗️ ListDetail ngOnInit - listId:', this.listId);
    
    this.list$.subscribe(list => {
      if (!list && !this.isLoading) {
        this.router.navigate(['/lists']);
      }
      this.isLoading = false;
    });
  }

  // SIMPLE Mode switching - no observables, no complex logic
  switchToShoppingMode(): void {
    console.log('🛒 Switching to shopping mode');
    this.currentMode = 'shopping';
    this.searchQuery = '';
    this.searchQuery$.next('');
  }

  switchToEditMode(): void {
    console.log('✏️ Switching to edit mode');
    this.currentMode = 'edit';
  }

  // Navigation
  onBack(): void {
    this.router.navigate(['/lists']);
  }

  // Shopping mode actions
  onArticleToggle(article: ArticleWithState): void {
    console.log('🔄 Toggling article check state:', article.name, 'Currently checked:', article.isChecked);
    
    this.dataService.toggleItemChecked(this.listId, article.id).subscribe(success => {
      if (success) {
        console.log('✅ Article toggle successful');
      } else {
        console.error('❌ Article toggle failed');
      }
    });
  }

  onArticleInfo(article: ArticleWithState): void {
    this.router.navigate(['/articles', article.id], {
      queryParams: { returnTo: `/lists/${this.listId}` }
    });
  }

  // Edit mode actions
  onSearchQueryChange(): void {
    this.searchQuery$.next(this.searchQuery.trim());
  }

  // Advanced color methods
  getCurrentListColor(): string {
    const currentList = this.getCurrentList();
    return currentList?.color || '#f44336';
  }

  getContrastColor(hexColor: string): string {
    const color = hexColor.replace('#', '');
    const r = parseInt(color.substr(0, 2), 16);
    const g = parseInt(color.substr(2, 2), 16);
    const b = parseInt(color.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  getLightColor(hexColor: string): string {
    const color = hexColor.replace('#', '');
    const r = parseInt(color.substr(0, 2), 16);
    const g = parseInt(color.substr(2, 2), 16);
    const b = parseInt(color.substr(4, 2), 16);
    const newR = Math.round(r * 0.15 + 255 * 0.85);
    const newG = Math.round(g * 0.15 + 255 * 0.85);
    const newB = Math.round(b * 0.15 + 255 * 0.85);
    const toHex = (n: number) => {
      const hex = n.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
  }

  private getCurrentList(): ShoppingList | undefined {
    let currentList: ShoppingList | undefined;
    this.list$.subscribe(list => currentList = list).unsubscribe();
    return currentList;
  }

  // Enhanced shopping mode methods
  getArticleAmount(article: ArticleWithState): string {
    const listAmount = this.getCurrentList()?.itemStates[article.id]?.amount;
    const amount = listAmount || article.amount || '';
    return amount.trim();
  }

  onEditAmountInShopping(article: ArticleWithState, event: Event): void {
    event.stopPropagation();
    
    const currentAmount = this.getArticleAmount(article);
    const newAmount = prompt(`Menge für ${article.name} bearbeiten:`, currentAmount);
    
    if (newAmount !== null) {
      this.dataService.updateListItemAmount(this.listId, article.id, newAmount.trim()).subscribe(() => {
        this.snackBar.open('Menge aktualisiert', 'OK', { duration: 1500 });
      });
    }
  }

  // Enhanced edit mode methods
  onEditAmount(article: ArticleWithToggleAndAmount): void {
    const currentAmount = article.listAmount || article.amount || '';
    const newAmount = prompt(`Menge für ${article.name} bearbeiten:`, currentAmount);
    
    if (newAmount !== null) {
      this.dataService.updateListItemAmount(this.listId, article.id, newAmount.trim()).subscribe(() => {
        this.snackBar.open('Menge aktualisiert', 'OK', { duration: 1500 });
      });
    }
  }

  onToggleArticleInList(article: ArticleWithToggleAndAmount): void {
    if (article.isInList) {
      this.dataService.removeArticleFromList(this.listId, article.id).subscribe(success => {
        if (success) {
          this.snackBar.open(`${article.name} entfernt`, 'OK', { duration: 1500 });
        }
      });
    } else {
      this.dataService.addArticleToList(this.listId, article.id).subscribe(success => {
        if (success) {
          this.snackBar.open(`${article.name} hinzugefügt`, 'OK', { duration: 1500 });
        }
      });
    }
  }

  // Enhanced action methods
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

  onCreateNewArticle(): void {
    this.router.navigate(['/articles/add']);
  }

  onEditList(): void {
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
}