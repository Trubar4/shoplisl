import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DateChipComponent } from './date-chip.component';
import { HistoryService } from '../../../core/services/history.service';

describe('DateChipComponent', () => {
  let component: DateChipComponent;
  let historyServiceMock: any;

  beforeEach(() => {
    historyServiceMock = {
      formatDate: vi.fn((date: Date) => {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
      })
    };

    component = new DateChipComponent(historyServiceMock);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default type as "checked"', () => {
    expect(component.type).toBe('checked');
  });

  it('should return correct prefix for checked type', () => {
    component.type = 'checked';
    expect(component.prefix).toBe('−');
  });

  it('should return correct prefix for added type', () => {
    component.type = 'added';
    expect(component.prefix).toBe('+');
  });

  it('should format date correctly using HistoryService', () => {
    const date = new Date('2025-11-22T10:30:00');
    component.date = date;

    const formatted = component.formattedDate;
    expect(formatted).toBe('22.11.2025');
    expect(historyServiceMock.formatDate).toHaveBeenCalledWith(date);
  });

  it('should return empty string for undefined date', () => {
    component.date = undefined;
    expect(component.formattedDate).toBe('');
  });

  it('should handle different dates', () => {
    const dates = [
      new Date('2025-01-01T00:00:00'),
      new Date('2025-12-31T23:59:59'),
      new Date('2025-06-15T12:00:00')
    ];

    dates.forEach(date => {
      component.date = date;
      expect(component.formattedDate).toBeTruthy();
      expect(historyServiceMock.formatDate).toHaveBeenCalledWith(date);
    });
  });
});
