// src/app/app.config.ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideServiceWorker } from '@angular/service-worker';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'; // ✅ Try this approach

// Phase 8: Firebase providers for Auth and Firestore
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { environment } from '../environments/environment';

// Phase 8: NgRx Store for authentication state management
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { authReducer } from './state/auth/auth.reducer';
import { AuthEffects } from './state/auth/auth.effects';

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
    // Phase 8: Firebase initialization
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    // Phase 8: NgRx Store and Effects
    provideStore({ auth: authReducer }),
    provideEffects([AuthEffects]),
    // Application services
    FirebaseDataService,
    OfflineSyncService,
    ArticlesRepositoryService,
    ListsRepositoryService,
    DataMigrationService
  ]
};