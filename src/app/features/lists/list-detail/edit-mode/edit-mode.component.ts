import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ArticleListComponent, DepartmentGroup } from '../../../../shared/components/article-list/article-list.component';
import { ArticleItemData } from '../../../../shared/components/article-item/article-item.component';
import { ShoppingList } from '../../../../core/models';

/**
 * Edit Mode Component
 *
 * Handles edit-specific functionality:
 * - Add/remove articles from list
 * - Edit article amounts
 * - List management actions (clear, delete, edit)
 * - Navigation to create new article
 * - Navigation to department sorting
 */

type EditFilter = 'gelistet' | 'fehlend' | 'alle';

@Component({
  selector: 'app-edit-mode',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule, ArticleListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './edit-mode.component.html',
  styleUrls: ['./edit-mode.component.scss']
})
export class EditModeComponent {
  // === INPUTS ===
  @Input() list: ShoppingList | null = null;
  @Input() departmentGroups: DepartmentGroup[] = [];
  @Input() searchQuery: string = '';
  @Input() editFilter: EditFilter = 'alle';
  @Input() listColor: string = '#1a9edb';
  @Input() contrastColor: string = '#ffffff';
  @Input() lightColor: string = '#7fcaed';
  @Input() isOwner: boolean = true; // Phase 8: Owner permission for edit/delete

  // === OUTPUTS ===
  @Output() toggleInList = new EventEmitter<ArticleItemData>();
  @Output() articleInfo = new EventEmitter<ArticleItemData>();
  @Output() editAmount = new EventEmitter<{ article: ArticleItemData; event: Event }>();
  @Output() createArticle = new EventEmitter<void>();
  @Output() departmentSort = new EventEmitter<void>();
  @Output() clearList = new EventEmitter<void>();
  @Output() editList = new EventEmitter<void>();
  @Output() deleteList = new EventEmitter<void>();

  // === FILTERING ===

  /**
   * Determines if an article should be hidden from the list
   * In edit mode, we never hide articles - show all
   */
  shouldHideArticle = (_article: ArticleItemData): boolean => {
    return false;
  };

  // === EVENT HANDLERS ===

  /**
   * Handles adding/removing an article from the list
   */
  onToggleInList(article: ArticleItemData): void {
    this.toggleInList.emit(article);
  }

  /**
   * Handles navigating to article info
   */
  onArticleInfo(article: ArticleItemData): void {
    this.articleInfo.emit(article);
  }

  /**
   * Handles editing article amount
   */
  onEditAmount(data: { article: ArticleItemData; event: Event }): void {
    this.editAmount.emit(data);
  }

  /**
   * Handles creating a new article
   */
  onCreateArticle(): void {
    this.createArticle.emit();
  }

  /**
   * Handles navigating to department sort
   */
  onDepartmentSort(): void {
    this.departmentSort.emit();
  }

  /**
   * Handles clearing all items from the list
   * Confirms with user before emitting event
   */
  onClearAllItems(): void {
    if (!this.list) return;

    const count = this.list.articleIds.length;
    if (count === 0) {
      // Parent will show snackbar
      this.clearList.emit();
      return;
    }

    if (confirm(`Alle ${count} Artikel von der Liste entfernen?`)) {
      this.clearList.emit();
    }
  }

  /**
   * Handles editing list details
   */
  onEditList(): void {
    this.editList.emit();
  }

  /**
   * Handles deleting the list
   * Confirms with user before emitting event
   */
  onDeleteList(): void {
    if (!this.list) return;

    const confirmMessage = `Liste "${this.list.name}" wirklich löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`;

    if (confirm(confirmMessage)) {
      this.deleteList.emit();
    }
  }
}
