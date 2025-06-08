import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject } from 'rxjs';
import { takeUntil, take } from 'rxjs/operators';

import { DataService } from '../../../core/services/data';

@Component({
  selector: 'app-add-article',
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
    MatProgressSpinnerModule
  ],
  templateUrl: './add-article.html',
  styleUrls: ['./add-article.scss']
})
export class AddArticleComponent implements OnInit, OnDestroy {
  article = {
    name: '',
    amount: '',
    notes: '',
    icon: '📦'
  };
  
  isSaving = false;
  private destroy$ = new Subject<void>();

  // Common emojis for quick selection
  commonEmojis = [
    '🍎', '🍌', '🍓', '🥝', '🍊', '🍇', '🥕', '🥬',
    '🍞', '🥛', '🧀', '🥚', '🍖', '🐟', '🍝', '🍚',
    '☕', '🧴', '🧽', '🧻', '💊', '🧴', '📱', '📦'
  ];

  constructor(
    private dataService: DataService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Component initialization if needed
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

    // Get current articles ONCE to check for duplicates
    this.dataService.getArticles()
      .pipe(
        take(1), // Only take the current snapshot, don't listen for updates
        takeUntil(this.destroy$)
      )
      .subscribe(articles => {
        // Check for duplicates
        const trimmedName = this.article.name.trim().toLowerCase();
        const duplicate = articles.find(article => 
          article.name.trim().toLowerCase() === trimmedName
        );

        if (duplicate) {
          this.isSaving = false;
          alert(`Ein Artikel mit dem Namen "${this.article.name}" existiert bereits. Bitte wählen Sie einen anderen Namen.`);
          return;
        }

        // No duplicate, create the article
        const newArticle = {
          name: this.article.name.trim(),
          amount: this.article.amount.trim() || undefined,
          notes: this.article.notes.trim() || undefined,
          icon: this.article.icon || '📦'
        };

        this.dataService.createArticle(newArticle)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (createdArticle) => {
              this.isSaving = false;
              this.snackBar.open('Artikel erfolgreich erstellt', 'OK', { duration: 2000 });
              
              // Check if we should return to a specific list
              const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
              const listId = this.route.snapshot.queryParamMap.get('listId');
              
              if (listId && createdArticle) {
                // Add the new article to the specified list
                this.dataService.addArticleToList(listId, createdArticle.id)
                  .pipe(takeUntil(this.destroy$))
                  .subscribe(addSuccess => {
                    if (addSuccess) {
                      this.snackBar.open('Artikel zur Liste hinzugefügt', 'OK', { duration: 2000 });
                    }
                    this.navigateBack(returnTo);
                  });
              } else {
                this.navigateBack(returnTo);
              }
            },
            error: (error) => {
              this.isSaving = false;
              console.error('Error creating article:', error);
              this.snackBar.open('Fehler beim Erstellen des Artikels', 'OK', { duration: 3000 });
            }
          });
      });
  }

  private navigateBack(returnTo?: string | null): void {
    if (returnTo) {
      this.router.navigateByUrl(returnTo);
    } else {
      this.router.navigate(['/articles']);
    }
  }

  onCancel(): void {
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    this.navigateBack(returnTo);
  }

  onBack(): void {
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    this.navigateBack(returnTo);
  }

  hasValidData(): boolean {
    return this.article.name.trim().length > 0;
  }
}