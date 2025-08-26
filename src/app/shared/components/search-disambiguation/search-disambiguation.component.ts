import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { BehaviorSubject, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { ListUtilsService } from '../../../core/services/list-utils.service';

export interface SearchDisambiguation {
  query: string;
  options: DisambiguationOption[];
  message: string;
}

export interface DisambiguationOption {
  type: 'existing' | 'new';
  displayName: string;
  icon?: string;
  confidence?: number;
  department?: string;
  suggestedDepartmentId?: string;
  article?: any;
}

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-disambiguation.component.html',
  styleUrls: ['./search-disambiguation.component.scss']
})
export class SearchDisambiguationComponent implements OnInit, OnDestroy {
  @Input({ required: true }) searchQuery = '';
  @Input() disambiguation: SearchDisambiguation | null = null;
  @Input() placeholder = 'Suchen...';

  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() queryChange = new EventEmitter<string>();
  @Output() selectOption = new EventEmitter<DisambiguationOption>();
  @Output() clearDisambiguation = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();
  private readonly searchQuery$ = new BehaviorSubject<string>('');

  constructor(private readonly listUtils: ListUtilsService) {}

  ngOnInit(): void {
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
    this.searchQuery$.complete();
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

  getDepartmentDisplay(option: DisambiguationOption): string {
    if (option.suggestedDepartmentId) {
      return this.listUtils.getDepartmentNameGerman(option.suggestedDepartmentId);
    }
    if (option.article?.departmentId) {
      return this.listUtils.getDepartmentNameGerman(option.article.departmentId);
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