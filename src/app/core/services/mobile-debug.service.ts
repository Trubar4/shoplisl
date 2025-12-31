// src/app/core/services/mobile-debug.service.ts
import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, Timestamp } from '@angular/fire/firestore';
import { AuthService } from './auth.service';

interface DeviceInfo {
  userAgent: string;
  platform: string;
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  viewport: { width: number; height: number };
}

@Injectable({
  providedIn: 'root'
})
export class MobileDebugService {
  private deviceInfo: DeviceInfo;
  private debugEnabled = false;

  constructor(
    private firestore: Firestore,
    private authService: AuthService
  ) {
    this.deviceInfo = this.detectDevice();

    // Auto-enable debug logging for mobile devices
    this.debugEnabled = this.deviceInfo.isMobile;

    if (this.debugEnabled) {
      console.log('📱 Mobile Debug Service enabled for:', this.deviceInfo);
    }
  }

  private detectDevice(): DeviceInfo {
    const ua = navigator.userAgent;
    const platform = navigator.platform;

    return {
      userAgent: ua,
      platform: platform,
      isMobile: /iPhone|iPad|iPod|Android/i.test(ua),
      isIOS: /iPhone|iPad|iPod/i.test(ua),
      isAndroid: /Android/i.test(ua),
      isSafari: /Safari/i.test(ua) && !/Chrome/i.test(ua),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }

  /**
   * Log critical events to Firestore for mobile debugging
   * This allows viewing logs from iPhone without USB console access
   */
  async logToFirestore(
    event: string,
    data: any,
    level: 'info' | 'warn' | 'error' = 'info'
  ): Promise<void> {
    if (!this.debugEnabled) return;

    try {
      const userId = this.authService.getCurrentUserId() || 'unknown';
      const debugRef = collection(this.firestore, 'debug-mobile-logs');

      await addDoc(debugRef, {
        timestamp: Timestamp.now(),
        userId,
        event,
        level,
        data: this.sanitizeData(data),
        device: {
          isMobile: this.deviceInfo.isMobile,
          isIOS: this.deviceInfo.isIOS,
          platform: this.deviceInfo.platform,
          userAgent: this.deviceInfo.userAgent,
          viewport: this.deviceInfo.viewport
        }
      });
    } catch (error) {
      // Fail silently - don't break app if debug logging fails
      console.error('Failed to write debug log to Firestore:', error);
    }
  }

  /**
   * Sanitize data to prevent Firestore write errors
   */
  private sanitizeData(data: any): any {
    if (data === null || data === undefined) return null;

    if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.slice(0, 10); // Limit array size
    }

    if (typeof data === 'object') {
      const sanitized: any = {};
      let count = 0;
      for (const key in data) {
        if (count++ > 20) break; // Limit object properties
        sanitized[key] = this.sanitizeData(data[key]);
      }
      return sanitized;
    }

    return String(data);
  }

  /**
   * Log listener events for debugging sync issues
   */
  async logListenerEvent(
    listenerType: string,
    listId: string,
    action: string,
    details?: any
  ): Promise<void> {
    await this.logToFirestore(`listener-${action}`, {
      listenerType,
      listId,
      ...details
    });
  }

  /**
   * Log transaction events for debugging conflicts
   */
  async logTransactionEvent(
    listId: string,
    articleId: string,
    action: string,
    success: boolean,
    error?: any
  ): Promise<void> {
    await this.logToFirestore(`transaction-${success ? 'success' : 'failed'}`, {
      listId,
      articleId,
      action,
      error: error?.message || null
    }, success ? 'info' : 'error');
  }

  /**
   * Enable/disable debug logging
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    console.log(`📱 Mobile debug logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if current device is mobile
   */
  isMobile(): boolean {
    return this.deviceInfo.isMobile;
  }

  /**
   * Check if current device is iOS
   */
  isIOS(): boolean {
    return this.deviceInfo.isIOS;
  }

  /**
   * Get device info
   */
  getDeviceInfo(): DeviceInfo {
    return { ...this.deviceInfo };
  }
}
