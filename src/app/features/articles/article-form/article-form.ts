// src/app/features/articles/article-form/article-form.component.ts
import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { Article } from '../../../core/models';
import { DepartmentSelectorComponent } from '../../../shared/components/department-selector/department-selector.component';

@Component({
  selector: 'app-article-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatSnackBarModule,
    DepartmentSelectorComponent
  ],
  template: `
    <form [formGroup]="articleForm" (ngSubmit)="onSubmit()" class="article-form">
      
      <!-- Name Field -->
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Name*</mat-label>
        <input matInput 
               formControlName="name" 
               placeholder="z.B. Äpfel, Milch, Brot..."
               maxlength="100">
        <mat-icon matSuffix>shopping_cart</mat-icon>
        <mat-error *ngIf="articleForm.get('name')?.hasError('required')">
          Name ist erforderlich
        </mat-error>
        <mat-error *ngIf="articleForm.get('name')?.hasError('minlength')">
          Name muss mindestens 2 Zeichen haben
        </mat-error>
        <mat-error *ngIf="articleForm.get('name')?.hasError('maxlength')">
          Name darf maximal 100 Zeichen haben
        </mat-error>
      </mat-form-field>

      <!-- Amount Field -->
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Menge</mat-label>
        <input matInput 
               formControlName="amount" 
               placeholder="z.B. 3 Stück, 1 kg, 500ml..."
               maxlength="50">
        <mat-icon matSuffix>scale</mat-icon>
        <mat-hint>Optional: Menge oder Gewicht angeben</mat-hint>
      </mat-form-field>

      <!-- Department Selection -->
      <app-department-selector
        [selectedDepartmentId]="articleForm.get('departmentId')?.value"
        (departmentSelected)="onDepartmentSelected($event)">
      </app-department-selector>

      <!-- Icon Selection (Simplified for now) -->
      <div class="icon-section">
        <h3 class="section-title">Icon auswählen</h3>
        <div class="icon-selector">
          <div class="current-icon">
            <span class="icon-display">{{ articleForm.get('icon')?.value || '📦' }}</span>
            <span class="icon-label">Gewähltes Icon</span>
          </div>
          
          <div class="icon-grid">
            <button *ngFor="let iconOption of iconOptions" 
                    type="button"
                    class="icon-option"
                    [class.selected]="articleForm.get('icon')?.value === iconOption"
                    (click)="selectIcon(iconOption)">
              {{ iconOption }}
            </button>
          </div>
        </div>
      </div>

      <!-- Notes Field -->
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Notizen</mat-label>
        <textarea matInput 
                  formControlName="notes" 
                  placeholder="Zusätzliche Informationen..."
                  rows="3"
                  maxlength="500"></textarea>
        <mat-icon matSuffix>note</mat-icon>
        <mat-hint>Optional: Notizen zum Artikel</mat-hint>
        <mat-error *ngIf="articleForm.get('notes')?.hasError('maxlength')">
          Notizen dürfen maximal 500 Zeichen haben
        </mat-error>
      </mat-form-field>

      <!-- Action Buttons -->
      <div class="form-actions">
        <button type="button" 
                mat-button 
                (click)="onCancel()"
                class="cancel-button">
          <mat-icon>cancel</mat-icon>
          Abbrechen
        </button>
        
        <button type="submit" 
                mat-raised-button 
                color="primary"
                [disabled]="articleForm.invalid || isSubmitting"
                class="submit-button">
          <mat-icon>{{ isEditMode ? 'save' : 'add' }}</mat-icon>
          {{ isEditMode ? 'Speichern' : 'Artikel hinzufügen' }}
        </button>
      </div>

      <!-- Loading/Error States -->
      <div *ngIf="isSubmitting" class="loading-state">
        <mat-icon class="spinning">refresh</mat-icon>
        <span>Artikel wird gespeichert...</span>
      </div>

    </form>
  `,
  styles: [`
    .article-form {
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 16px;
      max-width: 600px;
      margin: 0 auto;
    }

    .full-width {
      width: 100%;
    }

    .section-title {
      margin: 0 0 12px 0;
      font-size: 1.1rem;
      font-weight: 500;
      color: var(--mdc-theme-on-surface, #1a1a1a);
    }

    /* Icon Selection Styles */
    .icon-section {
      margin: 16px 0;
    }

    .icon-selector {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .current-icon {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 2px solid var(--mdc-theme-outline, #ddd);
      border-radius: 8px;
      background-color: var(--mdc-theme-surface-variant, #f5f5f5);
    }

    .icon-display {
      font-size: 32px;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: white;
      border-radius: 8px;
      border: 1px solid var(--mdc-theme-outline, #ddd);
    }

    .icon-label {
      font-size: 0.875rem;
      color: var(--mdc-theme-on-surface-variant, #666);
    }

    .icon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
      gap: 8px;
      max-height: 200px;
      overflow-y: auto;
      padding: 8px;
      border: 1px solid var(--mdc-theme-outline, #ddd);
      border-radius: 8px;
      background-color: var(--mdc-theme-surface, white);
    }

    .icon-option {
      width: 48px;
      height: 48px;
      border: 2px solid transparent;
      border-radius: 8px;
      background-color: var(--mdc-theme-surface-variant, #f5f5f5);
      cursor: pointer;
      font-size: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .icon-option:hover {
      transform: scale(1.05);
      background-color: var(--mdc-theme-primary-container, #e3f2fd);
    }

    .icon-option.selected {
      border-color: var(--mdc-theme-primary, #1976d2);
      background-color: var(--mdc-theme-primary-container, #e3f2fd);
    }

    /* Form Actions */
    .form-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 24px;
    }

    .cancel-button {
      min-width: 120px;
    }

    .submit-button {
      min-width: 160px;
    }

    /* Loading State */
    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px;
      color: var(--mdc-theme-primary, #1976d2);
      font-size: 0.875rem;
    }

    .spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Mobile Optimizations */
    @media (max-width: 600px) {
      .article-form {
        padding: 12px;
        gap: 16px;
      }

      .form-actions {
        flex-direction: column-reverse;
        gap: 8px;
      }

      .cancel-button,
      .submit-button {
        width: 100%;
        min-width: unset;
      }

      .icon-grid {
        grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
        max-height: 150px;
      }

      .icon-option {
        width: 40px;
        height: 40px;
        font-size: 20px;
      }
    }
  `]
})
export class ArticleFormComponent implements OnInit {
  @Input() article: Article | null = null; // For edit mode
  @Input() isEditMode = false;
  @Output() articleSaved = new EventEmitter<Article>();
  @Output() cancelled = new EventEmitter<void>();

