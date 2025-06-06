import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';

import { Article } from '../../../core/models';
import { DataService } from '../../../core/services/data';

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
    MatSnackBarModule
  ],
  templateUrl: './add-article.html',
  styleUrls: ['./add-article.scss']
})
export class AddArticleComponent {
  article = {
    name: '',
    amount: '',
    notes: '',
    icon: ''
  };

  // Common emojis for quick selection
  commonEmojis = [
    '🍎', '🍌', '🍓', '🥝', '🍊', '🍇', '🥕', '🥬',
    '🍞', '🥛', '🧀', '🥚', '🍖', '🐟', '🍝', '🍚',
    '☕', '🧴', '🧽', '🧻', '💊', '🧴', '📱', '📦'
  ];

  constructor(
    private dataService: DataService,
    private router: Router,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute // Add this import
  ) {
    // Pre-fill name if passed via query parameter
    const preFillName = this.route.snapshot.queryParamMap.get('name');
    if (preFillName) {
      this.article.name = preFillName;
    }
  }

  onEmojiSelect(emoji: string): void {
    this.article.icon = emoji;
  }

  onSave(): void {
    if (!this.article.name.trim()) {
      this.snackBar.open('Name ist erforderlich', 'OK', { duration: 3000 });
      return;
    }
  
    this.dataService.createArticle({
      name: this.article.name.trim(),
      amount: this.article.amount.trim() || undefined,
      notes: this.article.notes.trim() || undefined,
      icon: this.article.icon || '📦'
    }).subscribe((newArticle) => {
      this.snackBar.open('Artikel erfolgreich hinzugefügt', 'OK', { duration: 2000 });
      
      // Check if we should return to a list and auto-add the article
      const returnToList = this.route.snapshot.queryParamMap.get('returnToList');
      const autoAdd = this.route.snapshot.queryParamMap.get('autoAdd');
      
      if (returnToList && autoAdd === 'true' && newArticle) {
        // Auto-add the new article to the list
        this.dataService.addArticleToList(returnToList, newArticle.id).subscribe(() => {
          this.router.navigate(['/lists', returnToList], {
            queryParams: { mode: 'edit' }
          });
        });
      } else {
        this.router.navigate(['/articles']);
      }
    });
  }

  onCancel(): void {
    // Check if there's a returnTo parameter
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    const mode = this.route.snapshot.queryParamMap.get('mode');
    
    if (returnTo) {
      if (mode) {
        this.router.navigate([returnTo], { queryParams: { mode: mode } });
      } else {
        this.router.navigateByUrl(returnTo);
      }
    } else {
      this.router.navigate(['/articles']);
    }
  }

  onBack(): void {
    // Check if there's a returnTo parameter
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    const mode = this.route.snapshot.queryParamMap.get('mode');
    
    if (returnTo) {
      if (mode) {
        this.router.navigate([returnTo], { queryParams: { mode: mode } });
      } else {
        this.router.navigateByUrl(returnTo);
      }
    } else {
      this.router.navigate(['/articles']);
    }
  }
}