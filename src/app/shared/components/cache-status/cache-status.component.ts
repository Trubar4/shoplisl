import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription, combineLatest } from 'rxjs';
import { ConnectionService, ConnectionStatus } from '../../../core/services/connection.service';
import { OfflineCacheService } from '../../../core/services/offline-cache.service';

export interface StatusDisplay {
  icon: string;
  text: string;
  color: string;
  tooltip: string;
  show: boolean;
}

@Component({
  selector: 'app-cache-status',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="cache-status-bar" [class.visible]="status.show" [style.--status-color]="status.color">
      <div class="status-content">
        <mat-icon [fontIcon]="status.icon" class="status-icon"></mat-icon>
        <span class="status-text">{{ status.text }}</span>
        <button mat-icon-button 
                class="close-btn" 
                (click)="dismiss()"
                [matTooltip]="'Schließen'"
                *ngIf="canDismiss">
          <mat-icon fontIcon="close"></mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .cache-status-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--status-color, #2196f3);
      color: white;
      padding: 0;
      z-index: 1000;
      transform: translateY(100%);
      transition: transform 0.3s ease-in-out;
      box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.2);
    }

    .cache-status-bar.visible {
      transform: translateY(0);
    }

    .status-content {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      min-height: 48px;
    }

    .status-icon {
      margin-right: 12px;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .status-text {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
    }

    .close-btn {
      margin-left: 8px;
      color: white;
      width: 36px;
      height: 36px;
    }

    .close-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    /* Color variations */
    .cache-status-bar[style*="--status-color: #4caf50"] {
      background: #4caf50; /* Green - Online/Fresh */
    }

    .cache-status-bar[style*="--status-color: #ff9800"] {
      background: #ff9800; /* Orange - Using cache */
    }

    .cache-status-bar[style*="--status-color: #f44336"] {
      background: #f44336; /* Red - Expired cache */
    }

    .cache-status-bar[style*="--status-color: #9e9e9e"] {
      background: #9e9e9e; /* Gray - Offline */
    }
  `]
})
export class CacheStatusComponent implements OnInit, OnDestroy {
  status: StatusDisplay = {
    icon: '',
    text: '',
    color: '',
    tooltip: '',
    show: false
  };

  canDismiss = false;
  private subscriptions = new Subscription();
  private dismissTimeout?: number;

  constructor(
    private connectionService: ConnectionService,
    private cacheService: OfflineCacheService
  ) {}

  ngOnInit(): void {
    // Monitor connection and cache status
    const connectionStatus$ = this.connectionService.getConnectionStatus();
    
    this.subscriptions.add(
      combineLatest([connectionStatus$]).subscribe(([connection]) => {
        this.updateStatus(connection);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.dismissTimeout) {
      clearTimeout(this.dismissTimeout);
    }
  }

  private updateStatus(connection: ConnectionStatus): void {
    const cache = this.cacheService.getCacheStatus();
    
    if (connection.isOnline) {
      this.handleOnlineStatus(cache);
    } else {
      this.handleOfflineStatus(cache);
    }
  }

  private handleOnlineStatus(cache: any): void {
    // When online, usually don't show status unless there's something important
    if (cache.articles.hasCache && cache.lists.hasCache) {
      // Have cache but now online - show brief "refreshing" message
      this.showStatus({
        icon: 'sync',
        text: 'Daten werden aktualisiert...',
        color: '#2196f3', // Blue
        tooltip: 'Verbindung wiederhergestellt, lade aktuelle Daten',
        show: true
      });

      // Auto-hide after 3 seconds
      this.scheduleAutoDismiss(3000);
    } else {
      // Online and no cache issues - hide status
      this.hideStatus();
    }
  }

  private handleOfflineStatus(cache: any): void {
    const oldestAge = this.cacheService.getOldestCacheAge();
    
    if (!cache.articles.hasCache && !cache.lists.hasCache) {
      // No cache and offline - show error
      this.showStatus({
        icon: 'cloud_off',
        text: 'Keine Internetverbindung - Daten nicht verfügbar',
        color: '#f44336', // Red
        tooltip: 'Verbindung erforderlich um Daten zu laden',
        show: true
      });
      this.canDismiss = false;
    } else if (cache.articles.isExpired || cache.lists.isExpired) {
      // Cache expired and offline
      const ageText = oldestAge ? this.cacheService.formatAge(oldestAge) : '';
      this.showStatus({
        icon: 'schedule',
        text: `Offline - Daten ${ageText} (möglicherweise veraltet)`,
        color: '#f44336', // Red
        tooltip: 'Cache ist über 30 Stunden alt, Internetverbindung empfohlen',
        show: true
      });
      this.canDismiss = true;
    } else {
      // Valid cache and offline - show info
      const ageText = oldestAge ? this.cacheService.formatAge(oldestAge) : '';
      const isApproaching = this.cacheService.isApproachingExpiration();
      
      this.showStatus({
        icon: 'cloud_off',
        text: `Offline - Zeige gespeicherte Daten (${ageText})`,
        color: isApproaching ? '#ff9800' : '#9e9e9e', // Orange if approaching expiry, gray otherwise
        tooltip: isApproaching ? 
          'Cache läuft bald ab, Internetverbindung empfohlen' : 
          'Verwende lokale Kopie der Daten',
        show: true
      });
      this.canDismiss = true;
    }
  }

  private showStatus(newStatus: StatusDisplay): void {
    this.status = { ...newStatus };
    this.clearAutoDismiss();
  }

  private hideStatus(): void {
    this.status.show = false;
    this.canDismiss = false;
    this.clearAutoDismiss();
  }

  private scheduleAutoDismiss(delay: number): void {
    this.clearAutoDismiss();
    this.dismissTimeout = window.setTimeout(() => {
      this.hideStatus();
    }, delay);
  }

  private clearAutoDismiss(): void {
    if (this.dismissTimeout) {
      clearTimeout(this.dismissTimeout);
      this.dismissTimeout = undefined;
    }
  }

  dismiss(): void {
    if (this.canDismiss) {
      this.hideStatus();
    }
  }
}