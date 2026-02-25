import { Component, Inject, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DataService } from '../../../core/services/data.service';
import { ShoppingList } from '../../../core/models';

export interface ListPickerDialogData {
  title: string;
  message?: string;
  currentListId: string;
}

export interface ListPickerDialogResult {
  selectedListId: string;
  selectedListName: string;
  checkOnSourceList: boolean;
}

@Component({
  selector: 'app-list-picker-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule
  ],
  templateUrl: './list-picker-dialog.html',
  styleUrls: ['./list-picker-dialog.scss']
})
export class ListPickerDialogComponent implements OnInit, AfterViewInit {
  availableLists$!: Observable<ShoppingList[]>;
  checkOnSourceList = true;

  constructor(
    public dialogRef: MatDialogRef<ListPickerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ListPickerDialogData,
    private readonly dataService: DataService
  ) {}

  ngOnInit(): void {
    // Get all lists except the current one
    this.availableLists$ = this.dataService.getLists().pipe(
      map(lists => lists.filter(list => list.id !== this.data.currentListId))
    );
  }

  ngAfterViewInit(): void {
    // Scroll list options to top when dialog opens
    setTimeout(() => {
      const optionsContainer = document.querySelector('.list-picker-dialog .disambiguation-options');
      if (optionsContainer) {
        optionsContainer.scrollTop = 0;
      }
    }, 0);
  }

  onListSelect(list: ShoppingList): void {
    // Immediately close dialog with selected list
    this.dialogRef.close({
      selectedListId: list.id,
      selectedListName: list.name,
      checkOnSourceList: this.checkOnSourceList
    } as ListPickerDialogResult);
  }

  onClose(): void {
    this.dialogRef.close(null);
  }
}
