import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, combineLatest, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';

import { ShoppingList, Article } from '../../../core/models';
import { DataService } from '../../../core/services/data';

interface ArticleWithToggle extends Article {
  isInList: boolean;
}

@Component({
  selector: 'app-add-articles-to-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatSnackBarModule
  ],
  templateUrl: './add-articles.html',
  styleUrls: ['./add-articles.scss']
})
export class AddArticlesToListComponent implements OnInit {
  listId: string;
  list$: Observable<ShoppingList | undefined>;
  articlesWithToggle$: Observable<ArticleWithToggle[]>;
  
  private articleStatesSubject = new BehaviorSubject<{[articleId: string]: boolean}>({});
  
  isLoading = true;
  hasChanges = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dataService: DataService,
    private snackBar: MatSnackBar
  ) {
    this.listId = this.route.snapshot.paramMap.get('id') || '';
    this.list$ = this.dataService.getList(this.listId);
    
    this.articlesWithToggle$ = combineLatest([
      this.list$,
      this.dataService.getArticles(),
      this.articleStatesSubject
    ]).pipe(
      map(([list, allArticles, articleStates]) => {
        if (!list) return [];
        
        return allArticles
          .map(article => ({
            ...article,
            isInList: articleStates[article.id] !== undefined 
              ? articleStates[article.id] 
              : list.articleIds.includes(article.id)
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

  onArticleToggle(article: ArticleWithToggle, isChecked: boolean): void {
    const currentStates = this.articleStatesSubject.value;
    this.articleStatesSubject.next({
      ...currentStates,
      [article.id]: isChecked
    });
    this.hasChanges = true;
  }

  /**
   * 🎯 FIXED: Use existing updateList method with proper active state
   */
  onSave(): void {
    console.log('🎯 Starting save operation...');
    
    this.list$.subscribe(list => {
      if (!list) {
        console.error('❌ No list found');
        return;
      }
      
      console.log('🎯 Current list:', list.name);
      console.log('🎯 Current articleIds:', list.articleIds);
      console.log('🎯 Current itemStates:', list.itemStates);
      
      const articleStates = this.articleStatesSubject.value;
      const newArticleIds: string[] = [];
      const addedArticleIds: string[] = []; // Track newly added articles
      
      this.articlesWithToggle$.subscribe(articles => {
        console.log('🎯 Processing articles for save...');
        
        articles.forEach(article => {
          const isInList = articleStates[article.id] !== undefined 
            ? articleStates[article.id] 
            : list.articleIds.includes(article.id);
            
          if (isInList) {
            newArticleIds.push(article.id);
            
            // Check if this is a newly added article
            if (!list.articleIds.includes(article.id)) {
              addedArticleIds.push(article.id);
              console.log(`🎯 New article detected: ${article.name} (${article.id})`);
            }
          }
        });
      }).unsubscribe();
      
      console.log('🎯 Final articleIds:', newArticleIds);
      console.log('🎯 Newly added articles:', addedArticleIds);
      
      // 🎯 FIXED: Create item states preserving existing states and ensuring new articles are active
      const newItemStates: { [articleId: string]: any } = {};
      
      newArticleIds.forEach(articleId => {
        if (addedArticleIds.includes(articleId)) {
          // 🎯 NEW ARTICLES: Explicitly set as ACTIVE (isChecked: false)
          newItemStates[articleId] = { 
            articleId, 
            isChecked: false, // 🎯 FALSE = ACTIVE/NOT STRIKED OUT
            amount: '' // Default empty amount
          };
          console.log(`✅ Set new article ${articleId} as ACTIVE (isChecked: false)`);
        } else {
          // 🎯 EXISTING ARTICLES: Preserve existing state or default to active
          newItemStates[articleId] = list.itemStates[articleId] || { 
            articleId, 
            isChecked: false,
            amount: ''
          };
          console.log(`🔄 Preserved existing state for article ${articleId}:`, newItemStates[articleId]);
        }
      });

      console.log('🔍 Final item states:', newItemStates);

      // 🎯 FIXED: Use existing updateList method (no permissions issues)
      this.dataService.updateList(this.listId, {
        articleIds: newArticleIds,
        itemStates: newItemStates
      }).subscribe({
        next: (updatedList) => {
          if (updatedList) {
            const addedCount = addedArticleIds.length;
            const message = addedCount > 0 
              ? `Liste aktualisiert - ${addedCount} neue Artikel hinzugefügt` 
              : 'Liste aktualisiert';
            
            console.log(`✅ Successfully updated list: ${message}`);
            this.snackBar.open(message, 'OK', { duration: 3000 });
            this.router.navigate(['/lists', this.listId]);
          } else {
            console.error('❌ updateList returned null/undefined');
            this.snackBar.open('Fehler beim Aktualisieren', '', { duration: 3000 });
          }
        },
        error: (error) => {
          console.error('❌ Error updating list:', error);
          this.snackBar.open('Fehler beim Aktualisieren der Liste', '', { duration: 3000 });
        }
      });
    }).unsubscribe();
  }

  onCancel(): void {
    this.router.navigate(['/lists', this.listId]);
  }

  onBack(): void {
    this.router.navigate(['/lists', this.listId]);
  }

  onGoToArticles(): void {
    this.router.navigate(['/articles']);
  }

  getSelectedCount(): number {
    let count = 0;
    this.articlesWithToggle$.subscribe(articles => {
      count = articles.filter(article => article.isInList).length;
    }).unsubscribe();
    return count;
  }
}