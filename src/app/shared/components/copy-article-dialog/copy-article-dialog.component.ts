import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface CopyArticleDialogData {
  articleName: string;
  ownerEmail: string;
}

export interface CopyArticleDialogResult {
  confirmed: boolean;
}

@Component({
  selector: 'app-copy-article-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="copy-dialog">
      <div class="dialog-header">
        <mat-icon class="warning-icon">content_copy</mat-icon>
        <h2 mat-dialog-title>Lokale Kopie erstellen?</h2>
      </div>

      <mat-dialog-content>
        <div class="dialog-message">
          <p class="article-info">
            <strong>{{ data.articleName }}</strong>
          </p>
          <p class="owner-info">
            gehört <strong>{{ data.ownerEmail }}</strong>
          </p>
          <p class="explanation">
            Eine lokale Kopie wird für Ihre Liste erstellt. Sie können Ihre
            lokale Kopie vollständig bearbeiten und umbenennen.
          </p>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button (click)="onCancel()">
          Abbrechen
        </button>
        <button mat-raised-button color="primary" (click)="onConfirm()">
          Kopie erstellen
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .copy-dialog {
      padding: 8px;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;

      .warning-icon {
        color: #ff9800;
        font-size: 32px;
        width: 32px;
        height: 32px;
      }

      h2 {
        margin: 0;
        font-size: 20px;
      }
    }

    .dialog-message {
      .article-info {
        margin: 0 0 8px 0;
        font-size: 16px;
      }

      .owner-info {
        margin: 0 0 16px 0;
        color: #666;
        font-size: 14px;
      }

      .explanation {
        margin: 0;
        padding: 12px;
        background-color: #f5f5f5;
        border-radius: 4px;
        font-size: 14px;
        line-height: 1.5;
      }
    }

    mat-dialog-actions {
      margin-top: 24px;
      padding: 0;
    }
  `]
})
export class CopyArticleDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<CopyArticleDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CopyArticleDialogData
  ) {}

  onCancel(): void {
    this.dialogRef.close({ confirmed: false });
  }

  onConfirm(): void {
    this.dialogRef.close({ confirmed: true });
  }
}
