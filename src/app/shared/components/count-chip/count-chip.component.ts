import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * CountChipComponent
 *
 * Displays the number of times an article has been checked off as a chip.
 * Used to show article usage statistics in the article overview.
 *
 * @example
 * <app-count-chip [count]="42" />
 * Displays: #42
 */
@Component({
  selector: 'app-count-chip',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (count > 0) {
      <span class="count-chip">
        #{{ count }}
      </span>
    }
  `,
  styles: [`
    .count-chip {
      display: inline-flex;
      align-items: center;
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 12px;
      margin-left: 4px;
      white-space: nowrap;
      font-weight: 500;
      background: #fff3e0;
      color: #e65100;
    }
  `]
})
export class CountChipComponent {
  @Input() count: number = 0;
}
