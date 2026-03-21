import { vi } from 'vitest';
import { MatDialogRef } from '@angular/material/dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog';

describe('ConfirmDialogComponent', () => {
  let dialogRefMock: { close: ReturnType<typeof vi.fn> };

  const makeComponent = (data: ConfirmDialogData): ConfirmDialogComponent =>
    new ConfirmDialogComponent(dialogRefMock as unknown as MatDialogRef<ConfirmDialogComponent>, data);

  beforeEach(() => {
    dialogRefMock = { close: vi.fn() };
  });

  it('should create', () => {
    const component = makeComponent({ title: 'Test', message: 'Nachricht' });
    expect(component).toBeTruthy();
  });

  describe('default values', () => {
    it('should set confirmText to "OK" when not provided', () => {
      const component = makeComponent({ title: 'T', message: 'M' });
      expect(component.data.confirmText).toBe('OK');
    });

    it('should set cancelText to "Abbrechen" when not provided', () => {
      const component = makeComponent({ title: 'T', message: 'M' });
      expect(component.data.cancelText).toBe('Abbrechen');
    });

    it('should set showCancel to true by default', () => {
      const component = makeComponent({ title: 'T', message: 'M' });
      expect(component.data.showCancel).toBe(true);
    });

    it('should set isDestructive to false by default', () => {
      const component = makeComponent({ title: 'T', message: 'M' });
      expect(component.data.isDestructive).toBe(false);
    });
  });

  describe('custom values', () => {
    it('should use provided confirmText', () => {
      const component = makeComponent({ title: 'T', message: 'M', confirmText: 'Ja' });
      expect(component.data.confirmText).toBe('Ja');
    });

    it('should use provided cancelText', () => {
      const component = makeComponent({ title: 'T', message: 'M', cancelText: 'Nein' });
      expect(component.data.cancelText).toBe('Nein');
    });

    it('should set showCancel to false when explicitly false', () => {
      const component = makeComponent({ title: 'T', message: 'M', showCancel: false });
      expect(component.data.showCancel).toBe(false);
    });

    it('should set isDestructive to true when provided', () => {
      const component = makeComponent({ title: 'T', message: 'M', isDestructive: true });
      expect(component.data.isDestructive).toBe(true);
    });
  });

  describe('onConfirm()', () => {
    it('should close dialog with true', () => {
      const component = makeComponent({ title: 'Test', message: 'Löschen?' });
      component.onConfirm();
      expect(dialogRefMock.close).toHaveBeenCalledWith(true);
    });
  });

  describe('onCancel()', () => {
    it('should close dialog with false', () => {
      const component = makeComponent({ title: 'Test', message: 'Löschen?' });
      component.onCancel();
      expect(dialogRefMock.close).toHaveBeenCalledWith(false);
    });
  });

  it('data property should be publicly accessible', () => {
    const data: ConfirmDialogData = { title: 'Titel', message: 'Nachricht' };
    const component = makeComponent(data);
    expect(component.data.title).toBe('Titel');
    expect(component.data.message).toBe('Nachricht');
  });
});
