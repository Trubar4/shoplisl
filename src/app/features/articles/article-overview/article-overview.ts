import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { map, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Article } from '../../../core/models';
import { DataService } from '../../../core/services/data';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-article-overview',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatDialogModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './article-overview.html',
  styleUrls: ['./article-overview.scss']
})
export class ArticleOverviewComponent implements OnInit, OnDestroy {
  searchQuery$ = new BehaviorSubject<string>('');
  filteredArticles$: Observable<Article[]>;
  searchQuery = '';
  
  // Swipe state management (same as lists-overview)
  swipeStates: { [articleId: string]: { 
    isSwipeActive: boolean; 
    swipeDistance: number;
    startX: number;
    currentX: number;
    startY: number;
    currentY: number;
  } } = {};
  
  private readonly SWIPE_THRESHOLD = 100; // Minimum distance for delete action
  private readonly MAX_SWIPE_DISTANCE = 120; // Maximum swipe distance
  private destroy$ = new Subject<void>();
  
  constructor(
    private dataService: DataService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    // Combine articles with search query for filtering
    this.filteredArticles$ = combineLatest([
      this.dataService.getArticles(),
      this.searchQuery$.pipe(
        debounceTime(300),
        distinctUntilChanged()
      )
    ]).pipe(
      map(([articles, query]) => {
        if (!query.trim()) {
          return articles.sort((a, b) => a.name.localeCompare(b.name));
        }
        
        return articles
          .filter(article =>
            article.name.toLowerCase().includes(query.toLowerCase().trim())
          )
          .sort((a, b) => a.name.localeCompare(b.name));
      })
    );
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchQueryChange(): void {
    this.searchQuery$.next(this.searchQuery.trim());
  }

  onArticleClick(article: Article): void {
    // Only navigate if not swiping (same as lists-overview)
    if (!this.swipeStates[article.id]?.isSwipeActive) {
      this.router.navigate(['/articles/edit', article.id])
    }
  }

  onAddArticle(): void {
    this.router.navigate(['/articles/add']);
  }

  onAddNewArticleFromSearch(): void {
    // If there's a search query, pre-fill the name
    if (this.searchQuery.trim()) {
      this.router.navigate(['/articles/add'], {
        queryParams: { name: this.searchQuery.trim() }
      });
    } else {
      this.router.navigate(['/articles/add']);
    }
  }

  // === SWIPE GESTURE HANDLERS (Same as lists-overview) ===
  
  onTouchStart(event: TouchEvent, articleId: string): void {
    const touch = event.touches[0];
    this.swipeStates[articleId] = {
      isSwipeActive: false,
      swipeDistance: 0,
      startX: touch.clientX,
      currentX: touch.clientX,
      startY: touch.clientY, // Add startY to track vertical movement
      currentY: touch.clientY
    };
  }
  
  onTouchMove(event: TouchEvent, articleId: string): void {
    if (!this.swipeStates[articleId]) return;
    
    const touch = event.touches[0];
    const swipeState = this.swipeStates[articleId];
    
    swipeState.currentX = touch.clientX;
    swipeState.currentY = touch.clientY;
    
    const deltaX = swipeState.startX - swipeState.currentX;
    const deltaY = Math.abs(swipeState.startY - swipeState.currentY);
    
    // Only prevent default if this is clearly a horizontal swipe
    // Allow vertical scrolling unless horizontal swipe is dominant
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      // This is a horizontal swipe - prevent scrolling
      event.preventDefault();
      
      // Only allow left swipe (positive deltaX)
      if (deltaX > 10) {
        swipeState.isSwipeActive = true;
        swipeState.swipeDistance = Math.min(deltaX, this.MAX_SWIPE_DISTANCE);
        
        // Update the visual position
        this.updateSwipePosition(articleId, swipeState.swipeDistance);
      } else if (deltaX < -10) {
        // Right swipe - reset
        this.resetSwipe(articleId);
      }
    } else if (deltaY > 10) {
      // This is vertical scrolling - reset any active swipe and allow scrolling
      if (swipeState.isSwipeActive) {
        this.resetSwipe(articleId);
      }
      // Don't prevent default - allow natural scrolling
    }
  }
  
  onTouchEnd(event: TouchEvent, articleId: string): void {
    if (!this.swipeStates[articleId]) return;
    
    const swipeState = this.swipeStates[articleId];
    
    if (swipeState.swipeDistance > this.SWIPE_THRESHOLD) {
      // Trigger delete action
      this.onSwipeDelete(articleId);
    } else {
      // Reset swipe
      this.resetSwipe(articleId);
    }
  }

