import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShopDetail } from './shop-detail';

describe('ShopDetail', () => {
  let component: ShopDetail;
  let fixture: ComponentFixture<ShopDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShopDetail]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ShopDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // TODO: Configure external template/style loading for Vitest
  it.skip('should create', () => {
    expect(component).toBeTruthy();
  });
});
