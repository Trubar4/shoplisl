import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface NumberEditDialogData {
  title: string;
  label: string;
  currentValue: number;
  min?: number;
  max?: number;
}

export interface NumberEditDialogResult {
  value: number;
}

@Component({
  selector: 'app-number-edit-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>{{ data.label }}</mat-label>
        <input
          matInput
          type="number"
          [(ngModel)]="selectedValue"
          [min]="data.min || 0"
          [attr.max]="data.max || null"
          placeholder="Anzahl eingeben">
      </mat-form-field>
      <p class="hint-text">
        Aktuelle Anzahl: {{ data.currentValue }}
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Abbrechen</button>
      <button mat-raised-button color="primary" (click)="onSave()" [disabled]="selectedValue == null || selectedValue < 0">
        Speichern
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width {
      width: 100%;
      margin-bottom: 8px;
    }

    mat-dialog-content {
      min-width: 300px;
      padding: 20px 24px;
    }

    .hint-text {
      font-size: 0.875rem;
      color: #666;
      margin: 0;
    }
  `]
})
export class NumberEditDialogComponent {
  selectedValue: number;

  constructor(
    public dialogRef: MatDialogRef<NumberEditDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: NumberEditDialogData
  ) {
    this.selectedValue = data.currentValue;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (this.selectedValue == null || this.selectedValue < 0) return;
    this.dialogRef.close({ value: this.selectedValue });
  }
}
