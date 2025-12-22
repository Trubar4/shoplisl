// src/app/shared/components/api-key-tip-dialog/api-key-tip-dialog.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-api-key-tip-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="api-tip-dialog">
      <div class="tip-header">
        <mat-icon class="tip-icon">lightbulb</mat-icon>
        <h2 mat-dialog-title>💡 Tipp</h2>
      </div>
      <mat-dialog-content>
        <p class="tip-message">
          Setze den Groq API-Schlüssel für intelligentere Abteilungs- und Icon-Vorschläge
        </p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-raised-button color="primary" (click)="close()">
          OK
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .api-tip-dialog {
      padding: 8px;
    }

    .tip-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;

      .tip-icon {
        color: #1a9edb;
        font-size: 32px;
        width: 32px;
        height: 32px;
      }

      h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 500;
      }
    }

    mat-dialog-content {
      padding: 16px 0;

      .tip-message {
        margin: 0;
        font-size: 15px;
        line-height: 1.5;
        color: #333;
      }
    }

    mat-dialog-actions {
      padding: 8px 0 0;
      margin: 0;

      button {
        min-width: 100px;
      }
    }
  `]
})
export class ApiKeyTipDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<ApiKeyTipDialogComponent>
  ) {}

  close(): void {
    this.dialogRef.close();
  }
}
