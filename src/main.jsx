import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { StoreProvider } from './store.jsx';
import { ConfirmProvider } from './components/Confirm.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode><StoreProvider><ConfirmProvider><App /></ConfirmProvider></StoreProvider></StrictMode>,
);
