import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArticleOverviewComponent } from './article-overview';

describe('ArticleOverviewComponent', () => {
  let component: ArticleOverviewComponent;
  let fixture: ComponentFixture<ArticleOverviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArticleOverviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ArticleOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
