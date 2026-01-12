// src/app/app.config.test.ts
// Test configuration that uses Firebase emulators
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

// Firebase providers for Auth and Firestore
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth, connectAuthEmulator } from '@angular/fire/auth';
import { provideFirestore, getFirestore, connectFirestoreEmulator } from '@angular/fire/firestore';
import { environment } from '../environments/environment.test';

// NgRx Store for authentication state management
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

export const appConfigTest: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptorsFromDi()),
    // Firebase initialization with emulators
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => {
      const auth = getAuth();
      if (environment.useEmulators && environment.emulators) {
        connectAuthEmulator(auth, `http://${environment.emulators.auth.host}:${environment.emulators.auth.port}`, {
          disableWarnings: true
        });
      }
      return auth;
    }),
    provideFirestore(() => {
      const firestore = getFirestore();
      if (environment.useEmulators && environment.emulators) {
        connectFirestoreEmulator(firestore, environment.emulators.firestore.host, environment.emulators.firestore.port);
      }
      return firestore;
    }),
    // NgRx Store and Effects
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
