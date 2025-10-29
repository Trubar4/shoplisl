import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ArticleOverviewComponent } from './article-overview';

describe('ArticleOverviewComponent', () => {
  let component: ArticleOverviewComponent;
  let fixture: ComponentFixture<ArticleOverviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArticleOverviewComponent],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ArticleOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // TODO: Configure external template/style loading for Vitest
  it.skip('should create', () => {
    expect(component).toBeTruthy();
  });
});
