import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCPP1HIA8eeA8bQHiEfCJxeW4GeGfaBMSQ",
  authDomain: "hazardnet-live.firebaseapp.com",
  projectId: "hazardnet-live",
  storageBucket: "hazardnet-live.firebasestorage.app",
  messagingSenderId: "603544934283",
  appId: "1:603544934283:web:224f6c3c39313e3865c18e",
  measurementId: "G-HM87K2B3KT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export { app, analytics };
