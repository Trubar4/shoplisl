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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import { takeUntil, take } from 'rxjs/operators';

import { Article, Department, ShoppingList, CheckEvent } from '../../../core/models';
import { DepartmentService } from '../../../core/services/department.service';
import { DataService } from '../../../core/services/data.service';
import { ArticleStatsService, ArticleStats } from '../../../core/services/article-stats.service';
import { HistoryService } from '../../../core/services/history.service';
import { DateChipComponent } from '../date-chip/date-chip.component';
import { CountChipComponent } from '../count-chip/count-chip.component';
import { DateEditDialogComponent, DateEditDialogData, DateEditDialogResult } from '../date-edit-dialog/date-edit-dialog.component';
import { NumberEditDialogComponent, NumberEditDialogData, NumberEditDialogResult } from '../number-edit-dialog/number-edit-dialog.component';
import { AppState } from '../../../state/app.state';
import { selectAllLists } from '../../../state/lists/lists.selectors';

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
    MatChipsModule,
    MatDialogModule,
    DateChipComponent,
    CountChipComponent
  ],
  templateUrl: './article-form.component.html',
  styleUrls: ['./article-form.component.scss']
})
export class ArticleFormComponent implements OnInit, OnDestroy {
  @Input() article: Article | null = null; // For edit mode
  @Input() prefilledName: string = '';
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
  articleStats$: Observable<ArticleStats> | null = null;
  articleHistory: Array<CheckEvent & { listName: string }> = [];

  // Manual stat overrides (temporary, will be overwritten on next action)
  statOverrides: {
    lastAddedDate?: Date;
    lastCheckedDate?: Date;
    numberOfChecks?: number;
  } = {};

  private destroy$ = new Subject<void>();

  commonEmojis = [
    '🍎', '🍌', '🍓', '🥝', '🍊', '🍇', '🥕', '🥬',
    '🍞', '🥛', '🧀', '🥚', '🍖', '🐟', '🍝', '🍚',
    '☕', '🧴', '🧽', '🧻', '💊', '🧴', '📱', '📦'
  ];

  constructor(
    private departmentService: DepartmentService,
    private dataService: DataService,
    private articleStatsService: ArticleStatsService,
    private historyService: HistoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private store: Store<AppState>
  ) {}

  ngOnInit(): void {
    this.loadDepartments();
    
    if (this.article) {
      this.populateForm();

      // Load lists containing this article (edit mode only)
      if (this.isEditMode) {
        this.containingLists$ = this.dataService.getListsContainingArticle(this.article.id);
        // Load article statistics
        this.articleStats$ = this.articleStatsService.getArticleStats(this.article.id);
        // Load article history
        this.loadArticleHistory(this.article.id);
      }
    } else if (this.prefilledName) {
      // Pre-fill the name for new articles
      this.formData.name = this.prefilledName;
    }
  }

  private loadArticleHistory(articleId: string): void {
    // Use NgRx store selector to get fully loaded lists with history
    this.store.select(selectAllLists)
      .pipe(takeUntil(this.destroy$))
      .subscribe((lists: ShoppingList[]) => {
        const history: Array<CheckEvent & { listName: string }> = [];

        lists.forEach((list: ShoppingList) => {
          if (list.articleIds.includes(articleId)) {
            const itemState = list.itemStates[articleId];
            if (itemState?.history && itemState.history.length > 0) {
              itemState.history.forEach((event: CheckEvent) => {
                history.push({
                  ...event,
                  listName: list.name
                });
              });
            }
          }
        });

        // Sort by timestamp, most recent first
        this.articleHistory = history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      });
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

  // Stats editing methods
  onEditLastAdded(): void {
    if (!this.articleStats$) return;

    this.articleStats$.pipe(take(1)).subscribe(stats => {
      const currentDate = this.statOverrides.lastAddedDate || stats?.lastAddedToListDate;

      const dialogRef = this.dialog.open(DateEditDialogComponent, {
        width: '400px',
        data: {
          title: 'Zuletzt hinzugefügt bearbeiten',
          currentDate: currentDate
        } as DateEditDialogData
      });

      dialogRef.afterClosed().subscribe((result: DateEditDialogResult | undefined) => {
        if (result) {
          this.statOverrides.lastAddedDate = result.date;
          this.snackBar.open('Datum aktualisiert (wird beim nächsten Abhaken überschrieben)', 'OK', { duration: 3000 });
        }
      });
    });
  }

  onEditLastChecked(): void {
    if (!this.articleStats$) return;

    this.articleStats$.pipe(take(1)).subscribe(stats => {
      const currentDate = this.statOverrides.lastCheckedDate || stats?.lastCheckedDate;

      const dialogRef = this.dialog.open(DateEditDialogComponent, {
        width: '400px',
        data: {
          title: 'Zuletzt abgehakt bearbeiten',
          currentDate: currentDate
        } as DateEditDialogData
      });

      dialogRef.afterClosed().subscribe((result: DateEditDialogResult | undefined) => {
        if (result) {
          this.statOverrides.lastCheckedDate = result.date;
          this.snackBar.open('Datum aktualisiert (wird beim nächsten Abhaken überschrieben)', 'OK', { duration: 3000 });
        }
      });
    });
  }

  onEditCheckCount(): void {
    if (!this.articleStats$) return;

    this.articleStats$.pipe(take(1)).subscribe(stats => {
      const currentCount = this.statOverrides.numberOfChecks ?? stats?.numberOfChecks ?? 0;

      const dialogRef = this.dialog.open(NumberEditDialogComponent, {
        width: '400px',
        data: {
          title: 'Anzahl Abhakungen bearbeiten',
          label: 'Anzahl',
          currentValue: currentCount,
          min: 0
        } as NumberEditDialogData
      });

      dialogRef.afterClosed().subscribe((result: NumberEditDialogResult | undefined) => {
        if (result) {
          this.statOverrides.numberOfChecks = result.value;
          this.snackBar.open('Anzahl aktualisiert (wird beim nächsten Abhaken überschrieben)', 'OK', { duration: 3000 });
        }
      });
    });
  }

  // Get the display value for stats (with overrides)
  getDisplayLastAdded(): Date | undefined {
    return this.statOverrides.lastAddedDate;
  }

  getDisplayLastChecked(): Date | undefined {
    return this.statOverrides.lastCheckedDate;
  }

  getDisplayCheckCount(): number | undefined {
    return this.statOverrides.numberOfChecks;
  }

  // Format history event for display
  formatHistoryDate(date: Date): string {
    return this.historyService.formatDate(date);
  }

  formatHistoryTime(date: Date): string {
    const d = date instanceof Date ? date : new Date(date);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  getHistoryPrefix(action: 'checked' | 'unchecked'): string {
    return action === 'checked' ? '−' : '+';
  }
}