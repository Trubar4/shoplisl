import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomTabsComponent } from './shared/components/bottom-tabs/bottom-tabs';
import { LoggerService } from './core/services/logger.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, BottomTabsComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent {
  title = 'shoplisl-app';
  
  constructor(private logger: LoggerService) {
    // Logger is now automatically available at window.logger
    // Initial setup for development
    if (typeof window !== 'undefined') {
      console.log('🔧 ShopLisl Logger ready! Use window.logger to control logging');
      
      // Show helpful commands
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
      `);
    }
  }
}