import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { Article, ShoppingList } from '../../../core/models';
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
    MatChipsModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './article-detail.html',
  styleUrls: ['./article-detail.scss']
})
export class ArticleDetailComponent implements OnInit, OnDestroy {
  articleId: string;
  article = {
    name: '',
    amount: '',
    notes: '',
    icon: ''
  };
  
  originalArticle: Article | null = null;
  isLoading = true;
  isSaving = false;
  isDeleting = false;
  
  // Lists containing this article
  containingLists$: Observable<ShoppingList[]>;
  private destroy$ = new Subject<void>();

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
    private snackBar: MatSnackBar
  ) {
    this.articleId = this.route.snapshot.paramMap.get('id') || '';
    this.containingLists$ = this.dataService.getListsContainingArticle(this.articleId);
  }

  ngOnInit(): void {
    this.loadArticle();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadArticle(): void {
    this.dataService.getArticle(this.articleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(article => {
        if (article) {
          this.originalArticle = article;
          this.article = {
            name: article.name,
            amount: article.amount || '',
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

    this.isSaving = true;

    const updates = {
      name: this.article.name.trim(),
      amount: this.article.amount.trim() || undefined,
      notes: this.article.notes.trim() || undefined,
      icon: this.article.icon || '📦'
    };

    this.dataService.updateArticleWithDuplicateCheck(this.articleId, updates)
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isSaving = false;
        
        if (result.success) {
          this.snackBar.open('Artikel erfolgreich aktualisiert', 'OK', { duration: 2000 });
          this.router.navigate(['/articles']);
        } else if (result.isDuplicate) {
          alert(`Ein Artikel mit dem Namen "${this.article.name}" existiert bereits. Bitte wählen Sie einen anderen Namen.`);
        } else {
          this.snackBar.open(result.error || 'Fehler beim Aktualisieren', 'OK', { duration: 3000 });
        }
      });
  }

  onDelete(): void {
    this.isDeleting = true;

    // First check if article is active in any lists
    this.dataService.getListsWithActiveArticle(this.articleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(activeInLists => {
        this.isDeleting = false;

        if (activeInLists.length > 0) {
          const listNames = activeInLists.map(list => list.name).join(', ');
          alert(`Der Artikel "${this.article.name}" ist noch aktiv in folgenden Listen: ${listNames}. Entfernen Sie den Artikel zuerst aus diesen Listen oder setzen Sie ihn auf "erledigt".`);
        } else {
          this.showDeleteConfirmation();
        }
      });
  }

  private showDeleteConfirmation(): void {
    const confirmed = confirm(`Möchten Sie "${this.article.name}" wirklich löschen? Der Artikel wird auch aus allen Listen entfernt, in denen er als erledigt markiert ist.`);
    
    if (confirmed) {
      this.performDelete();
    }
  }

  private performDelete(): void {
    this.isDeleting = true;

    this.dataService.deleteArticleAndCleanupLists(this.articleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isDeleting = false;

        if (result.success) {
          this.snackBar.open('Artikel erfolgreich gelöscht', 'OK', { duration: 2000 });
          this.router.navigate(['/articles']);
        } else if (result.activeInLists) {
          // This shouldn't happen since we already checked, but just in case
          this.snackBar.open('Artikel ist noch in aktiven Listen', 'OK', { duration: 3000 });
        } else {
          this.snackBar.open(result.error || 'Fehler beim Löschen', 'OK', { duration: 3000 });
        }
      });
  }

  onRemoveFromList(list: ShoppingList): void {
    const confirmed = confirm(`Möchten Sie "${this.article.name}" aus der Liste "${list.name}" entfernen?`);
    
    if (confirmed) {
      this.dataService.removeArticleFromList(list.id, this.articleId)
        .pipe(takeUntil(this.destroy$))
        .subscribe(success => {
          if (success) {
            this.snackBar.open(`Aus "${list.name}" entfernt`, 'OK', { duration: 2000 });
          } else {
            this.snackBar.open('Fehler beim Entfernen', 'OK', { duration: 3000 });
          }
        });
    }
  }

  onCancel(): void {
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    if (returnTo) {
      this.router.navigateByUrl(returnTo);
    } else {
      this.router.navigate(['/articles']);
    }
  }

  onBack(): void {
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    const mode = this.route.snapshot.queryParamMap.get('mode');
    
    if (returnTo) {
      if (mode) {
        this.router.navigate([returnTo], { queryParams: { mode: mode } });
      } else {
        this.router.navigateByUrl(returnTo);
      }
    } else {
      this.router.navigate(['/articles']);
    }
  }

  hasChanges(): boolean {
    if (!this.originalArticle) return false;
    
    return this.article.name !== this.originalArticle.name ||
           this.article.amount !== (this.originalArticle.amount || '') ||
           this.article.notes !== (this.originalArticle.notes || '') ||
           this.article.icon !== this.originalArticle.icon;
  }
}