import { Routes } from '@angular/router';
import { ListOverviewComponent } from './features/lists/list-overview/list-overview';
import { ArticleOverviewComponent } from './features/articles/article-overview/article-overview';
import { AddArticleComponent } from './features/articles/add-article/add-article';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/articles',
    pathMatch: 'full'
  },
  {
    path: 'lists',
    component: ListOverviewComponent
  },
  {
    path: 'articles',
    component: ArticleOverviewComponent
  },
  {
    path: 'articles/add',
    component: AddArticleComponent
  },
  {
    path: 'shops',
    component: ListOverviewComponent
  },
  {
    path: 'recipes',
    component: ListOverviewComponent
  }
];