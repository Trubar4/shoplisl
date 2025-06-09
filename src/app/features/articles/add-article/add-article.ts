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
import { MatRadioModule } from '@angular/material/radio';
import { MatCardModule } from '@angular/material/card';
import { Subject } from 'rxjs';
import { takeUntil, take } from 'rxjs/operators';

import { DataService } from '../../../core/services/data';
import { DepartmentService } from '../../../core/services/department.service';
import { Department } from '../../../core/models';

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
    MatProgressSpinnerModule,
    MatRadioModule,
    MatCardModule
  ],
  templateUrl: './add-article.html',
  styleUrls: ['./add-article.scss']
})
export class AddArticleComponent implements OnInit, OnDestroy {
  article = {
    name: '',
    amount: '',
    notes: '',
    icon: '📦',
    departmentId: null as string | null
  };
  
  isSaving = false;
  departments: Department[] = [];
  private destroy$ = new Subject<void>();

  commonEmojis = [
    '🍎', '🍌', '🍓', '🥝', '🍊', '🍇', '🥕', '🥬',
    '🍞', '🥛', '🧀', '🥚', '🍖', '🐟', '🍝', '🍚',
    '☕', '🧴', '🧽', '🧻', '💊', '🧴', '📱', '📦'
  ];

  constructor(
    private dataService: DataService,
    private departmentService: DepartmentService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.departmentService.getDepartments().subscribe(departments => {
      this.departments = departments;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onEmojiSelect(emoji: string): void {
    this.article.icon = emoji;
  }

  onDepartmentSelected(departmentId: string | null): void {
    this.article.departmentId = departmentId;
    console.log('Department selected:', departmentId); // Debug log
  }

  getDepartmentIconPath(iconFilename: string): string {
    // Correct path: public folder is served at root
    return `/icons/${iconFilename}`;
  }

  onSave(): void {
    if (!this.article.name.trim()) {
      this.snackBar.open('Name ist erforderlich', 'OK', { duration: 3000 });
      return;
    }

    this.isSaving = true;

    this.dataService.getArticles()
      .pipe(
        take(1),
        takeUntil(this.destroy$)
      )
      .subscribe(articles => {
        const trimmedName = this.article.name.trim().toLowerCase();
        const duplicate = articles.find(article => 
          article.name.trim().toLowerCase() === trimmedName
        );

        if (duplicate) {
          this.isSaving = false;
          alert(`Ein Artikel mit dem Namen "${this.article.name}" existiert bereits. Bitte wählen Sie einen anderen Namen.`);
          return;
        }

        const newArticle = {
          name: this.article.name.trim(),
          amount: this.article.amount.trim() || undefined,
          notes: this.article.notes.trim() || undefined,
          icon: this.article.icon || '📦',
          departmentId: this.article.departmentId || undefined
        };

        this.dataService.createArticle(newArticle)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (createdArticle) => {
              this.isSaving = false;
              this.snackBar.open('Artikel erfolgreich erstellt', 'OK', { duration: 2000 });
              
              const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
              const listId = this.route.snapshot.queryParamMap.get('listId');
              
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