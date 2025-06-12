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
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app';
import { routes } from './app/app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

// Firebase Imports hinzufügen:
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { FIREBASE_OPTIONS } from '@angular/fire/compat';


const firebaseConfig = {
    projectId: 'shoplisl',
    apiKey: 'AIzaSyADgZN2cKD43ABoVmaCX3UfCbmkcrbYslg',
    authDomain: 'shoplisl.firebaseapp.com',
    storageBucket: 'shoplisl.appspot.com', 
    messagingSenderId: '238499687274',
    appId: '1:238499687274:web:c54bad5031d5531be8d313'
};

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideAnimationsAsync(),
    
    // Firebase-Provider hinzufügen:
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideFirestore(() => getFirestore()),
    { provide: FIREBASE_OPTIONS, useValue: firebaseConfig }
  ]
}).catch(err => console.error(err));