import React from 'react';
import ReactDOM from 'react-dom/client';
import { getCredentials } from '@zcatalyst/auth-client';
import App from './App.jsx';
import './index.css';

function waitForCatalystSdk(timeoutMs = 5000) {
  return new Promise(resolve => {
    const start = Date.now();
    const tick = () => {
      if (window.catalyst?.auth?.isUserAuthenticated) return resolve(window.catalyst);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 100);
    };
    tick();
  });
}

async function boot() {
  // The SDK is only served on Slate; local dev falls through and the API answers 401
  const sdk = await waitForCatalystSdk();
  let user = null;
  if (sdk) {
    try {
      const result = await sdk.auth.isUserAuthenticated();
      user = result?.content || null;
    } catch {
      window.location.href = '/__catalyst/auth/login';
      return;
    }
  }
  await getCredentials().catch(() => {});
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App sessionUser={user} />
    </React.StrictMode>
  );
}

boot();