  articleForm: FormGroup;
  isSubmitting = false;

  // Icon options for the article
  iconOptions = [
    '🍎', '🍌', '🍊', '🍇', '🍓', '🥕', '🥬', '🍞', 
    '🥛', '🧀', '🥩', '🐟', '🍝', '🍚', '🥫', '🍪',
    '🧴', '🧻', '🧽', '✏️', '📦', '🛒', '🏠', '🌍'
  ];

  constructor(private formBuilder: FormBuilder) {
    this.articleForm = this.createForm();
  }

  ngOnInit(): void {
    if (this.article && this.isEditMode) {
      this.populateForm(this.article);
    }
  }

  private createForm(): FormGroup {
    return this.formBuilder.group({
      name: ['', [
        Validators.required, 
        Validators.minLength(2),
        Validators.maxLength(100)
      ]],
      amount: ['', [Validators.maxLength(50)]],
      departmentId: [null], // Can be null for no department
      icon: ['📦'],
      notes: ['', [Validators.maxLength(500)]]
    });
  }

  private populateForm(article: Article): void {
    this.articleForm.patchValue({
      name: article.name,
      amount: article.amount || '',
      departmentId: article.departmentId || null,
      icon: article.icon || '📦',
      notes: article.notes || ''
    });
  }

  onDepartmentSelected(departmentId: string | null): void {
    this.articleForm.patchValue({ departmentId });
  }

  selectIcon(icon: string): void {
    this.articleForm.patchValue({ icon });
  }

  onSubmit(): void {
    if (this.articleForm.valid && !this.isSubmitting) {
      this.isSubmitting = true;
      
      const formValue = this.articleForm.value;
      
      const articleData: Partial<Article> = {
        name: formValue.name.trim(),
        amount: formValue.amount?.trim() || '',
        departmentId: formValue.departmentId || undefined,
        icon: formValue.icon || '📦',
        notes: formValue.notes?.trim() || ''
      };

      // Emit the article data
      // In your actual implementation, you would call the DataService here
      this.articleSaved.emit(articleData as Article);
      
      // Reset form if not in edit mode
      if (!this.isEditMode) {
        this.articleForm.reset({
          name: '',
          amount: '',
          departmentId: null,
          icon: '📦',
          notes: ''
        });
      }
      
      this.isSubmitting = false;
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}

// Usage example in add-article component:
// src/app/features/articles/add-article/add-article.component.ts (EXAMPLE)
/*
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Article } from '../../../core/models';
import { DataService } from '../../../core/services/data.ts';
import { ArticleFormComponent } from '../article-form/article-form.component';

@Component({
  selector: 'app-add-article',
  standalone: true,
  imports: [ArticleFormComponent],
  template: `
    <div class="add-article-container">
      <h1>Artikel hinzufügen</h1>
      <app-article-form
        [isEditMode]="false"
        (articleSaved)="onArticleSaved($event)"
        (cancelled)="onCancel()">
      </app-article-form>
    </div>
  `
})
export class AddArticleComponent {
  constructor(
    private dataService: DataService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  onArticleSaved(articleData: Partial<Article>): void {
    this.dataService.createArticleWithDuplicateCheck(articleData).subscribe({
      next: (result) => {
        if (result.success && result.article) {
          this.snackBar.open('Artikel erfolgreich hinzugefügt!', 'OK', { duration: 3000 });
          this.router.navigate(['/articles']);
        } else if (result.isDuplicate) {
          this.snackBar.open('Ein Artikel mit diesem Namen existiert bereits!', 'OK', { duration: 5000 });
        } else {
          this.snackBar.open(result.error || 'Fehler beim Hinzufügen', 'OK', { duration: 5000 });
        }
      },
      error: (error) => {
        console.error('Error creating article:', error);
        this.snackBar.open('Unerwarteter Fehler', 'OK', { duration: 5000 });
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/articles']);
  }
}
*/