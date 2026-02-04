import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ArticleUploadComponent } from '../../core/services/article-upload.component';
import { ListUploadComponent } from '../../core/services/list-upload.component';
import { PerformanceDashboardComponent } from './performance-dashboard/performance-dashboard.component';
import { AnalyticsDashboardComponent } from './analytics-dashboard/analytics-dashboard.component';
import { AnalyticsEventsExportComponent } from './analytics-events-export/analytics-events-export.component';
import { DebugUserComponent } from './debug-user/debug-user.component';
import { QuotaMonitorComponent } from './quota-monitor/quota-monitor.component';
import { UserSupportComponent } from './user-support/user-support.component';
import { SharedModule } from '../../shared/shared-module';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'analytics',
    pathMatch: 'full'
  },
  {
    path: 'debug',
    component: DebugUserComponent
  },
  {
    path: 'analytics',
    component: AnalyticsDashboardComponent
  },
  {
    path: 'events-export',
    component: AnalyticsEventsExportComponent
  },
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
  },
  {
    path: 'quota-monitor',
    component: QuotaMonitorComponent
  },
  {
    path: 'user-support',
    component: UserSupportComponent
  }
];

@NgModule({
  imports: [
    CommonModule,
    SharedModule,
    RouterModule.forChild(routes),
    ArticleUploadComponent,
    ListUploadComponent,
    PerformanceDashboardComponent,
    AnalyticsDashboardComponent,
    AnalyticsEventsExportComponent,
    DebugUserComponent,
    QuotaMonitorComponent,
    UserSupportComponent
  ]
})
export class AdminModule { }