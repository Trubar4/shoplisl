import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatRadioModule } from '@angular/material/radio';
import { MatCardModule } from '@angular/material/card';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';

import { Department } from '../../../core/models';
import { DepartmentService } from '../../../core/services/department.service';

@Component({
  selector: 'app-department-selector',
  standalone: true,
  imports: [
    CommonModule,
    MatRadioModule,
    MatCardModule,
    FormsModule
  ],
  templateUrl: './department-selector.component.html',
  styleUrls: ['./department-selector.component.scss']
})
export class DepartmentSelectorComponent implements OnInit {
  @Input() selectedDepartmentId: string | null = null;
  @Output() departmentSelected = new EventEmitter<string | null>();
  
  departments$: Observable<Department[]>;

  constructor(private departmentService: DepartmentService) {
    this.departments$ = this.departmentService.getDepartments();
  }

  ngOnInit(): void {
    // Component initialization
  }

  selectDepartment(departmentId: string | null): void {
    this.selectedDepartmentId = departmentId;
    this.onSelectionChange();
  }

  onSelectionChange(): void {
    this.departmentSelected.emit(this.selectedDepartmentId);
  }

  getIconPath(iconFilename: string): string {
    return `/icons/${iconFilename}`;
  }
}