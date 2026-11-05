import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { UserRole } from '../models/api.models';
import { AuthService } from '../services/auth.service';

export const roleGuard = (...roles: UserRole[]): CanActivateFn => (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.restoreSession().pipe(
    map(user => user && roles.includes(user.role)
      ? true
      : router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url, access: user ? 'denied' : 'required' }
      })
    ),
    catchError(() => of(router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })))
  );
};
