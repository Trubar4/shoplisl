import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { take } from 'rxjs/operators';
import { SharingService } from '../../../core/services/sharing.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoggerService } from '../../../core/services/logger.service';
import { DataService } from '../../../core/services/data.service';

/**
 * Component for accepting list share invites
 * Accessed via /invite/{token} URL
 *
 * Flow:
 * 1. User clicks on shared link (e.g., from WhatsApp, email)
 * 2. App opens to /invite/{token}
 * 3. This component extracts token from URL
 * 4. Calls SharingService.acceptInvite(token)
 * 5. Redirects to the shared list on success
 */
@Component({
  selector: 'app-accept-invite',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './accept-invite.component.html',
  styleUrls: ['./accept-invite.component.scss']
})
export class AcceptInviteComponent implements OnInit, OnDestroy {
  loading = true;
  error: string | null = null;
  success = false;
  listName = '';
  private redirectTimeout: any = null; // Store timeout handle to cancel if needed

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sharingService: SharingService,
    private authService: AuthService,
    private logger: LoggerService,
    private dataService: DataService
  ) {}

  ngOnDestroy(): void {
    // Clear any pending redirects
    if (this.redirectTimeout) {
      console.log('🔗 AcceptInviteComponent: Clearing pending redirect timeout');
      clearTimeout(this.redirectTimeout);
      this.redirectTimeout = null;
    }
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  ngOnInit(): void {
    console.log('🔗 AcceptInviteComponent: ngOnInit started');
    this.logger.info('invite', 'AcceptInviteComponent initialized');

    // Extract invite token from URL params
    const token = this.route.snapshot.paramMap.get('token');
    console.log('🔗 AcceptInviteComponent: Token from URL:', token);

    if (!token) {
      this.logger.error('invite', 'No token in URL');
      this.error = 'Ungültiger Einladungslink';
      this.loading = false;
      return;
    }

    // Wait a moment for Firebase auth to stabilize before checking
    console.log('🔗 AcceptInviteComponent: Waiting for auth state to stabilize...');
    setTimeout(() => {
      this.checkAuthAndProcessInvite(token);
    }, 500);
  }

  private checkAuthAndProcessInvite(token: string): void {
    // Check if user is authenticated
    this.logger.info('invite', 'Checking authentication status');
    this.authService.getCurrentUser().pipe(take(1)).subscribe(user => {
      console.log('🔗 AcceptInviteComponent: Current user:', user?.email || 'null');
      this.logger.info('invite', `Auth check result: ${user ? 'authenticated as ' + user.email : 'not authenticated'}`);

      if (!user) {
        // Not logged in - store token and redirect to login
        console.log('🔗 AcceptInviteComponent: User not authenticated, storing token and redirecting');
        this.logger.info('invite', 'User not authenticated, redirecting to login');

        // Store token for after login
        sessionStorage.setItem('pendingInviteToken', token);

        this.error = 'Bitte melden Sie sich an, um die Einladung anzunehmen';
        this.loading = false;

        // Redirect to home page (which shows login) after 2 seconds
        // Store timeout handle so we can cancel it if needed
        this.redirectTimeout = setTimeout(() => {
          this.logger.info('invite', 'Redirecting to login page');
          this.router.navigate(['/']);
        }, 2000);
        return;
      }

      // User IS authenticated - process the invite immediately
      // DO NOT store token in sessionStorage to avoid redirect loops
      console.log('🔗 AcceptInviteComponent: User authenticated, processing invite immediately');
      this.logger.info('invite', `User authenticated, proceeding with invite acceptance`);
      this.acceptInvite(token);
    });
  }

  private async acceptInvite(token: string): Promise<void> {
    try {
      this.logger.info('invite', `Accepting invite with token: ${token}`);
      console.log('🔗 AcceptInviteComponent: Calling sharingService.acceptInvite()');

      const list = await this.sharingService.acceptInvite(token);
      console.log('🔗 AcceptInviteComponent: acceptInvite() returned:', list);

      if (!list) {
        console.log('🔗 AcceptInviteComponent: No list returned (invite not found or already used)');
        this.error = 'Einladung nicht gefunden oder bereits verwendet';
        this.loading = false;
        return;
      }

      this.listName = list.name;
      this.success = true;
      this.loading = false;

      this.logger.info('invite', `Successfully accepted invite for list: ${list.name}`);
      console.log('🔗 AcceptInviteComponent: Success! Refreshing data...');

      // Refresh data to reload shared lists with new permissions
      this.dataService.refreshData();
      console.log('🔗 AcceptInviteComponent: Data refresh triggered, redirecting to list...');

      // Redirect to the list after 2 seconds
      setTimeout(() => {
        this.router.navigate(['/lists', list.id]);
      }, 2000);

    } catch (error: any) {
      console.error('🔗 AcceptInviteComponent: ERROR accepting invite:', error);
      console.error('🔗 AcceptInviteComponent: Error message:', error?.message);
      console.error('🔗 AcceptInviteComponent: Error code:', error?.code);
      this.logger.error('invite', 'Failed to accept invite', error);

      if (error.message.includes('Cannot accept your own invite')) {
        this.error = 'Sie können Ihre eigene Einladung nicht annehmen';
      } else if (error.message.includes('User must be authenticated')) {
        this.error = 'Bitte melden Sie sich an, um die Einladung anzunehmen';
        // Redirect to login after 2 seconds
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 2000);
      } else {
        this.error = 'Fehler beim Annehmen der Einladung. Bitte versuchen Sie es später erneut.';
      }

      this.loading = false;
    }
  }
}
