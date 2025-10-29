import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShopOverview } from './shop-overview';

describe('ShopOverview', () => {
  let component: ShopOverview;
  let fixture: ComponentFixture<ShopOverview>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShopOverview]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ShopOverview);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // TODO: Configure external template/style loading for Vitest
  it.skip('should create', () => {
    expect(component).toBeTruthy();
  });
});
