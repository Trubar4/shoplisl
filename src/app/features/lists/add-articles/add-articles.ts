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
  selector: 'app-add-articles',
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
export class AddArticlesComponent implements OnInit {
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

  onSave(): void {
    this.list$.subscribe(list => {
      if (!list) return;
      
      const articleStates = this.articleStatesSubject.value;
      const newArticleIds: string[] = [];
      
      this.articlesWithToggle$.subscribe(articles => {
        articles.forEach(article => {
          const isInList = articleStates[article.id] !== undefined 
            ? articleStates[article.id] 
            : list.articleIds.includes(article.id);
            
          if (isInList) {
            newArticleIds.push(article.id);
          }
        });
      }).unsubscribe();
      
    const newItemStates: { [articleId: string]: any } = {};
    newArticleIds.forEach(articleId => {
    newItemStates[articleId] = { articleId, isChecked: false };
    });

    this.dataService.updateList(this.listId, {
    articleIds: newArticleIds,
    itemStates: newItemStates
    }).subscribe(updatedList => {
        if (updatedList) {
          this.snackBar.open('Liste aktualisiert', 'OK', { duration: 2000 });
          this.router.navigate(['/lists', this.listId]);
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