import { CanActivateFn } from '@angular/router';

export const dataGuard: CanActivateFn = (route, state) => {
  return true;
};
