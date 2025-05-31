import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-list-overview',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule
  ],
  templateUrl: './list-overview.html',
  styleUrls: ['./list-overview.scss']
})
export class ListOverviewComponent {
  // Simple placeholder - we'll implement this properly later
}