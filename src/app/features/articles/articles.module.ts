import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ArticleOverviewComponent } from './article-overview/article-overview';
import { AddArticleComponent } from './add-article/add-article';
import { EditArticleComponent } from './edit-article/edit-article';
import { SharedModule } from '../../shared/shared-module';

const routes: Routes = [
  {
    path: '',
    component: ArticleOverviewComponent
  },
  {
    path: 'add',
    component: AddArticleComponent
  },
  {
    path: 'edit/:id',
    component: EditArticleComponent
  }
];

@NgModule({
  imports: [
    CommonModule,
    SharedModule,
    RouterModule.forChild(routes),
    ArticleOverviewComponent,
    AddArticleComponent,
    EditArticleComponent
  ]
})
export class ArticlesModule { }