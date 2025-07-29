import { Injectable } from '@angular/core';
import { ConnectionService } from './connection.service';
import { LoggerService } from './logger.service';

export interface QueuedOperation {
  id: string;
  operation: () => Promise<any>;
  description: string;
  timestamp: number;
  retryCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineSyncService {
  private queuedOperations: QueuedOperation[] = [];
  private isProcessingQueue = false;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000; // 2 seconds

  constructor(
    private connectionService: ConnectionService,
    private logger: LoggerService
  ) {
    // Monitor connection changes to process queue when online
    this.connectionService.getConnectionStatus().subscribe(status => {
      if (status.isOnline && this.queuedOperations.length > 0 && !this.isProcessingQueue) {
        this.logger.info('sync', 'Connection restored - processing queued operations');
        setTimeout(() => this.processQueuedOperations(), 1000);
      }
    });
  }

  queueOperation(operation: () => Promise<any>, description: string): void {
    const queuedOp: QueuedOperation = {
      id: this.generateOperationId(),
      operation,
      description,
      timestamp: Date.now(),
      retryCount: 0
    };

    this.queuedOperations.push(queuedOp);
    this.logger.debug('sync', `Queued operation: ${description} (${this.queuedOperations.length} pending)`);

    // If online, process queue immediately
    if (this.connectionService.isOnline() && !this.isProcessingQueue) {
      this.logger.debug('sync', 'Online: Processing queue immediately');
      setTimeout(() => this.processQueuedOperations(), 1000);
    } else if (!this.connectionService.isOnline()) {
      this.logger.debug('sync', 'Offline: Operation queued for later sync');
    }
  }

  async processQueuedOperations(): Promise<void> {
    if (this.queuedOperations.length === 0) {
      this.logger.debug('sync', 'No queued operations to process');
      return;
    }

    if (this.isProcessingQueue) {
      this.logger.debug('sync', 'Queue processing already in progress');
      return;
    }

    if (!this.connectionService.isOnline()) {
      this.logger.debug('sync', 'Cannot process queue: offline');
      return;
    }

    this.isProcessingQueue = true;
    this.logger.info('sync', `Processing ${this.queuedOperations.length} queued operations`);
    
    const operations = [...this.queuedOperations];
    this.queuedOperations = []; // Clear queue immediately to prevent re-processing

    let successCount = 0;
    let failCount = 0;

    for (const [index, queuedOp] of operations.entries()) {
      try {
        this.logger.debug('sync', `Processing operation ${index + 1}/${operations.length}: ${queuedOp.description}`);
        await queuedOp.operation();
        successCount++;
        this.logger.debug('sync', `✅ Operation completed: ${queuedOp.description}`);
      } catch (error) {
        failCount++;
        this.logger.error('sync', `❌ Operation failed: ${queuedOp.description}`, error);
        
        // Retry logic
        queuedOp.retryCount++;
        if (queuedOp.retryCount <= this.MAX_RETRIES) {
          this.logger.debug('sync', `Retrying operation: ${queuedOp.description} (attempt ${queuedOp.retryCount}/${this.MAX_RETRIES})`);
          // Re-queue with delay
          setTimeout(() => {
            this.queuedOperations.push(queuedOp);
          }, this.RETRY_DELAY * queuedOp.retryCount);
        } else {
          this.logger.error('sync', `Max retries exceeded for operation: ${queuedOp.description}`);
        }
      }
    }

    this.logger.info('sync', `Queue processing complete: ${successCount} success, ${failCount} failed`);
    
    if (this.queuedOperations.length > 0) {
      this.logger.warn('sync', `${this.queuedOperations.length} operations still pending (will retry later)`);
    }

    this.isProcessingQueue = false;

    // If there are still operations in queue (from retries), process them after a delay
    if (this.queuedOperations.length > 0 && this.connectionService.isOnline()) {
      setTimeout(() => this.processQueuedOperations(), this.RETRY_DELAY);
    }
  }

  getQueueStatus(): {
    queueLength: number;
    isProcessing: boolean;
    operations: Array<{
      id: string;
      description: string;
      timestamp: number;
      retryCount: number;
    }>;
  } {
    return {
      queueLength: this.queuedOperations.length,
      isProcessing: this.isProcessingQueue,
      operations: this.queuedOperations.map(op => ({
        id: op.id,
        description: op.description,
        timestamp: op.timestamp,
        retryCount: op.retryCount
      }))
    };
  }

  clearQueue(): void {
    this.queuedOperations = [];
    this.logger.info('sync', 'Queue cleared manually');
  }

  getQueuedOperationsCount(): number {
    return this.queuedOperations.length;
  }

  hasQueuedOperations(): boolean {
    return this.queuedOperations.length > 0;
  }

  // Force process queue (useful for testing or manual sync)
  async forceProcessQueue(): Promise<void> {
    this.logger.info('sync', 'Force processing queue requested');
    await this.processQueuedOperations();
  }

  private generateOperationId(): string {
    return 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Get age of oldest queued operation
  getOldestOperationAge(): number | null {
    if (this.queuedOperations.length === 0) return null;
    
    const oldestTimestamp = Math.min(...this.queuedOperations.map(op => op.timestamp));
    return Date.now() - oldestTimestamp;
  }

  // Remove specific operation from queue (useful for debugging)
  removeOperation(operationId: string): boolean {
    const initialLength = this.queuedOperations.length;
    this.queuedOperations = this.queuedOperations.filter(op => op.id !== operationId);
    
    if (this.queuedOperations.length < initialLength) {
      this.logger.debug('sync', `Removed operation ${operationId} from queue`);
      return true;
    }
    
    return false;
  }
}