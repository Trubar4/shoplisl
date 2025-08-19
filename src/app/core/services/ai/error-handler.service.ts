// src/app/core/services/ai/error-handler.service.ts
import { Injectable } from '@angular/core';
import { Observable, throwError, of } from 'rxjs';
import { catchError, retry, timeout } from 'rxjs/operators';
import { AIExecutionResult, AIServiceError } from './ai-models';
import { LoggerService } from '../logger.service';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorContext {
  operation: string;
  input?: any;
  metadata?: Record<string, any>;
  userId?: string;
  timestamp: Date;
}

export interface ErrorHandlingConfig {
  retryAttempts: number;
  retryDelay: number;
  timeoutMs: number;
  fallbackEnabled: boolean;
  logLevel: ErrorSeverity;
}

@Injectable({
  providedIn: 'root'
})
export class AIErrorHandlerService {
  
  private readonly defaultConfig: ErrorHandlingConfig = {
    retryAttempts: 2,
    retryDelay: 1000,
    timeoutMs: 10000,
    fallbackEnabled: true,
    logLevel: ErrorSeverity.MEDIUM
  };

  constructor(private logger: LoggerService) {}

  /**
   * Handle errors with automatic retry and fallback
   */
  handleWithRetry<T>(
    operation: () => Observable<T>,
    context: ErrorContext,
    config?: Partial<ErrorHandlingConfig>
  ): Observable<T> {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    return operation().pipe(
      timeout(finalConfig.timeoutMs),
      retry(finalConfig.retryAttempts),
      catchError(error => {
        this.logError(error, context, ErrorSeverity.MEDIUM);
        
        if (finalConfig.fallbackEnabled) {
          return this.provideFallback<T>(context);
        }
        
        return throwError(this.createAIServiceError(error, context));
      })
    );
  }

  /**
   * Handle errors and convert to AI execution result
   */
  handleAsExecutionResult(
    error: any,
    context: ErrorContext,
    fallbackMessage?: string
  ): AIExecutionResult {
    this.logError(error, context, ErrorSeverity.MEDIUM);
    
    const userMessage = this.getUserFriendlyMessage(error, fallbackMessage);
    
    return {
      success: false,
      message: userMessage,
      error: this.sanitizeErrorForUser(error)
    };
  }

  /**
   * Wrap async operations with error handling
   */
  async safeExecute<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    fallback?: T
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logError(error, context, ErrorSeverity.MEDIUM);
      
      if (fallback !== undefined) {
        return fallback;
      }
      
