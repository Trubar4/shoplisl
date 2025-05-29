import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListOverview } from './list-overview';

describe('ListOverview', () => {
  let component: ListOverview;
  let fixture: ComponentFixture<ListOverview>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListOverview]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListOverview);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
