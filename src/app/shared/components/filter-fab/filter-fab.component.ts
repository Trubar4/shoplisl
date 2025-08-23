import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export type ShoppingFilter = 'offen' | 'erledigt' | 'alle';
export type EditFilter = 'gelistet' | 'fehlend' | 'alle';
export type ViewMode = 'shopping' | 'edit';

export interface FilterOption {
  value: string;
  label: string;
  icon: string;
  tooltip: string;
}

/**
 * FilterFabComponent
 * 
 * Floating Action Button with expandable filter options.
 * Shows different filters based on current view mode (shopping/edit).
 * 
 * @example
 * <app-filter-fab
 *   [isExpanded]="isFabExpanded"
 *   [mode]="currentMode"
 *   [currentShoppingFilter]="currentShoppingFilter"
 *   [currentEditFilter]="currentEditFilter"
 *   (toggleExpanded)="toggleFab()"
 *   (close)="closeFab()"
 *   (filterChange)="onFilterChange($event)">
 * </app-filter-fab>
 */
@Component({
  selector: 'app-filter-fab',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule
  ],
  templateUrl: './filter-fab.component.html',
  styleUrls: ['./filter-fab.component.scss']
})
export class FilterFabComponent {
  @Input() isExpanded = false;
  @Input() mode: ViewMode = 'shopping';
  @Input() currentShoppingFilter: ShoppingFilter = 'offen';
  @Input() currentEditFilter: EditFilter = 'alle';

  @Output() toggleExpanded = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  @Output() filterChange = new EventEmitter<{
    mode: ViewMode;
    filter: ShoppingFilter | EditFilter;
  }>();

  private readonly shoppingFilters: FilterOption[] = [
    {
      value: 'offen',
      label: 'Offen',
      icon: 'radio_button_unchecked',
      tooltip: 'Nur offene Artikel anzeigen'
    },
    {
      value: 'erledigt',
      label: 'Erledigt',
      icon: 'check_circle',
      tooltip: 'Nur erledigte Artikel anzeigen'
    },
    {
      value: 'alle',
      label: 'Alle',
      icon: 'list',
      tooltip: 'Alle Artikel anzeigen'
    }
  ];

  private readonly editFilters: FilterOption[] = [
    {
      value: 'gelistet',
      label: 'Gelistet',
      icon: 'add_circle',
      tooltip: 'Nur Artikel in der Liste anzeigen'
    },
    {
      value: 'fehlend',
      label: 'Fehlend',
      icon: 'remove_circle_outline',
      tooltip: 'Nur Artikel außerhalb der Liste anzeigen'
    },
    {
      value: 'alle',
      label: 'Alle',
      icon: 'apps',
      tooltip: 'Alle verfügbaren Artikel anzeigen'
    }
  ];

  getFilterOptions(): FilterOption[] {
    return this.mode === 'shopping' ? this.shoppingFilters : this.editFilters;
  }

  isFilterActive(filterValue: string): boolean {
    if (this.mode === 'shopping') {
      return this.currentShoppingFilter === filterValue;
    }
    return this.currentEditFilter === filterValue;
  }

  selectFilter(filterValue: string): void {
    this.filterChange.emit({
      mode: this.mode,
      filter: filterValue as ShoppingFilter | EditFilter
    });
    this.close.emit();
  }
}