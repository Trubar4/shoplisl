import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ArticleItemComponent, ArticleItemData } from '../article-item/article-item.component';
import { ListUtilsService } from '../../../core/services/list-utils.service';
import { ArticleSelectionService } from '../../../features/lists/list-detail/services/article-selection.service';

export interface DepartmentGroup {
  department: {
    id: string;
    nameGerman: string;
    icon: string;
  };
  articles: ArticleItemData[];
}

export type ViewMode = 'shopping' | 'edit';

@Component({
  selector: 'app-article-list',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    ArticleItemComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="articles-list" *ngIf="departmentGroups?.length">
      <div *ngFor="let group of departmentGroups" class="department-group">
        
        <!-- Department Header -->
        <div class="department-header" *ngIf="group.articles.length > 0">
          <div class="department-icon">
            <img 
              [src]="listUtils.getDepartmentIconPath(group.department.id)" 
              [alt]="group.department.nameGerman"
              [style.filter]="listUtils.getDepartmentIconFilter()"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
            <span 
              class="fallback-icon" 
              [style.color]="listUtils.getCurrentListColor()" 
              style="display: none;">🏪</span>
          </div>
          <span class="department-name">{{ group.department.nameGerman }}</span>
        </div>

        <!-- Articles -->
        <app-article-item
          *ngFor="let article of group.articles"
          [article]="article"
          [mode]="mode"
          [shouldHideWhenChecked]="shouldHideArticle(article)"
          [isSelectionMode]="isSelectionMode"
          [selectionService]="selectionService"
          [selectedArticleIds]="selectedArticleIds"
          (toggle)="articleToggle.emit($event)"
          (editAmount)="editAmount.emit($event)"
          (info)="articleInfo.emit($event)"
          (undoCompletion)="undoCompletion.emit($event)"
          (toggleInList)="toggleInList.emit($event)">
        </app-article-item>
      </div>
    </div>

    <!-- Empty State -->
    <div class="empty-state" *ngIf="!departmentGroups?.length">
      <mat-icon class="empty-icon">{{ getEmptyStateIcon() }}</mat-icon>
      <h3>{{ getEmptyStateTitle() }}</h3>
      <p>{{ getEmptyStateMessage() }}</p>
    </div>
  `,
  styleUrls: ['./article-list.component.scss']
})
export class ArticleListComponent {
  @Input({ required: true }) departmentGroups: DepartmentGroup[] | null = null;
  @Input({ required: true }) mode!: ViewMode;
  @Input() searchQuery = '';
  @Input({ required: true }) shouldHideArticle!: (article: ArticleItemData) => boolean;
  @Input() isSelectionMode: boolean = false;
  @Input() selectionService?: ArticleSelectionService;
  @Input() selectedArticleIds?: Set<string>;

  @Output() articleToggle = new EventEmitter<ArticleItemData>();
  @Output() editAmount = new EventEmitter<{ article: ArticleItemData; event: Event }>();
  @Output() articleInfo = new EventEmitter<ArticleItemData>();
  @Output() undoCompletion = new EventEmitter<ArticleItemData>();
  @Output() toggleInList = new EventEmitter<ArticleItemData>();

  constructor(public readonly listUtils: ListUtilsService) {}

  getEmptyStateIcon(): string {
    return this.mode === 'shopping' ? 'shopping_cart' : 'search_off';
  }

  getEmptyStateTitle(): string {
    if (this.searchQuery) {
      return 'Keine Artikel gefunden';
    }
    return this.mode === 'shopping' 
      ? 'Keine Artikel gefunden' 
      : 'Keine Artikel vorhanden';
  }

  getEmptyStateMessage(): string {
    if (this.searchQuery) {
      return `Kein Artikel gefunden für "${this.searchQuery}"`;
    }
    return this.mode === 'shopping'
      ? 'Wechsle in den Bearbeiten-Modus um Artikel hinzuzufügen'
      : 'Erstelle neue Artikel oder ändere den Filter';
  }
}