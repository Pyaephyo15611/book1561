import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);  // This line was missing

// For Backblaze B2 storage
const backblazeConfig = {
  bucketName: process.env.REACT_APP_BACKBLAZE_BUCKET_NAME,
  endpoint: process.env.REACT_APP_BACKBLAZE_ENDPOINT,
  region: process.env.REACT_APP_BACKBLAZE_REGION || 'us-east-1',
  accessKeyId: process.env.REACT_APP_BACKBLAZE_ACCESS_KEY_ID,
  secretAccessKey: process.env.REACT_APP_BACKBLAZE_SECRET_ACCESS_KEY,
  s3ForcePathStyle: true,
  signatureVersion: 'v4'
};

export { db, auth, storage, app, backblazeConfig };