import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

import { AppState } from '../../../state/app.state';
import { User } from '../../../core/models';
import * as AuthActions from '../../../state/auth/auth.actions';
import { selectUser, selectIsAuthenticated, selectAuthLoading } from '../../../state/auth/auth.selectors';

@Component({
  selector: 'app-auth-button',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule
  ],
  template: `
    <div class="auth-button-container">
      <!-- Loading state -->
      <button
        *ngIf="loading$ | async"
        mat-icon-button
        disabled
        class="auth-button">
        <mat-icon>hourglass_empty</mat-icon>
      </button>

      <!-- Not authenticated -->
      <button
        *ngIf="!(isAuthenticated$ | async) && !(loading$ | async)"
        mat-raised-button
        color="primary"
        (click)="signIn()"
        class="auth-button sign-in-button"
        matTooltip="Sign in with Google">
        <mat-icon>login</mat-icon>
        <span class="button-text">Sign In</span>
      </button>

      <!-- Authenticated -->
      <button
        *ngIf="(isAuthenticated$ | async) && !(loading$ | async)"
        mat-icon-button
        [matMenuTriggerFor]="userMenu"
        class="auth-button user-button"
        [matTooltip]="(user$ | async)?.email || 'User menu'">
        <mat-icon>account_circle</mat-icon>
      </button>

      <!-- User menu -->
      <mat-menu #userMenu="matMenu">
        <div class="user-info" mat-menu-item disabled>
          <div class="user-name">{{ (user$ | async)?.name }}</div>
          <div class="user-email">{{ (user$ | async)?.email }}</div>
        </div>
        <mat-divider></mat-divider>
        <button mat-menu-item (click)="openHelp()">
          <mat-icon>help_outline</mat-icon>
          <span>Hilfe/Tipps</span>
        </button>
        <mat-divider></mat-divider>
        <button mat-menu-item (click)="signOut()">
          <mat-icon>logout</mat-icon>
          <span>Sign Out</span>
        </button>
      </mat-menu>
    </div>
  `,
  styles: [`
    .auth-button-container {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .auth-button {
      margin: 0 8px;
    }

    .sign-in-button {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .button-text {
      @media (max-width: 600px) {
        display: none;
      }
    }

    .user-button mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .user-info {
      padding: 8px 16px !important;
      cursor: default !important;
    }

    .user-name {
      font-weight: 500;
      font-size: 14px;
      color: rgba(0, 0, 0, 0.87);
    }

    .user-email {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.6);
      margin-top: 4px;
    }

    mat-divider {
      margin: 4px 0;
    }
  `]
})
export class AuthButtonComponent implements OnInit {
  user$: Observable<User | null>;
  isAuthenticated$: Observable<boolean>;
  loading$: Observable<boolean>;

  constructor(
    private store: Store<AppState>,
    private router: Router
  ) {
    this.user$ = this.store.select(selectUser);
    this.isAuthenticated$ = this.store.select(selectIsAuthenticated);
    this.loading$ = this.store.select(selectAuthLoading);
  }

  ngOnInit(): void {}

  signIn(): void {
    this.store.dispatch(AuthActions.signInWithGoogle());
  }

  signOut(): void {
    this.store.dispatch(AuthActions.signOut());
  }

  openHelp(): void {
    this.router.navigate(['/help']);
  }
}
