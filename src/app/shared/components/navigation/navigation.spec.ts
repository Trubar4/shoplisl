import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Navigation } from './navigation';

describe('Navigation', () => {
  let component: Navigation;
  let fixture: ComponentFixture<Navigation>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Navigation]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Navigation);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // TODO: Configure external template/style loading for Vitest
  it.skip('should create', () => {
    expect(component).toBeTruthy();
  });
});
