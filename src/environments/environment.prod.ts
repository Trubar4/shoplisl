// src/environments/environment.prod.ts  
export const environment = {
    production: true,
    firebase: {
      // Same values as above - Firebase config is safe to expose in frontend
      projectId: 'shoplisl',
      appId: 'YOUR_APP_ID',
      databaseURL: 'https://shoplisl-default-rtdb.firebasebaseapp.com',
      storageBucket: 'shoplisl.appspot.com', 
      apiKey: 'YOUR_API_KEY',
      authDomain: 'shoplisl.firebaseapp.com',
      messagingSenderId: 'YOUR_SENDER_ID',
    }
}