      throw this.createAIServiceError(error, context);
    }
  }

  /**
   * Create standardized AI service error
   */
  createAIServiceError(originalError: any, context: ErrorContext): AIServiceError {
    const errorCode = this.determineErrorCode(originalError, context);
    const message = this.getErrorMessage(originalError, context);
    
    return new AIServiceError(message, errorCode, {
      originalError,
      context,
      timestamp: new Date()
    });
  }

  /**
   * Log error with context
   */
  logError(error: any, context: ErrorContext, severity: ErrorSeverity): void {
    const message = `${severity.toUpperCase()} Error in ${context.operation}: ${error.message || 'Unknown error'}`;
    const logData = {
      error: this.serializeError(error),
      context,
      severity,
      timestamp: new Date()
    };
  
    // Use console logging with structured data
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        console.error(message, logData);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(message, logData);
        break;
      case ErrorSeverity.LOW:
        console.info(message, logData);
        break;
    }
    
    // Use logger service with correct signature (topic, message, data)
    try {
      if (severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.HIGH) {
        this.logger.error('ai', message, logData);
      } else if (severity === ErrorSeverity.MEDIUM) {
        this.logger.warn('ai', message, logData);
      } else {
        this.logger.info('ai', message, logData);
      }
    } catch (loggerError) {
      console.warn('Logger service error:', loggerError);
    }
  }

  /**
   * Validate input and throw descriptive error if invalid
   */
  validateInput(input: any, rules: ValidationRule[], context: ErrorContext): void {
    for (const rule of rules) {
      if (!rule.validator(input)) {
        const error = new Error(rule.message);
        this.logError(error, context, ErrorSeverity.LOW);
        throw this.createAIServiceError(error, context);
      }
    }
  }

  /**
   * Create timeout wrapper for operations
   */
  withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    context: ErrorContext
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          const timeoutError = new Error(`Operation timed out after ${timeoutMs}ms`);
          reject(this.createAIServiceError(timeoutError, context));
        }, timeoutMs);
      })
    ]);
  }

  // ========================================
  // SPECIFIC ERROR HANDLING PATTERNS
  // ========================================

  /**
   * Handle disambiguation errors
   */
  handleDisambiguationError(error: any, itemName: string): AIExecutionResult {
    const context: ErrorContext = {
      operation: 'disambiguation',
      input: { itemName },
      timestamp: new Date()
    };

    return this.handleAsExecutionResult(
      error,
      context,
      `❌ Fehler beim Verarbeiten von "${itemName}". Bitte versuche es erneut.`
    );
  }

  /**
   * Handle multi-item processing errors
   */
  handleMultiItemError(error: any, items: any[], currentIndex: number): AIExecutionResult {
    const context: ErrorContext = {
      operation: 'multi_item_processing',
      input: { items, currentIndex },
      metadata: { totalItems: items.length },
      timestamp: new Date()
    };

    return this.handleAsExecutionResult(
      error,
      context,
      `❌ Fehler beim Verarbeiten der Artikel. ${currentIndex} von ${items.length} wurden verarbeitet.`
    );
  }

  /**
   * Handle list operation errors
   */
  handleListOperationError(error: any, operation: string, listId?: string): AIExecutionResult {
    const context: ErrorContext = {
      operation: `list_${operation}`,
      input: { listId },
      timestamp: new Date()
    };

    return this.handleAsExecutionResult(
      error,
      context,
      `❌ Fehler bei der Listen-Operation. Bitte versuche es erneut.`
    );
  }

  /**
   * Handle API errors (network, timeout, etc.)
   */
  handleAPIError(error: any, endpoint: string): AIExecutionResult {
    const context: ErrorContext = {
      operation: 'api_call',
      input: { endpoint },
      timestamp: new Date()
    };

    if (this.isNetworkError(error)) {
      return this.handleAsExecutionResult(
        error,
        context,
        '🌐 Netzwerkfehler. Bitte überprüfe deine Internetverbindung.'
      );
    }

    if (this.isTimeoutError(error)) {
      return this.handleAsExecutionResult(
        error,
        context,
        '⏱️ Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.'
      );
    }

    return this.handleAsExecutionResult(
      error,
      context,
      '❌ Service-Fehler. Bitte versuche es später erneut.'
    );
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  private provideFallback<T>(context: ErrorContext): Observable<T> {
    // Provide appropriate fallbacks based on operation type
    switch (context.operation) {
      case 'disambiguation':
        return of([] as any); // Empty disambiguation options
      
      case 'suggestions':
        return of({
          departmentId: 'miscellaneous',
          icon: '📦',
          confidence: 0,
          source: 'fallback'
        } as any);
      
      case 'list_selection':
        return of([] as any); // Empty list options
      
      default:
        return throwError(this.createAIServiceError(new Error('No fallback available'), context));
    }
  }

  private determineErrorCode(error: any, context: ErrorContext): string {
    if (error instanceof AIServiceError) {
      return error.code;
    }

    if (this.isNetworkError(error)) {
      return 'NETWORK_ERROR';
    }

    if (this.isTimeoutError(error)) {
      return 'TIMEOUT_ERROR';
    }

    if (this.isValidationError(error)) {
      return 'VALIDATION_ERROR';
    }

    if (this.isAuthError(error)) {
      return 'AUTH_ERROR';
    }

    return `${context.operation.toUpperCase()}_ERROR`;
  }

  private getErrorMessage(error: any, context: ErrorContext): string {
    if (error instanceof AIServiceError) {
      return error.message;
    }

    if (error.message) {
      return `Error in ${context.operation}: ${error.message}`;
    }

    return `Unknown error in ${context.operation}`;
  }

  private getUserFriendlyMessage(error: any, fallback?: string): string {
    if (fallback) {
      return fallback;
    }

    if (this.isNetworkError(error)) {
      return '🌐 Verbindungsfehler. Bitte überprüfe deine Internetverbindung.';
    }

    if (this.isTimeoutError(error)) {
      return '⏱️ Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.';
    }

    if (this.isValidationError(error)) {
      return '❌ Ungültige Eingabe. Bitte überprüfe deine Daten.';
    }

    if (this.isAuthError(error)) {
      return '🔐 Authentifizierungsfehler. Bitte melde dich erneut an.';
    }

    return '❌ Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.';
  }

  private sanitizeErrorForUser(error: any): string {
    // Remove sensitive information and provide clean error message
    if (error instanceof AIServiceError) {
      return error.code;
    }

    if (error.name) {
      return error.name;
    }

    return 'UnknownError';
  }

  private serializeError(error: any): any {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    if (typeof error === 'object') {
      return JSON.stringify(error);
    }

    return String(error);
  }

  private isNetworkError(error: any): boolean {
    return error.name === 'NetworkError' || 
           error.code === 'NETWORK_ERROR' ||
           error.message?.includes('network') ||
           error.message?.includes('fetch');
  }

  private isTimeoutError(error: any): boolean {
    return error.name === 'TimeoutError' ||
           error.code === 'TIMEOUT_ERROR' ||
           error.message?.includes('timeout') ||
           error.message?.includes('timed out');
  }

  private isValidationError(error: any): boolean {
    return error.name === 'ValidationError' ||
           error.code === 'VALIDATION_ERROR' ||
           error.message?.includes('validation') ||
           error.message?.includes('invalid input');
  }

  private isAuthError(error: any): boolean {
    return error.name === 'AuthenticationError' ||
           error.code === 'AUTH_ERROR' ||
           error.status === 401 ||
           error.status === 403;
  }
}

