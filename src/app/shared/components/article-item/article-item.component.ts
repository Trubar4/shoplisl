// src/app/shared/components/article-item/article-item.component.ts
import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { ArticleSelectionService } from '../../../features/lists/list-detail/services/article-selection.service';
import { CheckEvent } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';

export interface ArticleItemData {
  id: string;
  name: string;
  icon?: string;
  notes?: string;
  amount?: string;
  departmentId?: string;
  isChecked: boolean;
  isInList: boolean;
  listAmount?: string;
  pendingHideTimestamp?: number;
  showUndoHint?: boolean;
  // History-related fields (optional, used by history mode)
  checkedAt?: Date;
  checkedBy?: string;
  history?: CheckEvent[];
  // Phase 8: Sharing fields
  ownerId?: string;
  copiedFrom?: string;
}

export type ArticleViewMode = 'shopping' | 'edit';

@Component({
  selector: 'app-article-item',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatCheckboxModule,
    MatChipsModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="article-item"
      [class.checked]="isArticleChecked()"
      [class.pending-hide]="article.pendingHideTimestamp"
      [class.fade-out]="shouldFadeOut()"
      [class.in-list]="mode === 'edit' && article.isInList"
      [class.selection-mode]="isSelectionMode">

      <!-- Selection Checkbox (only visible in selection mode) -->
      <mat-checkbox
        *ngIf="isSelectionMode && mode === 'shopping'"
        [checked]="isArticleSelected()"
        (change)="onSelectionCheckboxChange($event)"
        (click)="$event.stopPropagation()"
        color="primary"
        class="selection-checkbox">
      </mat-checkbox>

      <!-- Article Icon -->
      <div class="article-icon">
        {{ article.icon || '📦' }}
      </div>

      <!-- Article Content -->
      <div 
        class="article-content" 
        [class.clickable]="mode === 'shopping'"
        (click)="onArticleClick()">
        
        <div class="article-header">
          <span
            class="article-name"
            [class.strikethrough]="isArticleChecked()"
            [class.pending-strikethrough]="article.pendingHideTimestamp">
            {{ article.name }}
          </span>
          <!-- Phase 8: Sharing status chips (only show in edit mode) -->
          <mat-chip-set *ngIf="mode === 'edit' && (isSharedArticle() || isCopiedArticle())" class="ownership-chips">
            <mat-chip *ngIf="isSharedArticle()" class="shared-chip">
              <mat-icon>people</mat-icon>
            </mat-chip>
            <mat-chip *ngIf="isCopiedArticle()" class="copy-chip">Kopie</mat-chip>
          </mat-chip-set>
        </div>
        
        <!-- Notes -->
        <div class="article-notes" *ngIf="article.notes">
          {{ article.notes }}
        </div>
        
        <!-- Undo hint for shopping mode -->
        <button 
          *ngIf="mode === 'shopping' && article.showUndoHint"
          class="undo-hint-button" 
          (click)="onUndoClick($event)"
          mat-stroked-button>
          <mat-icon class="undo-icon">undo</mat-icon>
          <span>Rückgängig</span>
        </button>
      </div>

      <!-- Article Actions -->
      <div 
        class="article-actions" 
        [class.hidden-by-undo]="article.showUndoHint">
        
        <!-- Amount Display/Edit -->
        <span 
          class="article-amount"
          [class.clickable]="canEditAmount()"
          [class.editable]="canEditAmount()"
          [class.disabled]="!canEditAmount()"
          [class.empty]="!getDisplayAmount()"
          (click)="onAmountClick($event)">
          {{ getDisplayAmount() || 'Menge' }}
        </span>
        
        <!-- Info Button -->
        <button 
          mat-icon-button 
          (click)="onInfoClick()"
          class="info-button">
          <mat-icon>info_outline</mat-icon>
        </button>
      </div>
      
      <!-- Edit Mode Toggle -->
      <mat-slide-toggle
        *ngIf="mode === 'edit'"
        [checked]="article.isInList"
        (change)="onToggleInListClick()"
        color="primary"
        class="article-toggle">
      </mat-slide-toggle>
    </div>
  `,
  styleUrls: ['./article-item.component.scss']
})
export class ArticleItemComponent {
  @Input({ required: true }) article!: ArticleItemData;
  @Input({ required: true }) mode!: ArticleViewMode;
  @Input() shouldHideWhenChecked = false;
  @Input() isSelectionMode: boolean = false;
  @Input() selectionService?: ArticleSelectionService;
  @Input() selectedArticleIds?: Set<string>;

  @Output() toggle = new EventEmitter<ArticleItemData>();
  @Output() editAmount = new EventEmitter<{ article: ArticleItemData; event: Event }>();
  @Output() info = new EventEmitter<ArticleItemData>();
  @Output() undoCompletion = new EventEmitter<ArticleItemData>();
  @Output() toggleInList = new EventEmitter<ArticleItemData>();

  // Phase 8: Current user for ownership checks
  private currentUserId: string | null;

  constructor(private authService: AuthService) {
    this.currentUserId = this.authService.getCurrentUserId();
  }

  onArticleClick(): void {
    if (this.mode === 'shopping') {
      this.toggle.emit(this.article);
    }
  }

  onSelectionCheckboxChange(event: any): void {
    event.stopPropagation();
    if (this.selectionService) {
      this.selectionService.toggleArticle(this.article.id);
    }
  }

  isArticleSelected(): boolean {
    // Prefer using the input Set for better change detection
    if (this.selectedArticleIds) {
      return this.selectedArticleIds.has(this.article.id);
    }
    // Fallback to service if Set not provided
    return this.selectionService?.isArticleSelected(this.article.id) || false;
  }

  onAmountClick(event: Event): void {
    if (this.canEditAmount()) {
      this.editAmount.emit({ article: this.article, event });
    }
  }

  onInfoClick(): void {
    this.info.emit(this.article);
  }

  onUndoClick(event: Event): void {
    event.stopPropagation();
    this.undoCompletion.emit(this.article);
  }

  onToggleInListClick(): void {
    this.toggleInList.emit(this.article);
  }

  isArticleChecked(): boolean {
    return this.mode === 'shopping' && 
           this.article.isChecked && 
           !this.article.pendingHideTimestamp;
  }

  shouldFadeOut(): boolean {
    return this.mode === 'shopping' && 
           this.article.isChecked && 
           !this.article.pendingHideTimestamp && 
           this.shouldHideWhenChecked;
  }

  canEditAmount(): boolean {
    if (this.mode === 'shopping') {
      return true;
    }
    return this.mode === 'edit' && this.article.isInList;
  }

  getDisplayAmount(): string {
    if (this.mode === 'edit') {
      return this.article.listAmount || this.article.amount || '';
    }
    return this.article.listAmount || this.article.amount || '';
  }

  // === PHASE 8: SHARING HELPER METHODS ===

  /**
   * Check if article is shared (not owned by current user)
   */
  isSharedArticle(): boolean {
    return this.currentUserId !== null &&
           this.article.ownerId !== undefined &&
           this.article.ownerId !== this.currentUserId;
  }

  /**
   * Check if article is a local copy
   */
  isCopiedArticle(): boolean {
    return this.article.copiedFrom !== undefined && this.article.copiedFrom !== null;
  }
}