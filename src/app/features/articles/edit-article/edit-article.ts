import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { DataService } from '../../../core/services/data';
import { Article, ShoppingList } from '../../../core/models';
import { ArticleFormComponent, ArticleFormData } from '../../../shared/components/article-form/article-form.component';

@Component({
  selector: 'app-edit-article',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    ArticleFormComponent
  ],
  templateUrl: './edit-article.html',
  styleUrls: ['./edit-article.scss']
})
export class EditArticleComponent implements OnInit, OnDestroy {
  article: Article | undefined = undefined;
  isLoading = true;
  isSaving = false;
  isDeleting = false;
  private destroy$ = new Subject<void>();

  constructor(
    private dataService: DataService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const articleId = this.route.snapshot.paramMap.get('id');
    if (!articleId) {
      this.router.navigate(['/articles']);
      return;
    }

    this.dataService.getArticle(articleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (article) => {
            this.article = article || undefined;
            this.isLoading = false;
          },
        error: (error) => {
          console.error('Error loading article:', error);
          this.article = undefined;;
          this.isLoading = false;
          this.snackBar.open('Fehler beim Laden', 'OK', { duration: 3000 });
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSave(formData: ArticleFormData): void {
    if (!this.article) return;

    this.isSaving = true;

    const updatedArticle = {
      ...this.article,
      name: formData.name,
      amount: formData.amount || undefined,
      notes: formData.notes || undefined,
      icon: formData.icon,
      departmentId: formData.departmentId || undefined
    };

    this.dataService.updateArticle(this.article.id, updatedArticle)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.snackBar.open('Artikel erfolgreich aktualisiert', 'OK', { duration: 2000 });
          this.onBack();
        },
        error: (error) => {
          this.isSaving = false;
          console.error('Error updating article:', error);
          this.snackBar.open('Fehler beim Aktualisieren', 'OK', { duration: 3000 });
        }
      });
  }

  onDelete(): void {
    if (!this.article) return;

    const confirmed = confirm(
      `Möchten Sie "${this.article.name}" wirklich löschen? ` +
      `Der Artikel wird auch aus allen Listen entfernt.`
    );
    
    if (confirmed) {
      this.isDeleting = true;

      this.dataService.deleteArticle(this.article.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.isDeleting = false;
            this.snackBar.open('Artikel erfolgreich gelöscht', 'OK', { duration: 2000 });
            this.router.navigate(['/articles']);
          },
          error: (error) => {
            this.isDeleting = false;
            console.error('Error deleting article:', error);
            this.snackBar.open('Fehler beim Löschen', 'OK', { duration: 3000 });
          }
        });
    }
  }

  onRemoveFromList(list: ShoppingList): void {
    if (!this.article) return;

    this.dataService.removeArticleFromList(list.id, this.article.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(success => {
        if (success) {
          this.snackBar.open(`Aus "${list.name}" entfernt`, 'OK', { duration: 2000 });
        } else {
          this.snackBar.open('Fehler beim Entfernen', 'OK', { duration: 3000 });
        }
      });
  }

  onCancel(): void {
    this.onBack();
  }

  onBack(): void {
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    if (returnTo) {
      this.router.navigateByUrl(returnTo);
    } else {
      this.router.navigate(['/articles']);
    }
  }
}