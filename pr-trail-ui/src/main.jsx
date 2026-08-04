import React from 'react';
import ReactDOM from 'react-dom/client';
import { getCredentials } from '@zcatalyst/auth-client';
import App from './App.jsx';
import './index.css';

getCredentials()
  .catch(() => { /* continue — local dev may not have credentials */ })
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
