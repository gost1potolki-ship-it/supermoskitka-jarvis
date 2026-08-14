import { initializeApp } from 'firebase/app';
import { enableIndexedDbPersistence, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAP7v2SrxlsXS_ZKqwDd0uBXvnbFBgd-Ss',
  authDomain: 'supermoskitka-587fb.firebaseapp.com',
  projectId: 'supermoskitka-587fb',
  storageBucket: 'supermoskitka-587fb.firebasestorage.app',
  messagingSenderId: '505814890356',
  appId: '1:505814890356:web:f0677cb6deb3891a415e21',
  measurementId: 'G-J7RGSHFRB8',
};

const app = initializeApp(firebaseConfig);
export { app };
export const db = getFirestore(app);

enableIndexedDbPersistence(db).catch((err: { code?: string }) => {
  if (err?.code === 'failed-precondition') {
    console.warn('Firestore offline cache: несколько вкладок.');
    return;
  }
  if (err?.code === 'unimplemented') {
    console.warn('Firestore offline cache не поддерживается.');
    return;
  }
  console.warn('Firestore offline cache error:', err);
});
