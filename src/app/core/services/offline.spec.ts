import { TestBed } from '@angular/core/testing';

import { Offline } from './offline';

describe('Offline', () => {
  let service: Offline;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Offline);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
