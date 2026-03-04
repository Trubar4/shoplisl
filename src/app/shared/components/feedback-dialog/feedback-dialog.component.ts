import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FeedbackService, FeedbackInput } from '../../../core/services/feedback.service';
import { UserFeedback } from '../../../core/models/analytics.model';

@Component({
  selector: 'app-feedback-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './feedback-dialog.component.html'
})
export class FeedbackDialogComponent {
  type: UserFeedback['type'] = 'bug';
  description = '';
  submitting = signal(false);

  readonly typeOptions: { value: UserFeedback['type']; label: string }[] = [
    { value: 'bug', label: 'Fehler melden' },
    { value: 'feature_request', label: 'Funktion vorschlagen' },
    { value: 'other', label: 'Sonstiges' }
  ];

  constructor(
    private dialogRef: MatDialogRef<FeedbackDialogComponent>,
    private feedbackService: FeedbackService,
    private snackBar: MatSnackBar
  ) {}

  get isValid(): boolean {
    return this.description.trim().length >= 10;
  }

  async onSubmit(): Promise<void> {
    if (!this.isValid || this.submitting()) return;

    this.submitting.set(true);
    try {
      await this.feedbackService.submitFeedback({ type: this.type, description: this.description.trim() });
      this.snackBar.open('Danke für dein Feedback!', '', { duration: 3000 });
      this.dialogRef.close(true);
    } catch {
      this.snackBar.open('Feedback konnte nicht gesendet werden.', 'OK', { duration: 4000 });
    } finally {
      this.submitting.set(false);
    }
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
