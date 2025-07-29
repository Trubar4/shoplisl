import { TestBed } from '@angular/core/testing';

import { Data } from './data.service';

describe('Data', () => {
  let service: Data;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Data);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
