import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { Article } from '../../../core/models';
import { DataService } from '../../../core/services/data';

@Component({
  selector: 'app-article-overview',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './article-overview.html',
  styleUrls: ['./article-overview.scss']
})
export class ArticleOverviewComponent implements OnInit {
  articles$: Observable<Article[]>;
  
  constructor(
    private dataService: DataService,
    private router: Router
  ) {
    this.articles$ = this.dataService.getArticles();
  }

  ngOnInit(): void {}

  onArticleClick(article: Article): void {
    // Navigate to article detail (we'll implement this next)
    console.log('Article clicked:', article);
  }

  onAddArticle(): void {
    this.router.navigate(['/articles/add']);
  }
}