import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n.js';
import './index.css';
import App from './App.jsx';
import { PosConfigProvider } from './context/PosConfigContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PosConfigProvider>
      <App />
    </PosConfigProvider>
  </React.StrictMode>
);
