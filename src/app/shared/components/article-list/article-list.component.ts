import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Article } from '../../../core/models';

export interface ArticleItem extends Article {
    isChecked: boolean;  // Remove optional, make required
    isInList: boolean;   // Remove optional, make required  
    listAmount?: string;
    pendingHideTimestamp?: number;
    showUndoHint?: boolean;
  }

export interface DepartmentGroup {
  department: {
    id: string;
    nameGerman: string;
    icon: string;
  };
  articles: ArticleItem[];
}

export type ViewMode = 'shopping' | 'edit';

/**
 * ArticleListComponent
 * 
 * Displays articles grouped by departments with different behaviors for shopping/edit modes.
 * Handles article interactions, amount editing, and toggle states.
 * 
 * @example
 * <app-article-list
 *   [departmentGroups]="groups$ | async"
 *   [mode]="currentMode"
 *   [getDepartmentIconPath]="getDepartmentIconPath.bind(this)"
 *   [getDepartmentIconFilter]="getDepartmentIconFilter.bind(this)"
 *   [getCurrentListColor]="getCurrentListColor.bind(this)"
 *   [getArticleAmount]="getArticleAmount.bind(this)"
 *   [shouldHideArticle]="shouldHideArticle.bind(this)"
 *   (articleToggle)="onArticleToggle($event)"
 *   (editAmount)="onEditAmount($event)"
 *   (articleInfo)="onArticleInfo($event)"
 *   (undoCompletion)="undoArticleCompletion($event)"
 *   (toggleInList)="onToggleArticleInList($event)">
 * </app-article-list>
 */
@Component({
  selector: 'app-article-list',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule
  ],
  templateUrl: './article-list.component.html',
  styleUrls: ['./article-list.component.scss']
})
export class ArticleListComponent {
  @Input() departmentGroups: DepartmentGroup[] | null = null;
  @Input() mode: ViewMode = 'shopping';
  @Input() searchQuery = '';
  @Input() getDepartmentIconPath!: (departmentId: string) => string;
  @Input() getDepartmentIconFilter!: () => string;
  @Input() getCurrentListColor!: () => string;
  @Input() getArticleAmount!: (article: ArticleItem) => string;
  @Input() shouldHideArticle!: (article: ArticleItem) => boolean;

  @Output() articleToggle = new EventEmitter<ArticleItem>();
  @Output() editAmount = new EventEmitter<{ article: ArticleItem; event?: Event }>();
  @Output() articleInfo = new EventEmitter<ArticleItem>();
  @Output() undoCompletion = new EventEmitter<ArticleItem>();
  @Output() toggleInList = new EventEmitter<ArticleItem>();

  onArticleClick(article: ArticleItem): void {
    if (this.mode === 'shopping') {
      this.articleToggle.emit(article);
    }
  }

  onAmountClick(article: ArticleItem, event: Event): void {
    if (this.canEditAmount(article)) {
      this.editAmount.emit({ article, event });
    }
  }

  isArticleChecked(article: ArticleItem): boolean {
    return this.mode === 'shopping' && 
           !!article.isChecked && 
           !article.pendingHideTimestamp;
  }

  shouldFadeOut(article: ArticleItem): boolean {
    return this.mode === 'shopping' && 
           !!article.isChecked && 
           !article.pendingHideTimestamp && 
           this.shouldHideArticle(article);
  }

  canEditAmount(article: ArticleItem): boolean {
    if (this.mode === 'shopping') {
      return true; // Always editable in shopping mode
    }
    return this.mode === 'edit' && !!article.isInList;
  }

  getDisplayAmount(article: ArticleItem): string {
    if (this.mode === 'edit') {
      return article.listAmount || article.amount || '';
    }
    return this.getArticleAmount(article);
  }

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