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

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
