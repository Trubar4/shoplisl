import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { map, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { Article } from '../../../core/models';
import { DataService } from '../../../core/services/data';

@Component({
  selector: 'app-article-overview',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './article-overview.html',
  styleUrls: ['./article-overview.scss']
})
export class ArticleOverviewComponent implements OnInit {
  searchQuery$ = new BehaviorSubject<string>('');
  filteredArticles$: Observable<Article[]>;
  searchQuery = '';
  
  constructor(
    private dataService: DataService,
    private router: Router
  ) {
    // Combine articles with search query for filtering
    this.filteredArticles$ = combineLatest([
      this.dataService.getArticles(),
      this.searchQuery$.pipe(
        debounceTime(300),
        distinctUntilChanged()
      )
    ]).pipe(
      map(([articles, query]) => {
        if (!query.trim()) {
          return articles.sort((a, b) => a.name.localeCompare(b.name));
        }
        
        return articles
          .filter(article =>
            article.name.toLowerCase().includes(query.toLowerCase().trim())
          )
          .sort((a, b) => a.name.localeCompare(b.name));
      })
    );
  }

  ngOnInit(): void {}

  onSearchQueryChange(): void {
    this.searchQuery$.next(this.searchQuery.trim());
  }

  onArticleClick(article: Article): void {
    this.router.navigate(['/articles', article.id]);
  }

  onAddArticle(): void {
    this.router.navigate(['/articles/add']);
  }

  onAddNewArticleFromSearch(): void {
    // If there's a search query, pre-fill the name
    if (this.searchQuery.trim()) {
      this.router.navigate(['/articles/add'], {
        queryParams: { name: this.searchQuery.trim() }
      });
    } else {
      this.router.navigate(['/articles/add']);
    }
  }
}