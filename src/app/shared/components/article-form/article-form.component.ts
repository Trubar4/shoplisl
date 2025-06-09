// src/app/shared/components/article-form/article-form.component.ts
import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { Subject, Observable } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { Article, Department, ShoppingList } from '../../../core/models';
import { DepartmentService } from '../../../core/services/department.service';
import { DataService } from '../../../core/services/data';

export interface ArticleFormData {
  name: string;
  amount?: string;
  notes?: string;
  icon: string;
  departmentId?: string;
}

@Component({
  selector: 'app-article-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatCardModule,
    MatChipsModule
  ],
  templateUrl: './article-form.component.html',
  styleUrls: ['./article-form.component.scss']
})
export class ArticleFormComponent implements OnInit, OnDestroy {
  @Input() article: Article | null = null; // For edit mode
  @Input() isEditMode = false;
  @Input() isSubmitting = false;
  @Input() isDeleting = false;
  
  @Output() formSubmit = new EventEmitter<ArticleFormData>();
  @Output() formCancel = new EventEmitter<void>();
  @Output() formDelete = new EventEmitter<void>();
  @Output() removeFromList = new EventEmitter<ShoppingList>();

  formData: ArticleFormData = {
    name: '',
    amount: '',
    notes: '',
    icon: '📦',
    departmentId: undefined
  };

  departments: Department[] = [];
  containingLists$: Observable<ShoppingList[]> | null = null;
  private destroy$ = new Subject<void>();

  commonEmojis = [
    '🍎', '🍌', '🍓', '🥝', '🍊', '🍇', '🥕', '🥬',
    '🍞', '🥛', '🧀', '🥚', '🍖', '🐟', '🍝', '🍚',
    '☕', '🧴', '🧽', '🧻', '💊', '🧴', '📱', '📦'
  ];

  constructor(
    private departmentService: DepartmentService,
    private dataService: DataService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadDepartments();
    
    if (this.article) {
      this.populateForm();
      
      // Load lists containing this article (edit mode only)
      if (this.isEditMode) {
        this.containingLists$ = this.dataService.getListsContainingArticle(this.article.id);
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadDepartments(): void {
    this.departmentService.getDepartments()
      .pipe(takeUntil(this.destroy$))
      .subscribe(departments => {
        this.departments = departments;
      });
  }

  private populateForm(): void {
    if (this.article) {
      this.formData = {
        name: this.article.name,
        amount: this.article.amount || '',
        notes: this.article.notes || '',
        icon: this.article.icon || '📦',
        departmentId: this.article.departmentId
      };
    }
  }

  onEmojiSelect(emoji: string): void {
    this.formData.icon = emoji;
  }

  onDepartmentSelected(departmentId: string | null): void {
    this.formData.departmentId = departmentId || undefined;
  }

  getDepartmentIconPath(iconFilename: string): string {
    return `/icons/${iconFilename}`;
  }

  onSubmit(): void {
    if (!this.formData.name.trim()) {
      this.snackBar.open('Name ist erforderlich', 'OK', { duration: 3000 });
      return;
    }

    const submitData: ArticleFormData = {
      name: this.formData.name.trim(),
      amount: this.formData.amount?.trim() || undefined,
      notes: this.formData.notes?.trim() || undefined,
      icon: this.formData.icon || '📦',
      departmentId: this.formData.departmentId
    };

    this.formSubmit.emit(submitData);
  }

  onCancel(): void {
    this.formCancel.emit();
  }

  onDelete(): void {
    this.formDelete.emit();
  }

  onRemoveFromList(list: ShoppingList): void {
    const confirmed = confirm(`Möchten Sie "${this.formData.name}" aus der Liste "${list.name}" entfernen?`);
    
    if (confirmed) {
      this.removeFromList.emit(list);
    }
  }

  hasValidData(): boolean {
    return this.formData.name.trim().length > 0;
  }

  hasChanges(): boolean {
    if (!this.article) return true; // New article always has "changes"
    
    return this.formData.name !== this.article.name ||
           this.formData.amount !== (this.article.amount || '') ||
           this.formData.notes !== (this.article.notes || '') ||
           this.formData.icon !== this.article.icon ||
           this.formData.departmentId !== this.article.departmentId;
  }

  getSelectedDepartment(): Department | null {
    if (!this.formData.departmentId) return null;
    return this.departments.find(d => d.id === this.formData.departmentId) || null;
  }
}