import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

import { BottomTabsComponent } from './shared/components/bottom-tabs/bottom-tabs';
import { CacheStatusComponent } from './shared/components/cache-status/cache-status.component';
import { LoggerService } from './core/services/logger.service';
import { ConnectionService } from './core/services/connection.service';
import { OfflineCacheService } from './core/services/offline-cache.service';
import { DataService } from './core/services/data.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet, 
    BottomTabsComponent,
    CacheStatusComponent
  ],
  template: `
    <router-outlet></router-outlet>
    <app-bottom-tabs></app-bottom-tabs>
    <app-cache-status></app-cache-status>
  `,
  styleUrl: './app.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'shoplisl-app';
  private subscriptions = new Subscription();
  
  constructor(
    private logger: LoggerService,
    private router: Router,
    private connectionService: ConnectionService,
    private cacheService: OfflineCacheService,
    private dataService: DataService
  ) {
    this.initializeLogger();
    this.initializeOfflineDebugging();
  }

  ngOnInit(): void {
    // Global theme reset on navigation - fixes iPhone status bar color persistence
    this.subscriptions.add(
      this.router.events.pipe(
        filter(event => event instanceof NavigationEnd)
      ).subscribe((event: NavigationEnd) => {
        // Reset to default theme on all navigation except list detail
        if (!event.url.includes('/lists/') || event.url === '/lists') {
          this.resetToDefaultTheme();
        }
      })
    );

    // Monitor connection status for debugging
    this.subscriptions.add(
      this.connectionService.getConnectionStatus().subscribe(status => {
        console.log(`🌐 Connection status: ${status.isOnline ? 'Online' : 'Offline'}`, status);
        
        // Update document title to show connection status (helpful for debugging)
        const baseTitle = 'ShopLisl';
        document.title = status.isOnline ? baseTitle : `${baseTitle} (Offline)`;
      })
    );

    console.log('🚀 ShopLisl PWA ready with connection-first offline support!');
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private initializeLogger(): void {
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
- logger.getOfflineStatus() - Show offline system status
      `);
      
      // Add offline debugging helpers to window object
      (window as any).logger.getOfflineStatus = () => {
        const connectionStatus = this.connectionService.getCurrentStatus();
        const cacheStatus = this.cacheService.getCacheStatus();
        const dataStatus = this.dataService.getStatus();
        
        console.log('📊 Offline System Status:');
        console.log('🌐 Connection:', connectionStatus);
        console.log('💾 Cache:', cacheStatus);
        console.log('🔄 Data Service:', dataStatus);
        
        return {
          connection: connectionStatus,
          cache: cacheStatus,
          dataService: dataStatus
        };
      };
    }
  }

  private initializeOfflineDebugging(): void {
    if (typeof window !== 'undefined') {
      // Add offline debugging methods to window
      (window as any).offline = {
        // Cache management
        clearCache: () => {
          this.cacheService.clearCache('all');
          console.log('🗑️ All cache cleared');
        },
        showCacheStatus: () => {
          const status = this.cacheService.getCacheStatus();
          console.log('💾 Cache Status:', status);
          return status;
        },
        
        // Connection testing
        testConnection: async () => {
          const result = await this.connectionService.testRealConnection();
          console.log(`🌐 Real connection test: ${result ? 'Success' : 'Failed'}`);
          return result;
        },
        
        // Data service
        refreshData: () => {
          this.dataService.refreshData();
          console.log('🔄 Data refresh triggered');
        },
        showDataStatus: () => {
          const status = this.dataService.getStatus();
          console.log('📊 Data Service Status:', status);
          return status;
        },
        
        // Simulate offline/online
        goOffline: () => {
          console.log('⚠️ Simulating offline mode...');
          console.log('Use browser DevTools > Network > Offline to actually go offline');
        },
        goOnline: () => {
          console.log('✅ Going back online...');
          console.log('Disable offline mode in browser DevTools');
        }
      };

      console.log(`
🛠️ Offline Debug Commands:
- offline.clearCache() - Clear all cached data
- offline.showCacheStatus() - Show cache information  
- offline.testConnection() - Test real connectivity
- offline.refreshData() - Force data refresh
- offline.showDataStatus() - Show data service status
- logger.getOfflineStatus() - Complete system status
      `);
    }
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