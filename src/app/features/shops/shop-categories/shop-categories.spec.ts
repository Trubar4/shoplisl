import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShopCategories } from './shop-categories';

describe('ShopCategories', () => {
  let component: ShopCategories;
  let fixture: ComponentFixture<ShopCategories>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShopCategories]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ShopCategories);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // TODO: Configure external template/style loading for Vitest
  it.skip('should create', () => {
    expect(component).toBeTruthy();
  });
});
