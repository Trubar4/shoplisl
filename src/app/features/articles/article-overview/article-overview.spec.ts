import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArticleOverview } from './article-overview';

describe('ArticleOverview', () => {
  let component: ArticleOverview;
  let fixture: ComponentFixture<ArticleOverview>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArticleOverview]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ArticleOverview);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
