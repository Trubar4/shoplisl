import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { Auth, user } from '@angular/fire/auth';
import { Firestore, collection, getDocs, query, limit, collectionGroup } from '@angular/fire/firestore';
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

          <h3>Firestore Permission Tests:</h3>

          <div class="info-row">
            <strong>Users Query:</strong>
            <span [class.success]="usersTest() === 'success'" [class.error]="usersTest() === 'error'">
              {{ usersTestMessage() }}
            </span>
          </div>

          <div class="info-row">
            <strong>Lists CollectionGroup:</strong>
            <span [class.success]="listsTest() === 'success'" [class.error]="listsTest() === 'error'">
              {{ listsTestMessage() }}
            </span>
          </div>

          <div class="info-row">
            <strong>Articles CollectionGroup:</strong>
            <span [class.success]="articlesTest() === 'success'" [class.error]="articlesTest() === 'error'">
              {{ articlesTestMessage() }}
            </span>
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
            <p *ngIf="isAuthenticated() && uidsMatch() && listsTest() === 'error'" class="error">
              ❌ You are logged in as admin, but collectionGroup queries are failing.
              <br/>This suggests the Firestore rules aren't deployed correctly.
              <br/><strong>Try: firebase deploy --only firestore:rules</strong>
            </p>
            <p *ngIf="isAuthenticated() && uidsMatch() && listsTest() === 'success'" class="success">
              ✅ You are logged in as admin! All permissions working correctly.
            </p>
          </div>

          <div class="actions">
            <button mat-raised-button color="primary" (click)="copyUid()">
              Copy Current UID
            </button>
            <button mat-raised-button (click)="refresh()">
              Refresh
            </button>
            <button mat-raised-button color="accent" (click)="testPermissions()">
              Test Permissions
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
  private firestore = inject(Firestore);

  isAuthenticated = signal(false);
  currentUid = signal<string | null>(null);
  currentEmail = signal<string | null>(null);

  // Permission test results
  usersTest = signal<'pending' | 'success' | 'error'>('pending');
  usersTestMessage = signal('Click "Test Permissions"');
  listsTest = signal<'pending' | 'success' | 'error'>('pending');
  listsTestMessage = signal('Click "Test Permissions"');
  articlesTest = signal<'pending' | 'success' | 'error'>('pending');
  articlesTestMessage = signal('Click "Test Permissions"');

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

      // Auto-run permission tests when authenticated
      if (user) {
        setTimeout(() => this.testPermissions(), 1000);
      }
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

  async testPermissions() {
    console.log('🧪 Testing Firestore permissions...');

    // Test 1: Users (top-level collection)
    try {
      const usersQuery = query(collection(this.firestore, 'users-v2'), limit(1));
      const usersSnapshot = await getDocs(usersQuery);
      this.usersTest.set('success');
      this.usersTestMessage.set(`✅ ${usersSnapshot.size} user(s)`);
      console.log('✅ Users query succeeded:', usersSnapshot.size);
    } catch (error: any) {
      this.usersTest.set('error');
      this.usersTestMessage.set(`❌ ${error.code || 'Error'}`);
      console.error('❌ Users query failed:', error);
    }

    // Test 2: Lists (collectionGroup)
    try {
      const listsQuery = query(collectionGroup(this.firestore, 'lists'), limit(1));
      const listsSnapshot = await getDocs(listsQuery);
      this.listsTest.set('success');
      this.listsTestMessage.set(`✅ ${listsSnapshot.size} list(s)`);
      console.log('✅ Lists collectionGroup query succeeded:', listsSnapshot.size);
    } catch (error: any) {
      this.listsTest.set('error');
      this.listsTestMessage.set(`❌ ${error.code || 'Error'}`);
      console.error('❌ Lists collectionGroup query failed:', error);
    }

    // Test 3: Articles (collectionGroup)
    try {
      const articlesQuery = query(collectionGroup(this.firestore, 'articles'), limit(1));
      const articlesSnapshot = await getDocs(articlesQuery);
      this.articlesTest.set('success');
      this.articlesTestMessage.set(`✅ ${articlesSnapshot.size} article(s)`);
      console.log('✅ Articles collectionGroup query succeeded:', articlesSnapshot.size);
    } catch (error: any) {
      this.articlesTest.set('error');
      this.articlesTestMessage.set(`❌ ${error.code || 'Error'}`);
      console.error('❌ Articles collectionGroup query failed:', error);
    }
  }
}
