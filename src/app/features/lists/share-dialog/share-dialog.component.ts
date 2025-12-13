import { Component, Inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { take } from 'rxjs/operators';

import { Firestore, doc, getDoc } from '@angular/fire/firestore';

import { SharingService } from '../../../core/services/sharing.service';
import { AuthService } from '../../../core/services/auth.service';
import { ShoppingList } from '../../../core/models';
import { UnshareDialogComponent, UnshareDialogData, UnshareAction } from '../unshare-dialog/unshare-dialog.component';

export interface ShareDialogData {
  list: ShoppingList;
}

interface Collaborator {
  userId: string;
  email: string;
  canRemove: boolean;
}

@Component({
  selector: 'app-share-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatInputModule,
    MatFormFieldModule
  ],
  templateUrl: './share-dialog.component.html',
  styleUrls: ['./share-dialog.component.scss']
})
export class ShareDialogComponent implements OnInit {
  loading = false;
  newEmail = '';
  collaborators: Collaborator[] = [];
  currentUserId: string | null = null;
  isOwner = false;

  constructor(
    public dialogRef: MatDialogRef<ShareDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ShareDialogData,
    private sharingService: SharingService,
    private authService: AuthService,
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) {}

  async ngOnInit(): Promise<void> {
    console.log('🔍 Share Dialog ngOnInit START');

    try {
      // Get current user and determine ownership
      console.log('  Getting current user...');
      const currentUser = await this.authService.getCurrentUser().pipe(take(1)).toPromise();
      console.log('  Current user retrieved:', currentUser);

      this.currentUserId = currentUser?.id || null;
      this.isOwner = currentUser?.id === this.data.list.ownerId;

      // Debug logging
      console.log('🔍 Share Dialog Debug:');
      console.log('  Current User ID:', this.currentUserId);
      console.log('  List Owner ID:', this.data.list.ownerId);
      console.log('  Is Owner?', this.isOwner);
      console.log('  Comparison:', {
        currentUserId: this.currentUserId,
        listOwnerId: this.data.list.ownerId,
        areEqual: this.currentUserId === this.data.list.ownerId,
        bothTruthy: !!this.currentUserId && !!this.data.list.ownerId
      });

      // Load collaborators
      await this.loadCollaborators();

      // Trigger change detection to fix ExpressionChangedAfterItHasBeenCheckedError
      this.cdr.detectChanges();

      console.log('🔍 Share Dialog ngOnInit COMPLETE');
    } catch (error) {
      console.error('❌ Error in share dialog ngOnInit:', error);
    }
  }

  private async loadCollaborators(): Promise<void> {
    const collabs: Collaborator[] = [];

    // Add owner (always first)
    const ownerEmail = await this.getUserEmail(this.data.list.ownerId);
    collabs.push({
      userId: this.data.list.ownerId,
      email: ownerEmail ? `${ownerEmail} (Besitzer)` : 'Besitzer',
      canRemove: false
    });

    // Add collaborators from sharedWith array
    if (this.data.list.sharedWith && this.data.list.sharedWith.length > 0) {
      for (const userId of this.data.list.sharedWith) {
        const userEmail = await this.getUserEmail(userId);
        collabs.push({
          userId,
          email: userEmail || `${userId.substring(0, 8)}...`,
          canRemove: this.isOwner
        });
      }
    }

    this.collaborators = collabs;
  }

  /**
   * Fetch user email from Firestore user profile
   */
  private async getUserEmail(userId: string): Promise<string | null> {
    try {
      const profileRef = doc(this.firestore, `users-v2/${userId}/profile/info`);
      const profileSnap = await getDoc(profileRef);

      if (profileSnap.exists()) {
        const data = profileSnap.data();
        return data['email'] || null;
      }

      return null;
    } catch (error) {
      console.error(`Failed to fetch email for user ${userId}:`, error);
      return null;
    }
  }

  async addCollaborator(): Promise<void> {
    if (!this.newEmail || !this.newEmail.trim()) {
      this.snackBar.open('Bitte E-Mail-Adresse eingeben', 'OK', { duration: 2000 });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.newEmail)) {
      this.snackBar.open('Ungültige E-Mail-Adresse', 'OK', { duration: 2000 });
      return;
    }

    this.loading = true;
    try {
      // Create invite link
      const invite = await this.sharingService.createShareInvite(
        this.data.list.id,
        this.data.list.name
      );

      const inviteLink = this.sharingService.getShareableLink(invite.inviteToken);

      // TODO: Send email with invite link
      // For now, just show the link and copy to clipboard
      this.snackBar.open(
        `Einladung erstellt für ${this.newEmail}. Link wurde in die Zwischenablage kopiert.`,
        'OK',
        { duration: 4000 }
      );

      // Copy to clipboard for now (until email service is implemented)
      navigator.clipboard.writeText(
        `Ich lade dich zur Liste "${this.data.list.name}" ein: ${inviteLink}`
      );

      // Clear input
      this.newEmail = '';
      this.loading = false;
    } catch (error: any) {
      console.error('Failed to create invite:', error);
      this.snackBar.open('Fehler beim Erstellen der Einladung', 'OK', { duration: 3000 });
      this.loading = false;
    }
  }

  async removeCollaborator(collaborator: Collaborator): Promise<void> {
    if (!collaborator.canRemove || !this.currentUserId) return;

    // Show confirmation with options
    const action = await this.showUnshareDialog(collaborator);

    if (action === 'cancel') return;

    try {
      await this.sharingService.removeCollaborator(
        this.data.list.id,
        collaborator.userId,
        this.data.list.name
      );

      this.snackBar.open('Nutzer wurde entfernt', 'OK', { duration: 2000 });

      // Reload collaborators
      await this.loadCollaborators();
      this.cdr.detectChanges();
    } catch (error: any) {
      console.error('Failed to remove collaborator:', error);
      this.snackBar.open('Fehler beim Entfernen des Nutzers', 'OK', { duration: 3000 });
    }
  }

  private async showUnshareDialog(collaborator: Collaborator): Promise<UnshareAction> {
    const dialogRef = this.dialog.open(UnshareDialogComponent, {
      width: '400px',
      data: {
        listName: this.data.list.name,
        isOwnerRemoving: this.isOwner,
        collaboratorEmail: this.isOwner ? collaborator.email : undefined
      } as UnshareDialogData
    });

    const result = await dialogRef.afterClosed().toPromise();
    return result || 'cancel';
  }

  async leaveSharedList(): Promise<void> {
    if (!this.currentUserId || this.isOwner) return;

    // Show unshare dialog
    const action = await this.showUnshareDialog({
      userId: this.currentUserId,
      email: 'myself',
      canRemove: false
    });

    if (action === 'cancel') return;

    try {
      // Remove myself from the list
      await this.sharingService.removeCollaborator(
        this.data.list.id,
        this.currentUserId,
        this.data.list.name
      );

      if (action === 'keep-copy') {
        // TODO: Create a local copy of the list
        this.snackBar.open('Liste wurde geteilt. Lokale Kopie wird erstellt...', 'OK', { duration: 3000 });
      } else {
        this.snackBar.open('Liste wurde entfernt', 'OK', { duration: 2000 });
      }

      // Close both dialogs
      this.dialogRef.close();
    } catch (error: any) {
      console.error('Failed to leave shared list:', error);
      this.snackBar.open('Fehler beim Verlassen der Liste', 'OK', { duration: 3000 });
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}
