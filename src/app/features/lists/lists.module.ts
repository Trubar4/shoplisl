import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ListsOverviewComponent } from './lists-overview/lists-overview';
import { AddListComponent } from './add-list/add-list';
import { ListDetailComponent } from './list-detail/list-detail';
import { AddArticlesToListComponent } from './add-articles/add-articles';
import { DepartmentSortComponent } from './department-sort/department-sort.component';
import { SharedModule } from '../../shared/shared-module';

const routes: Routes = [
  {
    path: '',
    component: ListsOverviewComponent
  },
  {
    path: 'add',
    component: AddListComponent
  },
  {
    path: ':id',
    component: ListDetailComponent
  },
  {
    path: ':id/add-articles',
    component: AddArticlesToListComponent
  },
  {
    path: ':id/departments',
    component: DepartmentSortComponent
  }
];

@NgModule({
  imports: [
    CommonModule,
    SharedModule,
    RouterModule.forChild(routes),
    ListsOverviewComponent,
    AddListComponent,
    ListDetailComponent,
    AddArticlesToListComponent,
    DepartmentSortComponent
  ]
})
export class ListsModule { }