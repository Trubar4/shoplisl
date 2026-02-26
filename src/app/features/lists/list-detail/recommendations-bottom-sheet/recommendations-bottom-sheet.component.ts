import { Component, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatBottomSheetRef, MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { Article } from '../../../../core/models';
import { DataService } from '../../../../core/services/data.service';

export interface RecommendationsBottomSheetData {
  listId: string;
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

  constructor(
    @Inject(MAT_BOTTOM_SHEET_DATA) data: RecommendationsBottomSheetData,
    private readonly bottomSheetRef: MatBottomSheetRef<RecommendationsBottomSheetComponent>,
    private readonly dataService: DataService
  ) {
    this.listId = data.listId;
    this.frequentArticles.set([...data.frequentArticles]);
    this.longNotBoughtArticles.set([...data.longNotBoughtArticles]);
  }

  onAddArticle(article: Article): void {
    // Optimistic UI: remove from the displayed list immediately
    this.frequentArticles.update(list => list.filter(a => a.id !== article.id));
    this.longNotBoughtArticles.update(list => list.filter(a => a.id !== article.id));

    this.dataService.addArticleToList(this.listId, article.id).subscribe();

    // Auto-close when both lists are empty
    if (this.frequentArticles().length === 0 && this.longNotBoughtArticles().length === 0) {
      this.bottomSheetRef.dismiss();
    }
  }
}
