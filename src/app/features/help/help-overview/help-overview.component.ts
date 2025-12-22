import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { getHelpTopicTitles } from '../help-content';

@Component({
  selector: 'app-help-overview',
  imports: [
    CommonModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './help-overview.component.html',
  styleUrls: ['./help-overview.component.scss']
})
export class HelpOverviewComponent {
  topics = getHelpTopicTitles();

  constructor(private router: Router) {}

  onTopicClick(topicId: string): void {
    this.router.navigate(['/help', topicId]);
  }

  onBack(): void {
    this.router.navigate(['/lists']);
  }
}
