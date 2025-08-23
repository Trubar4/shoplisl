import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { BehaviorSubject, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

export interface SearchDisambiguation {
  query: string;
  options: any[];
  message: string;
}

/**
 * SearchDisambiguationComponent
 * 
 * Handles search input with AI-powered disambiguation suggestions.
 * Shows smart suggestions when search yields no results.
 * 
 * @example
 * <app-search-disambiguation
 *   [(searchQuery)]="searchQuery"
 *   [disambiguation]="searchDisambiguation$ | async"
 *   [placeholder]="'Artikel suchen...'"
 *   (queryChange)="onSearchQueryChange($event)"
 *   (selectOption)="onSelectDisambiguation($event)"
 *   (clearDisambiguation)="onClearDisambiguation()">
 * </app-search-disambiguation>
 */
@Component({
  selector: 'app-search-disambiguation',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './search-disambiguation.component.html',
  styleUrls: ['./search-disambiguation.component.scss']
})
export class SearchDisambiguationComponent implements OnInit, OnDestroy {
  @Input() searchQuery = '';
  @Input() disambiguation: SearchDisambiguation | null = null;
  @Input() placeholder = 'Suchen...';
  @Input() getDepartmentNameGerman?: (departmentId: string) => string;

  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() queryChange = new EventEmitter<string>();
  @Output() selectOption = new EventEmitter<any>();
  @Output() clearDisambiguation = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();
  private readonly searchQuery$ = new BehaviorSubject<string>('');

  ngOnInit(): void {
    // Debounced search query emission
    this.searchQuery$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      this.queryChange.emit(query);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onInputChange(): void {
    this.searchQueryChange.emit(this.searchQuery);
    this.searchQuery$.next(this.searchQuery.trim());
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchQueryChange.emit('');
    this.searchQuery$.next('');
    this.clearDisambiguation.emit();
  }

  getDepartmentDisplay(option: any): string {
    if (this.getDepartmentNameGerman && option.suggestedDepartmentId) {
      return this.getDepartmentNameGerman(option.suggestedDepartmentId);
    }
    if (this.getDepartmentNameGerman && option.article?.departmentId) {
      return this.getDepartmentNameGerman(option.article.departmentId);
    }
    return option.department || 'Sonstiges';
  }

  getConfidenceDisplay(confidence: number): string {
    return confidence > 0.9 ? 'Sehr ähnlich' : 'Ähnlich';
  }

  getActionHint(type: string): string {
    return type === 'existing' ? 'Hinzufügen' : 'Erstellen';
  }
}