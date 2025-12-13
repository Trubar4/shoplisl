import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface UnshareDialogData {
  listName: string;
  isOwnerRemoving: boolean; // true if owner is removing collaborator, false if collaborator is leaving
  collaboratorEmail?: string; // Email of the user being removed (only set when owner is removing someone)
}

export type UnshareAction = 'keep-copy' | 'delete' | 'cancel';

@Component({
  selector: 'app-unshare-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule
  ],
  template: `
    <div class="unshare-dialog">
      <h2 mat-dialog-title>
        {{ data.isOwnerRemoving ? 'Nutzer entfernen?' : 'Liste nicht mehr teilen?' }}
      </h2>

      <mat-dialog-content>
        <!-- Owner removing a collaborator -->
        <p *ngIf="data.isOwnerRemoving" class="message">
          Möchten Sie <strong>{{ data.collaboratorEmail }}</strong> von der Liste "<strong>{{ data.listName }}</strong>" entfernen?
        </p>

        <!-- Collaborator leaving -->
        <p *ngIf="!data.isOwnerRemoving" class="message">
          Möchten Sie die Liste "<strong>{{ data.listName }}</strong>" nicht mehr teilen?
        </p>

        <p *ngIf="!data.isOwnerRemoving" class="info">
          Sie können eine lokale Kopie der Liste behalten oder sie komplett löschen.
        </p>
      </mat-dialog-content>

      <mat-dialog-actions align="center" class="action-buttons">
        <button
          *ngIf="!data.isOwnerRemoving"
          mat-raised-button
          color="primary"
          (click)="close('keep-copy')"
          class="keep-button">
          Kopie behalten
        </button>

        <button
          mat-stroked-button
          color="warn"
          (click)="close('delete')"
          class="delete-button">
          {{ data.isOwnerRemoving ? 'Entfernen' : 'Für mich löschen' }}
        </button>

        <button
          mat-stroked-button
          (click)="close('cancel')"
          class="cancel-button">
          Abbrechen
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .unshare-dialog {
      padding: 8px;
      min-width: 320px;
      max-width: 500px;

      h2 {
        text-align: center;
        margin: 16px 0;
        font-size: 20px;
        font-weight: 500;
      }

      mat-dialog-content {
        padding: 16px 24px;
        text-align: center;

        .message {
          font-size: 16px;
          margin: 0 0 16px;
          color: #333;

          strong {
            color: #1976d2;
          }
        }

        .info {
          font-size: 14px;
          color: #666;
          margin: 0;
        }
      }

      .action-buttons {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px 24px 24px;

        button {
          width: 100%;
          height: 48px;
          font-size: 15px;
          font-weight: 500;
        }

        .keep-button {
          order: 1;
        }

        .delete-button {
          order: 2;
        }

        .cancel-button {
          order: 3;
          color: #1976d2;
          border-color: #1976d2;
        }
      }
    }
  `]
})
export class UnshareDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<UnshareDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: UnshareDialogData
  ) {}

  close(action: UnshareAction): void {
    this.dialogRef.close(action);
  }
}
