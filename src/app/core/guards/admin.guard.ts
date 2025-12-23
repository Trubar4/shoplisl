import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

/**
 * Admin Guard
 *
 * Protects admin routes from unauthorized access.
 * Only allows access to the specific admin user ID.
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
    take(1),
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
      console.log('Admin access granted');
      return true;
    })
  );
};
