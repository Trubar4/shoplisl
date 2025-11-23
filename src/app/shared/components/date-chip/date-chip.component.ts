import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HistoryService } from '../../../core/services/history.service';

/**
 * DateChip Component
 *
 * Displays a date as a small colored chip with a prefix.
 * Used to show article statistics like last checked date and last added date.
 *
 * @example
 * <app-date-chip [date]="article.lastCheckedDate" type="checked" />
 * <app-date-chip [date]="article.lastAddedToListDate" type="added" />
 */
@Component({
  selector: 'app-date-chip',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (date && formattedDate) {
      <span class="date-chip" [class.checked]="type === 'checked'" [class.added]="type === 'added'">
        {{ prefix }}{{ formattedDate }}
      </span>
    }
  `,
  styles: [`
    .date-chip {
      display: inline-flex;
      align-items: center;
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 12px;
      margin-left: 4px;
      white-space: nowrap;
      font-weight: 500;

      &.checked {
        background: #e3f2fd;
        color: #1976d2;
      }

      &.added {
        background: #e8f5e9;
        color: #388e3c;
      }
    }
  `]
})
export class DateChipComponent {
  @Input() date: Date | undefined;
  @Input() type: 'checked' | 'added' = 'checked';

  constructor(private historyService: HistoryService) {}

  get prefix(): string {
    return this.type === 'checked' ? '−' : '+';
  }

  get formattedDate(): string {
    if (!this.date) return '';
    return this.historyService.formatDate(this.date);
  }
}
