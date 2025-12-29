import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth/lite';
import { initializeFirestore } from 'firebase/firestore/lite';

const firebaseConfig = {
  apiKey: 'AIzaSyDusKuyKz1HL9sqsRlVKZZ9cFK2K0_I2yA',
  authDomain: 'bookstore-7b100.firebaseapp.com',
  projectId: 'bookstore-7b100',
  storageBucket: 'bookstore-7b100.firebasestorage.app',
  messagingSenderId: '1020171114886',
  appId: '1:1020171114886:web:e28dfb1bfef8b6ac7db407',
  measurementId: 'G-0PB50Q7C8M'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
});
export default app;

