import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';

import { dataGuard } from './data-guard';

describe('dataGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => dataGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
