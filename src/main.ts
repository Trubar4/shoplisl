/*
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app';
import { routes } from './app/app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideAnimationsAsync()
  ]
}).catch(err => console.error(err));
*/

import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app';
import { appConfig } from './app/app.config';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { isDevMode } from '@angular/core';
import { reducers } from './app/state/app.state';
import { ListsEffects } from './app/state/lists/lists.effects';
import { ArticlesEffects } from './app/state/articles/articles.effects';

// Phase 8: Use centralized appConfig and add NgRx state management
bootstrapApplication(AppComponent, {
  providers: [
    ...appConfig.providers,
    // NgRx State Management
    provideStore(reducers),
    provideEffects([ListsEffects, ArticlesEffects]),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() })
  ]
}).catch(err => console.error(err));