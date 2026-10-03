import React from "react";
import ReactDOM from 'react-dom/client';
import App from './App';
import { initAnalytics } from './lib/analytics';
import { applyBandwidthAttribute } from './lib/bandwidth';
import './index.css';
// Low-bandwidth mode is a document-level decision and has to be made before the first paint:
// the CSS that collapses blur/durations keys off `html[data-low-bandwidth='true']`, and the
// React surfaces that keep it in sync only mount on the map and alert pages. Without this the
// landing page's hero animation and 100px glows run on devices that asked not to have them.
applyBandwidthAttribute();
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
