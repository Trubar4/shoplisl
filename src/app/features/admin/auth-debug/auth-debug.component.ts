import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { Auth, user } from '@angular/fire/auth';
import { inject } from '@angular/core';

/**
 * Auth Debug Component
 * Helps verify authentication status and UID for admin access
 */
@Component({
  selector: 'app-auth-debug',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>🔐 Authentication Debug</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <div class="debug-info">
          <h3>Current Authentication Status:</h3>

          <div class="info-row">
            <strong>Authenticated:</strong>
            <span [class.success]="isAuthenticated()" [class.error]="!isAuthenticated()">
              {{ isAuthenticated() ? '✅ YES' : '❌ NO' }}
            </span>
          </div>

          <div class="info-row">
            <strong>Current UID:</strong>
            <code>{{ currentUid() || 'Not logged in' }}</code>
          </div>

          <div class="info-row">
            <strong>Expected Admin UID:</strong>
            <code>HYqET9vr40eDju4nQCTnJTV0qJo2</code>
          </div>

          <div class="info-row">
            <strong>UIDs Match:</strong>
            <span [class.success]="uidsMatch()" [class.error]="!uidsMatch()">
              {{ uidsMatch() ? '✅ YES - You are admin!' : '❌ NO - Not admin' }}
            </span>
          </div>

          <div class="info-row">
            <strong>Email:</strong>
            <span>{{ currentEmail() || 'Not logged in' }}</span>
          </div>

          <hr/>

          <div class="diagnosis">
            <h4>Diagnosis:</h4>
            <p *ngIf="!isAuthenticated()" class="error">
              ❌ You are NOT logged in. Please login first.
            </p>
            <p *ngIf="isAuthenticated() && !uidsMatch()" class="error">
              ❌ You are logged in, but not with the admin account.
              <br/>Current: {{ currentEmail() }}
              <br/>Expected: philipp.thurnher@gmail.com
            </p>
            <p *ngIf="isAuthenticated() && uidsMatch()" class="success">
              ✅ You are logged in as admin! Analytics should work.
              <br/>If you still see permission errors, the Firestore rules may not be deployed.
            </p>
          </div>

          <div class="actions">
            <button mat-raised-button color="primary" (click)="copyUid()">
              Copy Current UID
            </button>
            <button mat-raised-button (click)="refresh()">
              Refresh
            </button>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .debug-info {
      padding: 16px 0;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #e0e0e0;

      strong {
        font-weight: 600;
      }

      code {
        background-color: #f5f5f5;
        padding: 4px 8px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 12px;
      }

      .success {
        color: #4caf50;
        font-weight: 600;
      }

      .error {
        color: #f44336;
        font-weight: 600;
      }
    }

    hr {
      margin: 24px 0;
      border: none;
      border-top: 2px solid #e0e0e0;
    }

    .diagnosis {
      margin: 16px 0;

      h4 {
        margin-bottom: 12px;
      }

      p {
        padding: 16px;
        border-radius: 8px;
        margin: 8px 0;

        &.success {
          background-color: #e8f5e9;
          border-left: 4px solid #4caf50;
        }

        &.error {
          background-color: #ffebee;
          border-left: 4px solid #f44336;
        }
      }
    }

    .actions {
      display: flex;
      gap: 16px;
      margin-top: 24px;
    }
  `]
})
export class AuthDebugComponent implements OnInit {
  private auth = inject(Auth);

  isAuthenticated = signal(false);
  currentUid = signal<string | null>(null);
  currentEmail = signal<string | null>(null);

  private readonly ADMIN_UID = 'HYqET9vr40eDju4nQCTnJTV0qJo2';

  ngOnInit() {
    this.checkAuth();
  }

  private checkAuth() {
    user(this.auth).subscribe(user => {
      this.isAuthenticated.set(!!user);
      this.currentUid.set(user?.uid || null);
      this.currentEmail.set(user?.email || null);

      console.log('🔐 Auth Debug:', {
        authenticated: !!user,
        uid: user?.uid,
        email: user?.email,
        isAdmin: user?.uid === this.ADMIN_UID
      });
    });
  }

  uidsMatch(): boolean {
    return this.currentUid() === this.ADMIN_UID;
  }

  copyUid() {
    const uid = this.currentUid();
    if (uid) {
      navigator.clipboard.writeText(uid);
      alert('UID copied to clipboard!');
    }
  }

  refresh() {
    this.checkAuth();
  }
}
