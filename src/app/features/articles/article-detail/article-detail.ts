import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';

import { Article } from '../../../core/models';
import { DataService } from '../../../core/services/data';

@Component({
  selector: 'app-article-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatDialogModule
  ],
  templateUrl: './article-detail.html',
  styleUrls: ['./article-detail.scss']
})
export class ArticleDetailComponent implements OnInit {
  articleId: string;
  article = {
    name: '',
    amount: '',
    notes: '',
    icon: ''
  };
  
  originalArticle: Article | null = null;
  isLoading = true;

  // Common emojis for quick selection
  commonEmojis = [
    '🍎', '🍌', '🍓', '🥝', '🍊', '🍇', '🥕', '🥬',
    '🍞', '🥛', '🧀', '🥚', '🍖', '🐟', '🍝', '🍚',
    '☕', '🧴', '🧽', '🧻', '💊', '🧴', '📱', '📦'
  ];

  constructor(
    private route: ActivatedRoute,
    private dataService: DataService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.articleId = this.route.snapshot.paramMap.get('id') || '';
  }

  ngOnInit(): void {
    this.loadArticle();
  }

  private loadArticle(): void {
    this.dataService.getArticle(this.articleId).subscribe(article => {
      if (article) {
        this.originalArticle = article;
        this.article = {
          name: article.name,
          amount: article.amount || '', // Add this line
          notes: article.notes || '',
          icon: article.icon || '📦'
        };
      } else {
        this.snackBar.open('Artikel nicht gefunden', 'OK', { duration: 3000 });
        this.router.navigate(['/articles']);
      }
      this.isLoading = false;
    });
  }

  onEmojiSelect(emoji: string): void {
    this.article.icon = emoji;
  }

  onSave(): void {
    if (!this.article.name.trim()) {
      this.snackBar.open('Name ist erforderlich', 'OK', { duration: 3000 });
      return;
    }
  
    this.dataService.updateArticle(this.articleId, {
      name: this.article.name.trim(),
      amount: this.article.amount.trim() || undefined, // Add this line
      notes: this.article.notes.trim() || undefined,
      icon: this.article.icon || '📦'
    }).subscribe(updatedArticle => {
      if (updatedArticle) {
        this.snackBar.open('Artikel erfolgreich aktualisiert', 'OK', { duration: 2000 });
        this.router.navigate(['/articles']);
      } else {
        this.snackBar.open('Fehler beim Aktualisieren', 'OK', { duration: 3000 });
      }
    });
  }

  onDelete(): void {
    // Simple confirm dialog using browser confirm for now
    const confirmed = confirm(`Möchten Sie "${this.article.name}" wirklich löschen?`);
    
    if (confirmed) {
      this.dataService.deleteArticle(this.articleId).subscribe(success => {
        if (success) {
          this.snackBar.open('Artikel erfolgreich gelöscht', 'OK', { duration: 2000 });
          this.router.navigate(['/articles']);
        } else {
          this.snackBar.open('Fehler beim Löschen', 'OK', { duration: 3000 });
        }
      });
    }
  }

  onCancel(): void {
    this.router.navigate(['/articles']);
  }

  onBack(): void {
    // Check if there's a returnTo parameter
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    if (returnTo) {
      this.router.navigateByUrl(returnTo);
    } else {
      this.router.navigate(['/articles']);
    }
  }

  hasChanges(): boolean {
    if (!this.originalArticle) return false;
    
    return this.article.name !== this.originalArticle.name ||
           this.article.amount !== (this.originalArticle.amount || '') || // Add this line
           this.article.notes !== (this.originalArticle.notes || '') ||
           this.article.icon !== this.originalArticle.icon;
  }
}