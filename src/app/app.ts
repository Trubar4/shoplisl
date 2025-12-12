import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

import { BottomTabsComponent } from './shared/components/bottom-tabs/bottom-tabs';
import { CacheStatusComponent } from './shared/components/cache-status/cache-status.component';
import { AuthButtonComponent } from './shared/components/auth-button/auth-button.component';
import { LoggerService } from './core/services/logger.service';
import { ConnectionService } from './core/services/connection.service';
import { OfflineCacheService } from './core/services/offline-cache.service';
import { DataService } from './core/services/data.service';
import { ListUtilsService } from './core/services/list-utils.service';
import { ArticleItemComponent } from './shared/components/article-item/article-item.component';
import { DataMigrationService } from './core/services/data-migration.service';
import { AuthService } from './core/services/auth.service';
import { AppState } from './state/app.state';
import * as AuthActions from './state/auth/auth.actions';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    BottomTabsComponent,
    CacheStatusComponent,
    AuthButtonComponent
  ],
  template: `
    <div class="app-header">
      <app-auth-button></app-auth-button>
    </div>
    <router-outlet></router-outlet>
    <app-bottom-tabs></app-bottom-tabs>
    <app-cache-status></app-cache-status>
  `,
  styleUrls: ['./app.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'shoplisl-app';
  private subscriptions = new Subscription();
  private isProcessingInvite = false; // Prevent multiple invite redirects

  constructor(
    private logger: LoggerService,
    private router: Router,
    private connectionService: ConnectionService,
    private cacheService: OfflineCacheService,
    private dataService: DataService,
    private dataMigrationService: DataMigrationService,
    private authService: AuthService,
    private store: Store<AppState>
  ) {
    this.initializeLogger();
    this.initializeOfflineDebugging();
    this.initializeAuth();
  }

  /**
   * Initialize authentication and sync with NgRx store
   */
  private initializeAuth(): void {
    // Subscribe to auth changes and dispatch to store
    this.subscriptions.add(
      this.authService.getCurrentUser().subscribe(user => {
        this.store.dispatch(AuthActions.setUser({ user }));

        // Phase 8: Check for pending invite after login
        if (user) {
          this.handlePendingInvite();
        }
      })
    );
  }

  /**
   * Phase 8: Handle pending invite after user logs in
   * If there's a pending invite token in sessionStorage, redirect to the invite URL
   */
  private handlePendingInvite(): void {
    console.log('🔗 AppComponent: Checking for pending invite (isProcessingInvite:', this.isProcessingInvite, ')');

    // Prevent multiple simultaneous redirects
    if (this.isProcessingInvite) {
      console.log('🔗 AppComponent: Already processing an invite, skipping');
      return;
    }

    const pendingToken = sessionStorage.getItem('pendingInviteToken');
    console.log('🔗 AppComponent: Pending token:', pendingToken);

    if (pendingToken) {
      console.log('🔗 AppComponent: Found pending invite, redirecting to:', `/invite/${pendingToken}`);
      this.logger.info('invite', `Processing pending invite after login: ${pendingToken}`);

      // Set flag to prevent multiple redirects
      this.isProcessingInvite = true;

      // Clear the token from storage BEFORE navigating
      sessionStorage.removeItem('pendingInviteToken');

      // Redirect to the invite acceptance URL
      // Navigate away first to ensure component reloads, then navigate to invite
      setTimeout(() => {
        console.log('🔗 AppComponent: Navigating to lists first to force reload...');
        this.router.navigate(['/lists']).then(() => {
          // Small delay, then navigate to the actual invite URL
          setTimeout(() => {
            console.log('🔗 AppComponent: Now navigating to invite page...');
            this.router.navigate(['/invite', pendingToken]).then(() => {
              console.log('🔗 AppComponent: Navigation to invite page completed');
              // Reset flag after a short delay
              setTimeout(() => {
                this.isProcessingInvite = false;
              }, 1000);
            });
          }, 50);
        });
      }, 100);
    } else {
      console.log('🔗 AppComponent: No pending invite found');
    }
  }

  ngOnInit(): void {
    // Handle Siri Shortcuts deep links - redirect to AI assistant if URL parameters present
    this.handleSiriShortcutRedirect();

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

    // Run data cleanup on startup
    if (this.connectionService.isOnline()) {
      this.dataMigrationService.checkAndCleanupData().then(() => {
        this.logger.debug('data', 'Startup data cleanup completed');  // Change 'app' to 'data'
      }).catch(error => {
        this.logger.error('data', 'Startup cleanup failed', error);  // Change 'app' to 'data'
      });
    }

    console.log('🚀 ShopLisl PWA ready with connection-first offline support!');
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /**
   * Handle Siri Shortcuts deep links by redirecting to AI assistant
   * Detects ?add= or ?command= parameters and preserves them during redirect
   */
  private handleSiriShortcutRedirect(): void {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const hasAddParam = urlParams.has('add');
    const hasCommandParam = urlParams.has('command');

    if (hasAddParam || hasCommandParam) {
      console.log('📱 Siri Shortcut deep link detected, redirecting to AI assistant...');

      // Redirect to ai-assistant with the same URL parameters
      const queryString = window.location.search;
      this.router.navigateByUrl(`/ai-assistant${queryString}`);
    }
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
        },

        cleanupData: async () => {
          const result = await this.dataMigrationService.quickCleanupOrphanedReferences();
          console.log('🧹 Manual cleanup result:', result);
          return result;
        },
        checkOrphans: async () => {
          const hasOrphans = await this.dataMigrationService.hasOrphanedReferences();
          console.log('👻 Has orphaned references:', hasOrphans);
          return hasOrphans;
        },
        testOrphanedData: async () => {
          try {
            console.log('🔍 Checking for orphaned references...');
            
            // Get current data through the app's services
            const articles = await new Promise<any[]>(resolve => 
              this.dataService.getArticles().subscribe((data: any[]) => resolve(data))
            );
            const lists = await new Promise<any[]>(resolve => 
              this.dataService.getLists().subscribe((data: any[]) => resolve(data))
            );
            
            const validArticleIds = new Set(articles.map((a: any) => a.id));
            console.log('✅ Valid article IDs:', Array.from(validArticleIds));
            console.log('📋 Total articles:', articles.length);
            
            let totalOrphans = 0;
            
            lists.forEach((list: any) => {
              const orphanedIds = list.articleIds?.filter((id: any) => !validArticleIds.has(id)) || [];
              const orphanedStates = Object.keys(list.itemStates || {}).filter((id: any) => !validArticleIds.has(id));
              
              if (orphanedIds.length > 0 || orphanedStates.length > 0) {
                console.log(`🚨 List "${list.name}" has orphans:`, {
                  orphanedArticleIds: orphanedIds,
                  orphanedItemStates: orphanedStates,
                  totalInList: list.articleIds?.length || 0,
                  activeCount: list.articleIds?.filter((id: any) => {
                    const itemState = list.itemStates?.[id];
                    return !itemState?.isChecked;
                  }).length || 0
                });
                totalOrphans += orphanedIds.length + orphanedStates.length;
              } else {
                console.log(`✅ List "${list.name}" is clean (${list.articleIds?.length || 0} articles)`);
              }
            });
            
            console.log(`📊 Summary: ${totalOrphans} orphaned references found across ${lists.length} lists`);
            return { totalOrphans, lists: lists.length, articles: articles.length };
            
          } catch (error) {
            console.error('❌ Error checking orphaned data:', error);
            return { error: 'Check failed' };
          }
        },

        debugListDetails: async (listName = 'Lädele') => {
          try {
            const lists = await new Promise<any[]>(resolve => 
              this.dataService.getLists().subscribe((data: any[]) => resolve(data))
            );
            const articles = await new Promise<any[]>(resolve => 
              this.dataService.getArticles().subscribe((data: any[]) => resolve(data))
            );
            
            const list = lists.find((l: any) => l.name === listName);
            if (!list) {
              console.log(`❌ List "${listName}" not found`);
              return;
            }
            
            const validArticleIds = new Set(articles.map((a: any) => a.id));
            const articlesMap = new Map(articles.map((a: any) => [a.id, a]));
            
            console.log(`🔍 Debugging list "${listName}":`);
            console.log('📋 Total articleIds:', list.articleIds.length);
            console.log('📊 ItemStates count:', Object.keys(list.itemStates || {}).length);
            
            // Check each article in the list
            list.articleIds.forEach((articleId: any, index: number) => {
              const article = articlesMap.get(articleId);
              const itemState = list.itemStates?.[articleId];
              const exists = validArticleIds.has(articleId);
              const isChecked = itemState?.isChecked || false;
              
              console.log(`${index + 1}. Article ${articleId}:`, {
                exists,
                name: article?.name || 'MISSING',
                isChecked,
                itemState: itemState || 'NO_STATE'
              });
            });
            
            // Count unchecked articles
            const uncheckedCount = list.articleIds.filter((id: any) => {
              const itemState = list.itemStates?.[id];
              return !itemState?.isChecked;
            }).length;
            
            console.log(`📊 Unchecked count: ${uncheckedCount}`);
            return { listName, total: list.articleIds.length, unchecked: uncheckedCount };
            
          } catch (error) {
            console.error('❌ Debug failed:', error);
            return { error: 'Debug failed' };
          }
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