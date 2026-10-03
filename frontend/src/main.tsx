import React from "react";
import ReactDOM from 'react-dom/client';
import App from './App';
import { initAnalytics } from './lib/analytics';
import './index.css';
// Product analytics, when the build opts in and the visitor has not said no. Runs before
// the first render so `app_opened` carries the real entry path rather than a post-navigation
// one. Off by default — see frontend/src/lib/analytics.ts.
initAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
// Register Service Worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/serviceWorker.js').catch((err) => {
      console.error('Service Worker registration failed:', err);
    });
  });
}
import './leaflet-transparent.css';
