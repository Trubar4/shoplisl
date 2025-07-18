// src/app/core/services/logger.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type LogTopic = 'ai' | 'recipe' | 'context' | 'disambiguation' | 'voice' | 'data' | 'general';

interface LogConfig {
  enabled: boolean;
  level: LogLevel;
  topics: Set<LogTopic>;
}

@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  private config: LogConfig = {
    enabled: !environment.production, // Disable in production by default
    level: 'info', // Only show info and above by default
    topics: new Set(['ai', 'recipe']) // Only show AI and recipe by default
  };

  constructor() {
    // Auto-setup console access in browser
    if (typeof window !== 'undefined') {
      (window as any).logger = this;
      if (this.config.enabled) {
        console.log('🔧 Logger initialized. Use logger.showConfig() to see settings');
      }
    }
  }

  private topicEmojis: Record<LogTopic, string> = {
    'ai': '🤖',
    'recipe': '🍳', 
    'context': '🔄',
    'disambiguation': '🎯',
    'voice': '🎤',
    'data': '📱',
    'general': '💬'
  };

  private levelPriority: Record<LogLevel, number> = {
    'error': 0,
    'warn': 1, 
    'info': 2,
    'debug': 3
  };

  // Public methods to control logging
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    console.log(`🔧 Logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
    console.log(`🔧 Log level set to: ${level}`);
  }

  enableTopic(topic: LogTopic): void {
    this.config.topics.add(topic);
    console.log(`🔧 Enabled logging for: ${topic}`);
  }

  disableTopic(topic: LogTopic): void {
    this.config.topics.delete(topic);
    console.log(`🔧 Disabled logging for: ${topic}`);
  }

  enableAllTopics(): void {
    this.config.topics = new Set(['ai', 'recipe', 'context', 'disambiguation', 'voice', 'data', 'general']);
    console.log('🔧 All logging topics enabled');
  }

  disableAllTopics(): void {
    this.config.topics.clear();
    console.log('🔧 All logging topics disabled');
  }

  showConfig(): void {
    console.log('🔧 Current Logger Config:', {
      enabled: this.config.enabled,
      level: this.config.level,
      topics: Array.from(this.config.topics)
    });
  }

  // Logging methods
  error(topic: LogTopic, message: string, data?: any): void {
    this.log('error', topic, message, data);
  }

  warn(topic: LogTopic, message: string, data?: any): void {
    this.log('warn', topic, message, data);
  }

  info(topic: LogTopic, message: string, data?: any): void {
    this.log('info', topic, message, data);
  }

  debug(topic: LogTopic, message: string, data?: any): void {
    this.log('debug', topic, message, data);
  }

  private log(level: LogLevel, topic: LogTopic, message: string, data?: any): void {
    // Check if logging is enabled
    if (!this.config.enabled) return;
    
    // Check if this level should be logged
    if (this.levelPriority[level] > this.levelPriority[this.config.level]) return;
    
    // Check if this topic should be logged
    if (!this.config.topics.has(topic)) return;

    const emoji = this.topicEmojis[topic];
    const prefix = `${emoji} ${topic.toUpperCase()}:`;
    
    switch (level) {
      case 'error':
        console.error(prefix, message, data || '');
        break;
      case 'warn':
        console.warn(prefix, message, data || '');
        break;
      case 'info':
        console.info(prefix, message, data || '');
        break;
      case 'debug':
        console.log(prefix, message, data || '');
        break;
    }
  }

  // Convenience method for existing prefixed logs
  legacy(originalLog: string): void {
    if (!this.config.enabled) return;
    console.log(originalLog);
  }
}

// Global logger instance that can be used in console
declare global {
  interface Window {
    logger: LoggerService;
  }
}