// Validation rule interface
export interface ValidationRule {
  validator: (input: any) => boolean;
  message: string;
}

// Common validation rules
// Add these exports at the end of error-handler.service.ts if they're missing:
export const ValidationRules = {
    required: (fieldName: string): ValidationRule => ({
      validator: (input: any) => input != null && input !== '',
      message: `${fieldName} ist erforderlich`
    }),
  
    minLength: (fieldName: string, min: number): ValidationRule => ({
      validator: (input: any) => typeof input === 'string' && input.length >= min,
      message: `${fieldName} muss mindestens ${min} Zeichen lang sein`
    }),
  
    maxLength: (fieldName: string, max: number): ValidationRule => ({
      validator: (input: any) => typeof input === 'string' && input.length <= max,
      message: `${fieldName} darf maximal ${max} Zeichen lang sein`
    }),
  
    isArray: (fieldName: string): ValidationRule => ({
      validator: (input: any) => Array.isArray(input),
      message: `${fieldName} muss ein Array sein`
    }),
  
    notEmpty: (fieldName: string): ValidationRule => ({
      validator: (input: any) => Array.isArray(input) && input.length > 0,
      message: `${fieldName} darf nicht leer sein`
    }),
  
    isValidId: (fieldName: string): ValidationRule => ({
      validator: (input: any) => typeof input === 'string' && input.length > 0 && !input.includes(' '),
      message: `${fieldName} muss eine gültige ID sein`
    })
  };

// Error handling decorator
export function HandleErrors(
    fallbackResult?: any,
    logLevel: ErrorSeverity = ErrorSeverity.MEDIUM
  ) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      const originalMethod = descriptor.value;
      
      descriptor.value = async function (...args: any[]) {
        // Get error handler from the instance
        const errorHandler = (this as any).errorHandler || (this as any).aiErrorHandler;
        
        if (!errorHandler) {
          return originalMethod.apply(this, args);
        }
        
        const context: ErrorContext = {
          operation: `${this.constructor.name}.${propertyKey}`,
          input: args,
          timestamp: new Date()
        };
        
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          errorHandler.logError(error, context, logLevel);
          
          if (fallbackResult !== undefined) {
            return fallbackResult;
          }
          
          throw errorHandler.createAIServiceError(error, context);
        }
      };
      
      return descriptor;
    };
  }

