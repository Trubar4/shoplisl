import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchDisambiguationComponent } from './components/search-disambiguation/search-disambiguation.component';
import { ArticleListComponent } from './components/article-list/article-list.component';
import { FilterFabComponent } from './components/filter-fab/filter-fab.component';


@NgModule({
  imports: [
    CommonModule,
    SearchDisambiguationComponent,
    ArticleListComponent,
    FilterFabComponent
  ],
  exports: [
    SearchDisambiguationComponent,
    ArticleListComponent,
    FilterFabComponent
  ]
})
export class SharedModule { }