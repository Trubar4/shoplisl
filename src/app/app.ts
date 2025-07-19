import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { BottomTabsComponent } from './shared/components/bottom-tabs/bottom-tabs';
import { LoggerService } from './core/services/logger.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, BottomTabsComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent implements OnInit {
  title = 'shoplisl-app';
  
  constructor(
    private logger: LoggerService,
    private router: Router
  ) {
    // Logger setup
    if (typeof window !== 'undefined') {
      console.log('🔧 ShopLisl Logger ready! Use window.logger to control logging');
      console.log(`
🔧 Logger Commands:
- logger.showConfig() - Show current settings
- logger.enableTopic('ai') - Enable AI logs  
- logger.disableTopic('ai') - Disable AI logs
- logger.enableAllTopics() - Show all logs
- logger.disableAllTopics() - Hide all logs
- logger.setLevel('debug') - Show debug level
- logger.setLevel('info') - Show info level only
- logger.setEnabled(false) - Disable all logging
      `);
    }
  }

  ngOnInit(): void {
    // Global theme reset on navigation - fixes iPhone status bar color persistence
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      // Reset to default theme on all navigation except list detail
      if (!event.url.includes('/lists/') || event.url === '/lists') {
        this.resetToDefaultTheme();
      }
    });
  }

  private resetToDefaultTheme(): void {
    const defaultColor = '#1a9edb';
    
    // Reset CSS custom properties
    const root = document.documentElement;
    root.style.setProperty('--list-primary-color', defaultColor);
    root.style.setProperty('--list-contrast-color', 'white');
    root.style.setProperty('--list-light-color', '#a8d4f0');
    root.style.setProperty('--list-dark-color', '#1976d2');
    
    // Aggressive iPhone status bar color reset with multiple attempts
    this.updateThemeColorMeta(defaultColor);
    setTimeout(() => this.updateThemeColorMeta(defaultColor), 50);
    setTimeout(() => this.updateThemeColorMeta(defaultColor), 150);
    setTimeout(() => this.updateThemeColorMeta(defaultColor), 300);
    
    // Reset background
    document.documentElement.style.backgroundColor = defaultColor;
  }

  private updateThemeColorMeta(color: string): void {
    let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.name = 'theme-color';
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.content = color;
  }
}