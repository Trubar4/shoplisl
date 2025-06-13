import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { ShoppingList, Department, DEFAULT_DEPARTMENT_ORDER } from '../../../core/models';
import { DataService } from '../../../core/services/data';
import { DepartmentService } from '../../../core/services/department.service';

interface DepartmentWithVisibility extends Department {
  isVisible: boolean;
  articleCount: number;
}

@Component({
  selector: 'app-department-sort',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatSnackBarModule,
    DragDropModule
  ],
  template: `
    <div class="department-sort">
      <!-- Header -->
      <mat-toolbar color="primary" class="app-header">
        <button mat-icon-button (click)="onBack()" aria-label="Back">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="header-content">
          <span class="list-icon">{{ currentList?.icon || '📋' }}</span>
          <span class="list-name">Marktaufteilung</span>
        </div>
        <span class="spacer"></span>
        <button 
          mat-button 
          (click)="onSave()"
          [disabled]="!hasChanges"
          class="save-button">
          Speichern
        </button>
      </mat-toolbar>

      <!-- Loading -->
      <div *ngIf="isLoading" class="loading">
        <p>Bereiche werden geladen...</p>
      </div>

      <!-- Content -->
      <div *ngIf="!isLoading" class="content-container">
        <!-- Instructions -->
        <div class="instructions">
          <mat-icon>info_outline</mat-icon>
          <p>Ziehe die Bereiche in die gewünschte Reihenfolge für deine Einkaufstour</p>
        </div>

        <!-- Sortable Department List -->
        <div 
          class="departments-list"
          cdkDropList
          (cdkDropListDropped)="onDrop($event)">
          
          <div 
            *ngFor="let department of sortedDepartments; let i = index"
            class="department-item"
            [class.visible]="department.isVisible"
            [class.hidden]="!department.isVisible"
            cdkDrag
            [cdkDragData]="department">
            
            <!-- Department Icon -->
            <div class="department-icon">
              <img [src]="getDepartmentIconPath(department.id)" 
                   [alt]="department.nameGerman"
                   onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
              <span class="fallback-icon" style="display: none;">🏪</span>
            </div>
            
            <!-- Department Info -->
            <div class="department-info">
              <div class="department-name">{{ department.nameGerman }}</div>
              <div class="department-status" *ngIf="department.isVisible">
                {{ department.articleCount }} Artikel
              </div>
              <div class="department-status hidden-status" *ngIf="!department.isVisible">
                Keine Artikel
              </div>
            </div>
            
            <!-- Drag Handle -->
            <div class="drag-handle" cdkDragHandle>
              <mat-icon>drag_indicator</mat-icon>
            </div>
          </div>
        </div>

        <!-- Reset Button -->
        <div class="actions">
          <button 
            mat-stroked-button 
            (click)="onReset()"
            class="reset-button"
            [style.border-color]="getCurrentListColor()"
            [style.color]="getCurrentListColor()">
            <mat-icon>restore</mat-icon>
            Standard wiederherstellen
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .department-sort {
      height: 100vh;
      display: flex;
      flex-direction: column;
      background-color: #f5f5f5;
    }

    .app-header {
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      z-index: 1000;
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .list-icon {
      font-size: 24px;
    }

    .list-name {
      font-size: 18px;
      font-weight: 500;
    }

    .spacer {
      flex: 1;
    }

    .save-button {
      color: white !important;
    }

    .save-button:disabled {
      color: rgba(255,255,255,0.5) !important;
    }

    .loading {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 40px;
      color: #666;
    }

    .content-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .instructions {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: white;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .instructions mat-icon {
      color: #2196F3;
      margin-top: 2px;
      flex-shrink: 0;
    }

    .instructions p {
      margin: 0;
      color: #666;
      line-height: 1.4;
    }

    .departments-list {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 24px;
    }

    .department-item {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #e0e0e0;
      background: white;
      transition: all 0.2s ease;
      cursor: move;
      min-height: 64px;
    }

    .department-item:last-child {
      border-bottom: none;
    }

    .department-item.hidden {
      opacity: 0.6;
      background: #f9f9f9;
    }

    .department-item.cdk-drag-preview {
      box-shadow: 0 8px 16px rgba(0,0,0,0.2);
      border-radius: 8px;
      background: white;
      transform: rotate(2deg);
    }

    .department-item.cdk-drag-animating {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }

    .departments-list.cdk-drop-list-dragging .department-item:not(.cdk-drag-placeholder) {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }

    .cdk-drag-placeholder {
      opacity: 0.4;
      background: #e3f2fd;
      border: 2px dashed #2196F3;
    }

    .department-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 16px;
      flex-shrink: 0;
    }

    .department-icon img {
      width: 28px;
      height: 28px;
      object-fit: contain;
    }

    .fallback-icon {
      font-size: 20px;
    }

    .department-info {
      flex: 1;
      min-width: 0;
    }

    .department-name {
      font-size: 16px;
      font-weight: 500;
      color: #333;
      margin-bottom: 2px;
    }

    .department-status {
      font-size: 12px;
      color: #4CAF50;
      font-weight: 500;
    }

    .department-status.hidden-status {
      color: #999;
    }

    .drag-handle {
      color: #999;
      cursor: grab;
      padding: 4px;
      margin-left: 8px;
      flex-shrink: 0;
    }

    .drag-handle:active {
      cursor: grabbing;
    }

    .drag-handle mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .actions {
      display: flex;
      justify-content: center;
    }

    .reset-button {
      display: flex;
      align-items: center;
      gap: 8px;
      border-width: 2px;
    }

    /* Touch-friendly styles */
    @media (max-width: 768px) {
      .department-item {
        padding: 16px;
        min-height: 72px;
      }

      .department-icon {
        margin-right: 20px;
      }

      .drag-handle {
        padding: 8px;
        margin-left: 12px;
      }

      .drag-handle mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }
    }

    /* Improve drag experience */
    .cdk-drag {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }

    .cdk-drag:active {
      cursor: grabbing;
    }
  `]
})
export class DepartmentSortComponent implements OnInit, OnDestroy {
  listId: string = '';
  currentList: ShoppingList | null = null;
  sortedDepartments: DepartmentWithVisibility[] = [];
  currentDepartmentOrder: string[] = [];
  originalDepartmentOrder: string[] = [];
  hasChanges = false;
  isLoading = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dataService: DataService,
    private departmentService: DepartmentService,
    private snackBar: MatSnackBar
  ) {
    this.listId = this.route.snapshot.paramMap.get('id') || '';
  }

  ngOnInit(): void {
    combineLatest([
      this.dataService.getList(this.listId),
      this.dataService.getArticles(),
      this.departmentService.getDepartments()
    ]).subscribe(([list, articles, departments]) => {
      if (!list) {
        this.router.navigate(['/lists']);
        return;
      }

      this.currentList = list;
      
      // Calculate article counts per department for this list
      const articleCounts: { [departmentId: string]: number } = {};
      articles
        .filter(article => list.articleIds.includes(article.id))
        .forEach(article => {
          const deptId = article.departmentId || 'miscellaneous';
          articleCounts[deptId] = (articleCounts[deptId] || 0) + 1;
        });

      // Get current department order
      this.currentDepartmentOrder = list.departmentOrder || [...DEFAULT_DEPARTMENT_ORDER];
      
      // Store original order for comparison
      if (this.originalDepartmentOrder.length === 0) {
        this.originalDepartmentOrder = [...this.currentDepartmentOrder];
      }

      // Create departments with visibility info, ordered by current order
      const departmentMap = new Map(departments.map(d => [d.id, d]));
      
      this.sortedDepartments = this.currentDepartmentOrder.map(deptId => {
        const department = departmentMap.get(deptId) || {
          id: deptId,
          nameGerman: deptId.charAt(0).toUpperCase() + deptId.slice(1).replace('-', ' '),
          nameEnglish: deptId,
          icon: 'Help-Chat-2--Streamline-Core-Remix.png'
        };
        
        return {
          ...department,
          isVisible: (articleCounts[deptId] || 0) > 0,
          articleCount: articleCounts[deptId] || 0
        };
      }).filter(dept => {
        // Only show departments that either have articles or are in the default order
        return dept.isVisible || DEFAULT_DEPARTMENT_ORDER.includes(dept.id);
      });

      this.isLoading = false;
    });
  }

  ngOnDestroy(): void {
    this.updateThemeColorMeta('#1a9edb');
  }

  onDrop(event: CdkDragDrop<DepartmentWithVisibility[]>): void {
    if (event.previousIndex !== event.currentIndex) {
      // Move in both arrays
      moveItemInArray(this.sortedDepartments, event.previousIndex, event.currentIndex);
      moveItemInArray(this.currentDepartmentOrder, event.previousIndex, event.currentIndex);
      
      this.checkForChanges();
    }
  }

  onSave(): void {
    if (!this.hasChanges) return;
  
    console.log('🔧 Saving department order:', this.currentDepartmentOrder);
    console.log('🔧 List ID:', this.listId);
  
    this.dataService.updateListDepartmentOrder(this.listId, this.currentDepartmentOrder).subscribe({
      next: (success) => {
        console.log('🔧 Save result:', success);
        if (success) {
          this.snackBar.open('Reihenfolge gespeichert', '', { duration: 1500 });
          this.originalDepartmentOrder = [...this.currentDepartmentOrder];
          this.hasChanges = false;
          
          // Add delay to ensure Firestore update propagates
          setTimeout(() => {
            this.router.navigate(['/lists', this.listId], { queryParams: { mode: 'edit' } });
          }, 500);
        } else {
          this.snackBar.open('Fehler beim Speichern', '', { duration: 2000 });
        }
      },
      error: (error) => {
        console.error('🔧 Error saving department order:', error);
        this.snackBar.open('Fehler beim Speichern', '', { duration: 2000 });
      }
    });
  }

  onReset(): void {
    const confirmed = confirm('Möchtest du die Standard-Reihenfolge wiederherstellen?');
    if (confirmed) {
      this.currentDepartmentOrder = [...DEFAULT_DEPARTMENT_ORDER];
      this.checkForChanges();
      
      this.ngOnInit();
      
      this.snackBar.open('Standard-Reihenfolge wiederhergestellt', '', { duration: 1500 });
    }
  }

  onBack(): void {
    if (this.hasChanges) {
      const confirmed = confirm('Du hast ungespeicherte Änderungen. Wirklich zurück?');
      if (!confirmed) return;
    }
    
    this.router.navigate(['/lists', this.listId], { queryParams: { mode: 'edit' } });
  }

  getCurrentListColor(): string {
    return this.currentList?.color || '#1a9edb';
  }

  getDepartmentIconPath(departmentId: string): string {
    return this.departmentService.getDepartmentIconPath(departmentId);
  }

  private checkForChanges(): void {
    this.hasChanges = JSON.stringify(this.currentDepartmentOrder) !== JSON.stringify(this.originalDepartmentOrder);
  }

  private updateThemeColorMeta(color: string): void {
    let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.name = 'theme-color';
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.content = color;
  }
}