// src/app/core/services/logger.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export type LogTopic =
  | 'ai'              // AI/LLM operations (Groq API, command processing, suggestions)
  | 'recipe'          // Recipe processing
  | 'context'         // Conversation context management
  | 'disambiguation'  // Disambiguation / multi-item selection
  | 'voice'           // Voice assistant (input/output/UI)
  | 'data'            // Firebase/Firestore data operations
  | 'sync'            // Data synchronization & offline sync
  | 'cache'           // Caching operations
  | 'general'         // General / uncategorized
  | 'auth'            // Authentication
  | 'invite'          // Invite processing
  | 'sharing'         // Sharing operations
  | 'auth-effects'    // Auth state effects
  | 'analytics'       // Analytics, metrics, quota monitoring
  | 'upload'          // List/article upload & import
  | 'chat'            // Chat persistence & history
  | 'ui';             // UI components, lifecycle, user interactions

/**
 * Topic groups for convenient bulk enable/disable.
 * Use: logger.enableGroup('ai-all') to enable all AI-related topics at once.
 */
export const LOG_TOPIC_GROUPS: Record<string, LogTopic[]> = {
  'ai-all':    ['ai', 'recipe', 'context', 'disambiguation', 'voice', 'chat'],
  'data-all':  ['data', 'sync', 'cache', 'upload', 'analytics'],
  'auth-all':  ['auth', 'auth-effects', 'invite', 'sharing'],
  'ui-all':    ['ui', 'general'],
};

const ALL_TOPICS: LogTopic[] = [
  'ai', 'recipe', 'context', 'disambiguation', 'voice',
  'data', 'sync', 'cache', 'general',
  'auth', 'invite', 'sharing', 'auth-effects',
  'analytics', 'upload', 'chat', 'ui'
];

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
    enabled: !environment.production,
    level: environment.production ? 'warn' : 'info',
    topics: environment.production
      ? new Set<LogTopic>(['data'])
      : new Set<LogTopic>(['ai', 'recipe', 'data'])
  };

  private topicEmojis: Record<LogTopic, string> = {
    'ai': '🤖',
    'recipe': '🍳',
    'context': '🔄',
    'disambiguation': '🎯',
    'voice': '🎤',
    'data': '📱',
    'sync': '🔄',
    'cache': '💾',
    'general': '💬',
    'auth': '🔐',
    'invite': '✉️',
    'sharing': '🤝',
    'auth-effects': '🔓',
    'analytics': '📊',
    'upload': '📤',
    'chat': '💭',
    'ui': '🖥️'
  };

  private levelPriority: Record<LogLevel, number> = {
    'error': 0,
    'warn': 1,
    'info': 2,
    'debug': 3
  };

  constructor() {
    if (typeof window !== 'undefined') {
      (window as any).logger = this;
    }
  }

  // === CONFIGURATION METHODS ===

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
    console.log(`🔧 Enabled topic: ${topic}`);
  }

  disableTopic(topic: LogTopic): void {
    this.config.topics.delete(topic);
    console.log(`🔧 Disabled topic: ${topic}`);
  }

  enableTopics(...topics: LogTopic[]): void {
    topics.forEach(t => this.config.topics.add(t));
    console.log(`🔧 Enabled topics: ${topics.join(', ')}`);
  }

  disableTopics(...topics: LogTopic[]): void {
    topics.forEach(t => this.config.topics.delete(t));
    console.log(`🔧 Disabled topics: ${topics.join(', ')}`);
  }

  /**
   * Enable a predefined topic group.
   * Groups: 'ai-all', 'data-all', 'auth-all', 'ui-all'
   */
  enableGroup(group: string): void {
    const topics = LOG_TOPIC_GROUPS[group];
    if (!topics) {
      console.warn(`🔧 Unknown group: ${group}. Available: ${Object.keys(LOG_TOPIC_GROUPS).join(', ')}`);
      return;
    }
    topics.forEach(t => this.config.topics.add(t));
    console.log(`🔧 Enabled group "${group}": ${topics.join(', ')}`);
  }

  /**
   * Disable a predefined topic group.
   */
  disableGroup(group: string): void {
    const topics = LOG_TOPIC_GROUPS[group];
    if (!topics) {
      console.warn(`🔧 Unknown group: ${group}. Available: ${Object.keys(LOG_TOPIC_GROUPS).join(', ')}`);
      return;
    }
    topics.forEach(t => this.config.topics.delete(t));
    console.log(`🔧 Disabled group "${group}": ${topics.join(', ')}`);
  }

  enableAllTopics(): void {
    this.config.topics = new Set(ALL_TOPICS);
    console.log('🔧 All logging topics enabled');
  }

  disableAllTopics(): void {
    this.config.topics.clear();
    console.log('🔧 All logging topics disabled');
  }

  /**
   * Enable only the specified topics (disables everything else).
   */
  setTopics(...topics: LogTopic[]): void {
    this.config.topics = new Set(topics);
    console.log(`🔧 Active topics: ${topics.join(', ')}`);
  }

  showConfig(): void {
    console.log('🔧 Logger Config:', {
      enabled: this.config.enabled,
      level: this.config.level,
      topics: Array.from(this.config.topics).sort()
    });
    console.log('🔧 Available groups:', Object.keys(LOG_TOPIC_GROUPS).join(', '));
    console.log('🔧 All topics:', ALL_TOPICS.join(', '));
  }

  /**
   * Print a quick-reference help for the browser console.
   */
  help(): void {
    console.log(`
🔧 ShopLisl Logger — Quick Reference
═══════════════════════════════════════

logger.showConfig()                  Show current settings
logger.setEnabled(true/false)        Toggle all logging
logger.setLevel('debug')             Set level: error | warn | info | debug

── Topic Control ──────────────────────
logger.enableTopic('ai')             Enable one topic
logger.disableTopic('data')          Disable one topic
logger.enableTopics('ai','voice')    Enable multiple topics
logger.setTopics('data','sync')      Enable ONLY these (disable rest)
logger.enableAllTopics()             Enable everything
logger.disableAllTopics()            Silence everything

── Topic Groups ───────────────────────
logger.enableGroup('ai-all')         → ai, recipe, context, disambiguation, voice, chat
logger.enableGroup('data-all')       → data, sync, cache, upload, analytics
logger.enableGroup('auth-all')       → auth, auth-effects, invite, sharing
logger.enableGroup('ui-all')         → ui, general
logger.disableGroup('ai-all')        Disable a group

── All Topics ─────────────────────────
${ALL_TOPICS.map(t => `  ${this.topicEmojis[t]} ${t}`).join('\n')}
    `);
  }

  // === LOGGING METHODS ===

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
    if (!this.config.enabled) return;
    if (this.levelPriority[level] > this.levelPriority[this.config.level]) return;
    if (!this.config.topics.has(topic)) return;

    const emoji = this.topicEmojis[topic];
    const prefix = `${emoji} ${topic.toUpperCase()}:`;

    switch (level) {
      case 'error':
        data !== undefined ? console.error(prefix, message, data) : console.error(prefix, message);
        break;
      case 'warn':
        data !== undefined ? console.warn(prefix, message, data) : console.warn(prefix, message);
        break;
      case 'info':
        data !== undefined ? console.info(prefix, message, data) : console.info(prefix, message);
        break;
      case 'debug':
        data !== undefined ? console.log(prefix, message, data) : console.log(prefix, message);
        break;
    }
  }
}

declare global {
  interface Window {
    logger: LoggerService;
  }
}
