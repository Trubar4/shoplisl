import { Routes } from '@angular/router';
import { ListsOverviewComponent } from './features/lists/lists-overview/lists-overview';
import { AddListComponent } from './features/lists/add-list/add-list';
import { ListDetailComponent } from './features/lists/list-detail/list-detail';
import { AddArticlesComponent } from './features/lists/add-articles/add-articles';
import { ArticleOverviewComponent } from './features/articles/article-overview/article-overview';
import { AddArticleComponent } from './features/articles/add-article/add-article';
import { ArticleDetailComponent } from './features/articles/article-detail/article-detail';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/articles',
    pathMatch: 'full'
  },
  {
    path: 'lists',
    component: ListsOverviewComponent
  },
  {
    path: 'lists/add',
    component: AddListComponent
  },
  {
    path: 'lists/:id',
    component: ListDetailComponent
  },
  {
    path: 'lists/:id/add-articles',
    component: AddArticlesComponent
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
    path: 'articles/:id',
    component: ArticleDetailComponent
  },
  {
    path: 'shops',
    component: ListsOverviewComponent
  },
  {
    path: 'recipes',
    component: ListsOverviewComponent
  }
];