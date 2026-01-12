// Test environment - uses Firebase emulators
export const environment = {
  production: false,
  useEmulators: true,
  firebase: {
    apiKey: 'fake-api-key',
    authDomain: 'localhost',
    projectId: 'shoplisl-test',
    storageBucket: 'shoplisl-test.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:test'
  },
  groqApiKey: '',
  emulators: {
    auth: {
      host: 'localhost',
      port: 9099
    },
    firestore: {
      host: 'localhost',
      port: 8080
    }
  }
};
