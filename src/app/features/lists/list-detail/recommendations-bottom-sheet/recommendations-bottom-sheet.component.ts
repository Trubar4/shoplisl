import { Component, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatBottomSheetRef, MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { Article, ShoppingList } from '../../../../core/models';
import { DataService } from '../../../../core/services/data.service';

export interface RecommendationsBottomSheetData {
  listId: string;
  list: ShoppingList;
  frequentArticles: Article[];
  longNotBoughtArticles: Article[];
}

@Component({
  selector: 'app-recommendations-bottom-sheet',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatRippleModule],
  templateUrl: './recommendations-bottom-sheet.component.html',
  styleUrls: ['./recommendations-bottom-sheet.component.scss']
})
export class RecommendationsBottomSheetComponent {

  readonly frequentArticles = signal<Article[]>([]);
  readonly longNotBoughtArticles = signal<Article[]>([]);

  private readonly listId: string;
  private readonly list: ShoppingList;

  constructor(
    @Inject(MAT_BOTTOM_SHEET_DATA) data: RecommendationsBottomSheetData,
    private readonly bottomSheetRef: MatBottomSheetRef<RecommendationsBottomSheetComponent>,
    private readonly dataService: DataService
  ) {
    this.listId = data.listId;
    this.list = data.list;
    this.frequentArticles.set([...data.frequentArticles]);
    this.longNotBoughtArticles.set([...data.longNotBoughtArticles]);
  }

  onSelectArticle(article: Article): void {
    // Optimistic UI: remove from the displayed list immediately
    this.frequentArticles.update(list => list.filter(a => a.id !== article.id));
    this.longNotBoughtArticles.update(list => list.filter(a => a.id !== article.id));

    const isOnList = this.list.articleIds?.includes(article.id);
    const isChecked = this.list.itemStates?.[article.id]?.isChecked;

    if (isOnList && isChecked) {
      // Article is on the list and checked off — uncheck it so it re-appears as an active item.
      this.dataService.toggleItemChecked(this.listId, article.id).subscribe();
    } else {
      // Article was removed from the list — add it back.
      this.dataService.addArticleToList(this.listId, article.id).subscribe();
    }

    // Auto-close when both lists are empty
    if (this.frequentArticles().length === 0 && this.longNotBoughtArticles().length === 0) {
      this.bottomSheetRef.dismiss();
    }
  }
}
