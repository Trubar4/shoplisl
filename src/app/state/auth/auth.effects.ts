import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { map, catchError, switchMap, tap } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { LoggerService } from '../../core/services/logger.service';
import * as AuthActions from './auth.actions';

@Injectable()
export class AuthEffects {
  private actions$ = inject(Actions);
  private authService = inject(AuthService);
  private logger = inject(LoggerService);

  signInWithGoogle$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.signInWithGoogle),
      switchMap(() =>
        this.authService.signInWithGoogle().then(user => {
          if (user) {
            return AuthActions.signInWithGoogleSuccess({ user });
          } else {
            return AuthActions.signInWithGoogleFailure({ error: 'Sign in failed' });
          }
        }).catch(error => {
          this.logger.error('auth-effects', 'Sign in with Google failed', error);
          return AuthActions.signInWithGoogleFailure({ error: error.message || 'Sign in failed' });
        })
      )
    )
  );

  signOut$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.signOut),
      switchMap(() =>
        this.authService.signOutUser().then(() => {
          return AuthActions.signOutSuccess();
        }).catch(error => {
          this.logger.error('auth-effects', 'Sign out failed', error);
          return AuthActions.signOutFailure({ error: error.message || 'Sign out failed' });
        })
      )
    )
  );

  signInSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.signInWithGoogleSuccess),
        tap(({ user }) => {
          this.logger.info('auth-effects', `User signed in: ${user.email}`);
        })
      ),
    { dispatch: false }
  );

  signOutSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.signOutSuccess),
        tap(() => {
          this.logger.info('auth-effects', 'User signed out');
        })
      ),
    { dispatch: false }
  );
}
