import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  collectionGroup,
  Timestamp,
  documentId,
  runTransaction,
  QuerySnapshot,
  DocumentSnapshot,
  Unsubscribe
} from '@angular/fire/firestore';
import { QuotaMonitorService } from './quota-monitor.service';
import { LoggerService } from './logger.service';

/**
 * Firestore Interceptor Service
 *
 * Wraps ALL Firestore operations to provide:
 * - Automatic read tracking
 * - Stack trace logging
 * - Operation categorization
 * - Comprehensive audit trail
 *
 * This service MUST be used instead of direct Firestore calls.
 */
@Injectable({
  providedIn: 'root'
})
export class FirestoreInterceptorService {

  constructor(
    private firestore: Firestore,
    private quotaMonitor: QuotaMonitorService,
    private logger: LoggerService
  ) {}

  /**
   * Get stack trace for debugging
   */
  private getStackTrace(): string {
    const stack = new Error().stack || '';
    const lines = stack.split('\n');
    // Skip first 3 lines (Error, this function, caller)
    return lines.slice(3, 8).join('\n');
  }

  /**
   * Log a read operation with full context
   */
  private logRead(operation: string, count: number, path: string, caller?: string): void {
    const stack = this.getStackTrace();

    this.logger.debug('data', `
🔥 FIRESTORE READ DETECTED
Operation: ${operation}
Path: ${path}
Count: ${count} document(s)
Caller: ${caller || 'Unknown'}

Stack Trace:
${stack}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

    this.quotaMonitor.trackRead(operation, count, {
      path,
      stack: stack.split('\n')[0], // First line of stack for tracking
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Wrapped getDocs with automatic tracking
   */
  async getDocs<T = any>(queryRef: any, caller?: string): Promise<QuerySnapshot<T>> {
    const path = this.getPathFromQuery(queryRef);

    this.logger.debug('data', `⏳ getDocs starting: ${path}`);
    const snapshot = await getDocs(queryRef);

    this.logRead('getDocs', snapshot.size, path, caller);

    return snapshot as QuerySnapshot<T>;
  }

  /**
   * Wrapped getDoc with automatic tracking
   */
  async getDoc<T = any>(docRef: any, caller?: string): Promise<DocumentSnapshot<T>> {
    const path = this.getPathFromDoc(docRef);

    this.logger.debug('data', `⏳ getDoc starting: ${path}`);
    const snapshot = await getDoc(docRef);

    this.logRead('getDoc', snapshot.exists() ? 1 : 0, path, caller);

    return snapshot as DocumentSnapshot<T>;
  }

  /**
   * Wrapped onSnapshot with automatic tracking
   */
  onSnapshot(
    ref: any,
    onNext: (snapshot: any) => void,
    onError?: (error: Error) => void,
    caller?: string
  ): Unsubscribe {
    const path = this.getPathFromQuery(ref);
    let fireCount = 0;

    this.logger.debug('data', `🔔 onSnapshot SETUP: ${path}`);

    return onSnapshot(
      ref,
      (snapshot: any) => {
        fireCount++;
        const count = snapshot.size !== undefined ? snapshot.size : (snapshot.exists() ? 1 : 0);

        this.logger.debug('data', `🔔 onSnapshot FIRED #${fireCount}: ${path} (${count} docs)`);
        this.logRead(`onSnapshot (fire #${fireCount})`, count, path, caller);

        onNext(snapshot);
      },
      (error: Error) => {
        this.logger.error('data', `❌ onSnapshot ERROR: ${path}`, error);
        if (onError) onError(error);
      }
    );
  }

  /**
   * Wrapped runTransaction with automatic tracking
   */
  async runTransaction<T>(
    updateFunction: (transaction: any) => Promise<T>,
    caller?: string
  ): Promise<T> {
    this.logger.debug('data', `🔒 runTransaction starting`);

    let transactionReads = 0;

    const result = await runTransaction(this.firestore, async (transaction) => {
      // Wrap transaction.get to count reads
      const originalGet = transaction.get.bind(transaction);
      transaction.get = (docRef: any) => {
        transactionReads++;
        const path = this.getPathFromDoc(docRef);
        this.logger.debug('data', `📖 Transaction read #${transactionReads}: ${path}`);
        return originalGet(docRef);
      };

      return updateFunction(transaction);
    });

    this.logRead('runTransaction', transactionReads, 'transaction', caller);

    return result;
  }

  /**
   * Helper: Extract path from query
   */
  private getPathFromQuery(queryRef: any): string {
    try {
      if (queryRef._query && queryRef._query.path) {
        const segments = queryRef._query.path.segments || [];
        return segments.join('/');
      }
      if (queryRef.path) {
        return queryRef.path;
      }
      return 'unknown-query';
    } catch (e) {
      return 'unknown-query';
    }
  }

  /**
   * Helper: Extract path from document reference
   */
  private getPathFromDoc(docRef: any): string {
    try {
      if (docRef.path) {
        return docRef.path;
      }
      if (docRef._key && docRef._key.path) {
        const segments = docRef._key.path.segments || [];
        return segments.join('/');
      }
      return 'unknown-doc';
    } catch (e) {
      return 'unknown-doc';
    }
  }

  /**
   * Pass-through methods (no reads)
   */
  doc = doc;
  collection = collection;
  query = query;
  where = where;
  orderBy = orderBy;
  collectionGroup = collectionGroup;
  documentId = documentId;
  Timestamp = Timestamp;

  /**
   * Write operations (no reads, but logged for context)
   */
  async addDoc(collectionRef: any, data: any): Promise<any> {
    const path = this.getPathFromQuery(collectionRef);
    this.logger.debug('data', `✍️ addDoc: ${path}`);
    return addDoc(collectionRef, data);
  }

  async updateDoc(docRef: any, data: any): Promise<void> {
    const path = this.getPathFromDoc(docRef);
    this.logger.debug('data', `✍️ updateDoc: ${path}`);
    return updateDoc(docRef, data);
  }

  async deleteDoc(docRef: any): Promise<void> {
    const path = this.getPathFromDoc(docRef);
    this.logger.debug('data', `✍️ deleteDoc: ${path}`);
    return deleteDoc(docRef);
  }
}
