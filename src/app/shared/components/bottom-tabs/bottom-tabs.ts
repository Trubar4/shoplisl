import { Component } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { filter } from 'rxjs/operators';

import { AuthButtonComponent } from '../auth-button/auth-button.component';

@Component({
  selector: 'app-bottom-tabs',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    AuthButtonComponent
  ],
  templateUrl: './bottom-tabs.html',
  styleUrls: ['./bottom-tabs.scss']
})
export class BottomTabsComponent {
  currentUrl: string = '';

  constructor(private router: Router) {
    // Track route changes to update active state
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.currentUrl = event.url;
      });
    
    // Set initial URL
    this.currentUrl = this.router.url;
  }

  isActive(route: string): boolean {
    if (route === '/lists') {
      return this.currentUrl === '/lists' || this.currentUrl.startsWith('/lists/');
    }
    if (route === '/articles') {
      return this.currentUrl === '/articles' || this.currentUrl.startsWith('/articles/');
    }
    if (route === '/ai-assistant') {
      return this.currentUrl === '/ai-assistant' || this.currentUrl.startsWith('/ai-assistant/');
    }
    return this.currentUrl === route;
  }
}