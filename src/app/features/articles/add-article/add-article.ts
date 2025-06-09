import { Component, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil, take } from 'rxjs/operators';

import { DataService } from '../../../core/services/data';
import { ArticleFormComponent, ArticleFormData } from '../../../shared/components/article-form/article-form.component';

@Component({
  selector: 'app-add-article',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    ArticleFormComponent
  ],
  templateUrl: './add-article.html',
  styleUrls: ['./add-article.scss']
})
export class AddArticleComponent implements OnDestroy {
  isSaving = false;
  private destroy$ = new Subject<void>();

  constructor(
    private dataService: DataService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSave(formData: ArticleFormData): void {
    this.isSaving = true;

    // Check for duplicates first
    this.dataService.getArticles()
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe(articles => {
        const trimmedName = formData.name.trim().toLowerCase();
        const duplicate = articles.find(article => 
          article.name.trim().toLowerCase() === trimmedName
        );

        if (duplicate) {
          this.isSaving = false;
          this.snackBar.open(
            `Ein Artikel mit dem Namen "${formData.name}" existiert bereits.`,
            'OK', { duration: 5000 }
          );
          return;
        }

        // Create the article
        const newArticle = {
          name: formData.name,
          amount: formData.amount || undefined,
          notes: formData.notes || undefined,
          icon: formData.icon,
          departmentId: formData.departmentId || undefined
        };

        this.dataService.createArticle(newArticle)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (createdArticle) => {
              this.isSaving = false;
              this.snackBar.open('Artikel erfolgreich erstellt', 'OK', { duration: 2000 });
              
              const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
              const listId = this.route.snapshot.queryParamMap.get('listId');
              
              // Add to list if specified
              if (listId && createdArticle) {
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
              this.snackBar.open('Fehler beim Erstellen', 'OK', { duration: 3000 });
            }
          });
      });
  }

  onCancel(): void {
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    this.navigateBack(returnTo);
  }

  onBack(): void {
    this.onCancel();
  }

  private navigateBack(returnTo?: string | null): void {
    if (returnTo) {
      this.router.navigateByUrl(returnTo);
    } else {
      this.router.navigate(['/articles']);
    }
  }
}