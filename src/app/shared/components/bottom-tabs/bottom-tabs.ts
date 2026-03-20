import { Component, AfterViewInit, ElementRef, HostListener } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
export class BottomTabsComponent implements AfterViewInit {
  currentUrl: string = '';

  constructor(private router: Router, private el: ElementRef) {
    // Track route changes to update active state
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe((event: NavigationEnd) => {
        this.currentUrl = event.url;
      });

    // Set initial URL
    this.currentUrl = this.router.url;
  }

  ngAfterViewInit(): void {
    // Measure immediately for a first-pass value
    this.updateTabBarHeight();
    // Re-measure after a frame so env(safe-area-inset-bottom) CSS is fully resolved.
    // On iOS the safe-area value can be 0 on the first synchronous read.
    requestAnimationFrame(() => {
      this.updateTabBarHeight();
      // One more pass after a short delay as a belt-and-suspenders measure
      setTimeout(() => this.updateTabBarHeight(), 150);
    });
  }

  @HostListener('window:resize')
  updateTabBarHeight(): void {
    const height = this.el.nativeElement.offsetHeight;
    if (height > 0) {
      document.documentElement.style.setProperty('--tab-bar-height', `${height}px`);
    }
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
