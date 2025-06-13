import { Routes } from '@angular/router';
import { ListsOverviewComponent } from './features/lists/lists-overview/lists-overview';
import { AddListComponent } from './features/lists/add-list/add-list';
import { ListDetailComponent } from './features/lists/list-detail/list-detail';
import { AddArticlesToListComponent } from './features/lists/add-articles/add-articles';
import { ArticleOverviewComponent } from './features/articles/article-overview/article-overview';
import { AddArticleComponent } from './features/articles/add-article/add-article';
import { EditArticleComponent } from './features/articles/edit-article/edit-article';
import { ArticleUploadComponent } from './core/services/article-upload.component';
import { ListUploadComponent } from './core/services/list-upload.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/lists',
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
    component: AddArticlesToListComponent
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
    path: 'articles/edit/:id', 
    component: EditArticleComponent
  },
  {
    path: 'shops',
    component: ListsOverviewComponent
  },
  {
    path: 'recipes',
    component: ListsOverviewComponent
  },
  {
    path: 'admin/upload',
    component: ArticleUploadComponent
  },
  {
    path: 'admin/upload-list',
    component: ListUploadComponent
  }
];