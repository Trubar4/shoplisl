// src/app/app.config.ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideServiceWorker } from '@angular/service-worker';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'; // ✅ Try this approach

import { FirebaseDataService } from './core/services/firebase-data.service';
import { OfflineSyncService } from './core/services/offline-sync.service';
import { ArticlesRepositoryService } from './core/services/articles-repository.service';
import { ListsRepositoryService } from './core/services/lists-repository.service';
import { DataMigrationService } from './core/services/data-migration.service';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptorsFromDi()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    FirebaseDataService,
    OfflineSyncService, 
    ArticlesRepositoryService,
    ListsRepositoryService,
    DataMigrationService
  ]
};