import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take, skip, timeout } from 'rxjs/operators';

/**
 * Admin Guard
 *
 * Protects admin routes from unauthorized access.
 * Only allows access to the specific admin user ID.
 *
 * IMPORTANT: This guard waits for Firebase auth to initialize before checking.
 * It skips the initial null value and waits for the real auth state.
 *
 * Usage:
 * ```typescript
 * {
 *   path: 'admin',
 *   canActivate: [adminGuard],
 *   loadChildren: () => import('./features/admin/admin.module')
 * }
 * ```
 */
export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Admin user ID - this is the only user who can access admin routes
  const ADMIN_USER_ID = 'HYqET9vr40eDju4nQCTnJTV0qJo2';

  return authService.getCurrentUser().pipe(
    skip(1), // Skip the initial null value from BehaviorSubject
    take(1), // Take the first actual auth state after initialization
    timeout(5000), // Timeout after 5 seconds if auth doesn't initialize
    map(user => {
      if (!user) {
        // User not authenticated, redirect to home
        console.warn('Admin access denied: User not authenticated');
        router.navigate(['/']);
        return false;
      }

      if (user.id !== ADMIN_USER_ID) {
        // User is authenticated but not admin
        console.warn(`Admin access denied for user: ${user.email} (ID: ${user.id})`);
        router.navigate(['/']);
        return false;
      }

      // User is admin
      console.log('✅ Admin access granted');
      return true;
    })
  );
};
