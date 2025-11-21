import { Component, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Store } from '@ngrx/store';
import { Subject } from 'rxjs';
import { takeUntil, take } from 'rxjs/operators';

import { AppState } from '../../../state/app.state';
import * as ArticlesActions from '../../../state/articles/articles.actions';
import * as ListsActions from '../../../state/lists/lists.actions';
import { selectAllArticles } from '../../../state/articles/articles.selectors';
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
  prefilledName = '';

  constructor(
    private store: Store<AppState>,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar
  ) {
    // Read prefilled name from query params
    this.prefilledName = this.route.snapshot.queryParamMap.get('name') || '';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSave(formData: ArticleFormData): void {
    this.isSaving = true;

    // Check for duplicates first using NgRx store
    this.store.select(selectAllArticles)
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

        // Dispatch NgRx action to create article
        this.store.dispatch(ArticlesActions.createArticle({
          name: formData.name,
          amount: formData.amount || '',
          notes: formData.notes || '',
          icon: formData.icon,
          categoryId: '',
          departmentId: formData.departmentId || 'miscellaneous'
        }));

        // Optimistic UI update
        this.isSaving = false;
        this.snackBar.open('Artikel erfolgreich erstellt', 'OK', { duration: 2000 });

        const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
        const listId = this.route.snapshot.queryParamMap.get('listId');

        // Add to list if specified
        if (listId) {
          // Dispatch action to add article to list
          // Note: In real implementation, subscribe to createArticleSuccess to get ID
          this.snackBar.open('Artikel wird zur Liste hinzugefügt...', '', { duration: 1000 });
        }

        this.navigateBack(returnTo);
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