  // Mouse events for desktop testing
  onMouseDown(event: MouseEvent, articleId: string): void {
    event.preventDefault();
    this.swipeStates[articleId] = {
      isSwipeActive: false,
      swipeDistance: 0,
      startX: event.clientX,
      currentX: event.clientX,
      startY: event.clientY,    // Add this line
      currentY: event.clientY   // Add this line
    };
    
    // Add mouse move and up listeners
    const onMouseMove = (e: MouseEvent) => this.onMouseMove(e, articleId);
    const onMouseUp = (e: MouseEvent) => {
      this.onMouseUp(e, articleId);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
  
  onMouseMove(event: MouseEvent, articleId: string): void {
    if (!this.swipeStates[articleId]) return;
    
    const swipeState = this.swipeStates[articleId];
    swipeState.currentX = event.clientX;
    swipeState.currentY = event.clientY;  // Add this line
    const deltaX = swipeState.startX - swipeState.currentX;
    
    // Only allow left swipe (positive deltaX)
    if (deltaX > 10) {
      swipeState.isSwipeActive = true;
      swipeState.swipeDistance = Math.min(deltaX, this.MAX_SWIPE_DISTANCE);
      
      // Update the visual position
      this.updateSwipePosition(articleId, swipeState.swipeDistance);
    } else if (deltaX < -10) {
      // Right swipe - reset
      this.resetSwipe(articleId);
    }
  }

  onMouseUp(event: MouseEvent, articleId: string): void {
    this.onTouchEnd(event as any, articleId);
  }

  private updateSwipePosition(articleId: string, distance: number): void {
    const element = document.querySelector(`[data-article-id="${articleId}"]`) as HTMLElement;
    if (element) {
      element.style.transform = `translateX(-${distance}px)`;
      element.style.transition = 'none';
      
      // Update delete indicator opacity
      const deleteIndicator = element.querySelector('.delete-indicator') as HTMLElement;
      if (deleteIndicator) {
        const opacity = Math.min(distance / this.SWIPE_THRESHOLD, 1);
        deleteIndicator.style.opacity = opacity.toString();
        deleteIndicator.style.transform = `translateX(${Math.max(0, this.MAX_SWIPE_DISTANCE - distance)}px)`;
      }
    }
  }

  private resetSwipe(articleId: string): void {
    const element = document.querySelector(`[data-article-id="${articleId}"]`) as HTMLElement;
    if (element) {
      element.style.transform = 'translateX(0)';
      element.style.transition = 'transform 0.3s ease';
      
      // Reset delete indicator
      const deleteIndicator = element.querySelector('.delete-indicator') as HTMLElement;
      if (deleteIndicator) {
        deleteIndicator.style.opacity = '0';
      }
    }
    
    // Reset swipe state after animation
    setTimeout(() => {
      if (this.swipeStates[articleId]) {
        this.swipeStates[articleId].isSwipeActive = false;
        this.swipeStates[articleId].swipeDistance = 0;
      }
    }, 300);
  }

  private onSwipeDelete(articleId: string): void {
    // Find the article to get its name
    this.dataService.getArticles().pipe(takeUntil(this.destroy$)).subscribe(articles => {
      const article = articles.find(a => a.id === articleId);
      if (!article) return;
      
      // Reset swipe immediately
      this.resetSwipe(articleId);
      
      // Check if article is active in any lists first
      this.dataService.getListsWithActiveArticle(articleId)
        .pipe(takeUntil(this.destroy$))
        .subscribe(activeInLists => {
          if (activeInLists.length > 0) {
            const listNames = activeInLists.map(list => list.name).join(', ');
            this.showActiveInListsDialog(article.name, listNames);
          } else {
            this.showDeleteConfirmation(article);
          }
        });
    });
  }

  private showActiveInListsDialog(articleName: string, listNames: string): void {
    const dialogData: ConfirmDialogData = {
      title: 'Artikel kann nicht gelöscht werden',
      message: `Der Artikel "${articleName}" ist noch aktiv in folgenden Listen: ${listNames}. Entfernen Sie den Artikel zuerst aus diesen Listen oder setzen Sie ihn auf "erledigt".`,
      confirmText: 'Verstanden',
      showCancel: false,
      isDestructive: false
    };

    this.dialog.open(ConfirmDialogComponent, {
      width: '90%',
      maxWidth: '400px',
      data: dialogData
    });
  }

  private showDeleteConfirmation(article: Article): void {
    const dialogData: ConfirmDialogData = {
      title: 'Artikel löschen',
      message: `Möchten Sie "${article.name}" wirklich löschen? Der Artikel wird auch aus allen Listen entfernt, in denen er als erledigt markiert ist.`,
      confirmText: 'Löschen',
      cancelText: 'Abbrechen',
      showCancel: true,
      isDestructive: true
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '90%',
      maxWidth: '400px',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.performDelete(article);
      }
    });
  }

  private performDelete(article: Article): void {
    this.dataService.deleteArticleAndCleanupLists(article.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        if (result.success) {
          this.snackBar.open('Artikel erfolgreich gelöscht', 'OK', { duration: 2000 });
        } else if (result.activeInLists) {
          this.snackBar.open('Artikel ist noch in aktiven Listen', 'OK', { duration: 3000 });
        } else {
          this.snackBar.open(result.error || 'Fehler beim Löschen', 'OK', { duration: 3000 });
        }
      });
  }
}