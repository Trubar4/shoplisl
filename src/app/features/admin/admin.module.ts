import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ArticleUploadComponent } from '../../core/services/article-upload.component';
import { ListUploadComponent } from '../../core/services/list-upload.component';
import { PerformanceDashboardComponent } from './performance-dashboard/performance-dashboard.component';
import { SharedModule } from '../../shared/shared-module';

const routes: Routes = [
  {
    path: 'upload',
    component: ArticleUploadComponent
  },
  {
    path: 'upload-list',
    component: ListUploadComponent
  },
  {
    path: 'performance',
    component: PerformanceDashboardComponent
  }
];

@NgModule({
  imports: [
    CommonModule,
    SharedModule,
    RouterModule.forChild(routes),
    ArticleUploadComponent,
    ListUploadComponent,
    PerformanceDashboardComponent
  ]
})
export class AdminModule { }