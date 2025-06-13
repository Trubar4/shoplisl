import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Add these imports:
import { ListDetailComponent } from './list-detail/list-detail';
import { DepartmentSortComponent } from './department-sort/department-sort.component';

const routes: Routes = [
  {
    path: ':id',
    component: ListDetailComponent
  },
  {
    path: ':id/departments',
    component: DepartmentSortComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ListsRoutingModule { }