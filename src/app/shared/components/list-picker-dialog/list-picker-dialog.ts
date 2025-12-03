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
    // Immediately close dialog with selected list
    this.dialogRef.close({
      selectedListId: list.id,
      selectedListName: list.name
    } as ListPickerDialogResult);
  }

  onClose(): void {
    this.dialogRef.close(null);
  }
}
