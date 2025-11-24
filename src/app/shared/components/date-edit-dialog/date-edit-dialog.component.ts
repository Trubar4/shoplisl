import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

export interface DateEditDialogData {
  title: string;
  currentDate?: Date;
}

export interface DateEditDialogResult {
  date: Date;
}

@Component({
  selector: 'app-date-edit-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Datum wählen</mat-label>
        <input
          matInput
          [matDatepicker]="picker"
          [(ngModel)]="selectedDate"
          placeholder="TT.MM.JJJJ">
        <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
        <mat-datepicker #picker></mat-datepicker>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Uhrzeit</mat-label>
        <input
          matInput
          type="time"
          [(ngModel)]="selectedTime"
          placeholder="HH:MM">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Abbrechen</button>
      <button mat-raised-button color="primary" (click)="onSave()" [disabled]="!selectedDate">
        Speichern
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width {
      width: 100%;
      margin-bottom: 16px;
    }

    mat-dialog-content {
      min-width: 300px;
      padding: 20px 24px;
    }
  `]
})
export class DateEditDialogComponent {
  selectedDate: Date;
  selectedTime: string;

  constructor(
    public dialogRef: MatDialogRef<DateEditDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DateEditDialogData
  ) {
    // Initialize with current date or now
    this.selectedDate = data.currentDate || new Date();

    // Initialize time from current date
    const hours = this.selectedDate.getHours().toString().padStart(2, '0');
    const minutes = this.selectedDate.getMinutes().toString().padStart(2, '0');
    this.selectedTime = `${hours}:${minutes}`;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (!this.selectedDate) return;

    // Combine date and time
    const [hours, minutes] = this.selectedTime.split(':').map(Number);
    const resultDate = new Date(this.selectedDate);
    resultDate.setHours(hours || 0, minutes || 0, 0, 0);

    this.dialogRef.close({ date: resultDate });
  }
}
