import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBIPx1-f9UHyyoaoDqMwjXpjhogVw2ixGo",
  authDomain: "diario-de-trade-df81f.firebaseapp.com",
  projectId: "diario-de-trade-df81f",
  storageBucket: "diario-de-trade-df81f.firebasestorage.app",
  messagingSenderId: "149847894486",
  appId: "1:149847894486:web:98f8120960e148911c1c77",
  measurementId: "G-WN7P9DRJ39"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
