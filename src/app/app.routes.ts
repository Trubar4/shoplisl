import { Routes } from '@angular/router';
import { ListOverviewComponent } from './features/lists/list-overview/list-overview';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/lists',
    pathMatch: 'full'
  },
  {
    path: 'lists',
    component: ListOverviewComponent
  }
];