import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomTabsComponent } from './shared/components/bottom-tabs/bottom-tabs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, BottomTabsComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent {
  title = 'shoplisl-app';
}