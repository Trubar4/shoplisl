import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Store } from '@ngrx/store';
import { Subject } from 'rxjs';
import { takeUntil, take, filter } from 'rxjs/operators';
import { Actions, ofType } from '@ngrx/effects';

import { AppState } from '../../../state/app.state';
import * as ArticlesActions from '../../../state/articles/articles.actions';
import * as ListsActions from '../../../state/lists/lists.actions';
import { selectAllArticles } from '../../../state/articles/articles.selectors';
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
    private store: Store<AppState>,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private actions$: Actions
  ) {}

  ngOnInit(): void {
    const articleId = this.route.snapshot.paramMap.get('id');
    if (!articleId) {
      this.router.navigate(['/articles']);
      return;
    }

    // Dispatch load action
    this.store.dispatch(ArticlesActions.loadArticles());

    // Get article from NgRx store
    this.store.select(selectAllArticles)
      .pipe(takeUntil(this.destroy$))
      .subscribe(articles => {
        this.article = articles.find(a => a.id === articleId);
        this.isLoading = false;

        if (!this.article) {
          console.warn('Article not found:', articleId);
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

    const changes: Partial<Article> = {
      name: formData.name,
      amount: formData.amount || undefined,
      notes: formData.notes || undefined,
      icon: formData.icon,
      departmentId: formData.departmentId || undefined
    };

    // Dispatch NgRx action to update article
    this.store.dispatch(ArticlesActions.updateArticle({
      articleId: this.article.id,
      changes
    }));

    // Optimistic UI update
    this.isSaving = false;
    this.snackBar.open('Artikel erfolgreich aktualisiert', 'OK', { duration: 2000 });
    this.onBack();
  }

  onDelete(): void {
    if (!this.article) return;

    const confirmed = confirm(
      `Möchten Sie "${this.article.name}" wirklich löschen? ` +
      `Der Artikel wird auch aus allen Listen entfernt.`
    );

    if (confirmed) {
      this.isDeleting = true;
      const articleId = this.article.id;

      // Dispatch NgRx action to delete article with cleanup
      this.store.dispatch(ArticlesActions.deleteArticleWithCleanup({ articleId }));

      // Wait for success or failure action
      this.actions$.pipe(
        ofType(
          ArticlesActions.deleteArticleWithCleanupSuccess,
          ArticlesActions.deleteArticleWithCleanupFailure
        ),
        filter((action: any) => {
          // Only handle the action for this specific article
          return action.articleId === articleId || action.error;
        }),
        take(1)
      ).subscribe((action: any) => {
        this.isDeleting = false;

        if (action.type === ArticlesActions.deleteArticleWithCleanupSuccess.type) {
          this.snackBar.open('Artikel erfolgreich gelöscht', 'OK', { duration: 2000 });
          this.navigateAfterDelete();
        } else {
          // Deletion failed
          console.error('❌ Article deletion failed:', action.error);
          this.snackBar.open(
            `Fehler beim Löschen: ${action.error}`,
            'OK',
            { duration: 5000 }
          );
        }
      });
    }
  }

  onRemoveFromList(list: ShoppingList): void {
    if (!this.article) return;

    // Dispatch NgRx action to remove article from list
    this.store.dispatch(ListsActions.removeArticleFromList({
      listId: list.id,
      articleId: this.article.id
    }));

    // Optimistic UI update
    this.snackBar.open(`Aus "${list.name}" entfernt`, 'OK', { duration: 2000 });
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

  /**
   * ✨ NEW: Smart navigation after deletion
   * Uses the same logic as onBack() to return to the source page
   */
  private navigateAfterDelete(): void {
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    if (returnTo) {
      console.log('🔄 Navigating back to source:', returnTo);
      this.router.navigateByUrl(returnTo);
    } else {
      console.log('🔄 No returnTo parameter, going to articles overview');
      this.router.navigate(['/articles']);
    }
  }
}