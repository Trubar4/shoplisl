import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, fromEvent, merge } from 'rxjs';
import { map, startWith, distinctUntilChanged, debounceTime } from 'rxjs/operators';
import { LoggerService } from './logger.service';

export interface ConnectionStatus {
  isOnline: boolean;
  lastOnlineAt: Date | null;
  connectionType?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ConnectionService {
  private connectionStatusSubject = new BehaviorSubject<ConnectionStatus>({
    isOnline: navigator.onLine,
    lastOnlineAt: navigator.onLine ? new Date() : null
  });

  constructor(private logger: LoggerService) {
    this.initializeConnectionMonitoring();
  }

  private initializeConnectionMonitoring(): void {
    // Listen to browser online/offline events
    const online$ = fromEvent(window, 'online').pipe(map(() => true));
    const offline$ = fromEvent(window, 'offline').pipe(map(() => false));
    
    // Combine events and add current status
    merge(online$, offline$).pipe(
      startWith(navigator.onLine),
      distinctUntilChanged(),
      debounceTime(100) // Prevent rapid fire events
    ).subscribe(isOnline => {
      const status: ConnectionStatus = {
        isOnline,
        lastOnlineAt: isOnline ? new Date() : this.connectionStatusSubject.value.lastOnlineAt,
        connectionType: this.getConnectionType()
      };
      
      this.connectionStatusSubject.next(status);
      
      this.logger.debug('data', `🌐 Connection ${isOnline ? 'restored' : 'lost'}`, status);
    });

    // Additional check for iOS Safari (sometimes doesn't fire events properly)
    if (this.isIOS()) {
      setInterval(() => {
        const currentOnline = navigator.onLine;
        const lastStatus = this.connectionStatusSubject.value;
        
        if (currentOnline !== lastStatus.isOnline) {
          this.logger.debug('data', '📱 iOS connection status changed via polling');
          this.connectionStatusSubject.next({
            isOnline: currentOnline,
            lastOnlineAt: currentOnline ? new Date() : lastStatus.lastOnlineAt,
            connectionType: this.getConnectionType()
          });
        }
      }, 5000); // Check every 5 seconds on iOS
    }
  }

  getConnectionStatus(): Observable<ConnectionStatus> {
    return this.connectionStatusSubject.asObservable();
  }

  getCurrentStatus(): ConnectionStatus {
    return this.connectionStatusSubject.value;
  }

  isOnline(): boolean {
    return this.connectionStatusSubject.value.isOnline;
  }

  getOfflineDuration(): number | null {
    const status = this.connectionStatusSubject.value;
    if (status.isOnline || !status.lastOnlineAt) {
      return null;
    }
    return Date.now() - status.lastOnlineAt.getTime();
  }

  private getConnectionType(): string {
    // @ts-ignore - navigator.connection is experimental
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return connection?.effectiveType || 'unknown';
  }

  private isIOS(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  /**
   * Test connection by attempting to fetch a small resource
   * Useful for detecting captive portals or limited connectivity
   */
  async testRealConnection(): Promise<boolean> {
    if (!navigator.onLine) {
      return false;
    }

    try {
      // Use a small, fast endpoint to test real connectivity
      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      return true;
    } catch {
      // If fetch fails, we might be behind a captive portal
      this.logger.debug('data', '⚠️ Browser says online but real connection failed');
      return false;
    }
  }
}