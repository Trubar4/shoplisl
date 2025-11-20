import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
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
}

@Component({
  selector: 'app-list-picker-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './list-picker-dialog.html',
  styleUrls: ['./list-picker-dialog.scss']
})
export class ListPickerDialogComponent implements OnInit {
  availableLists$!: Observable<ShoppingList[]>;
  selectedListId: string | null = null;

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

  onListSelect(list: ShoppingList): void {
    this.selectedListId = list.id;
  }

  onConfirm(): void {
    if (!this.selectedListId) {
      return;
    }

    // Get the selected list to return both ID and name
    this.availableLists$.subscribe(lists => {
      const selectedList = lists.find(list => list.id === this.selectedListId);
      if (selectedList) {
        this.dialogRef.close({
          selectedListId: selectedList.id,
          selectedListName: selectedList.name
        } as ListPickerDialogResult);
      }
    }).unsubscribe();
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  isListSelected(listId: string): boolean {
    return this.selectedListId === listId;
  }
}
