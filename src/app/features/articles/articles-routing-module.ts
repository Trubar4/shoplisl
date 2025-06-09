import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ArticleOverviewComponent } from './article-overview/article-overview';
import { AddArticleComponent } from './add-article/add-article';
import { EditArticleComponent } from './edit-article/edit-article';

const routes: Routes = [
  { path: '', component: ArticleOverviewComponent },
  { path: 'add', component: AddArticleComponent },
  { path: 'edit/:id', component: EditArticleComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ArticlesRoutingModule { }