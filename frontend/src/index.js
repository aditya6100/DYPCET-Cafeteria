import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Default React styling, can be removed later
import App from './App';
import reportWebVitals from './reportWebVitals';
import './styles/style.css'; // Import global styles
import './styles/alerts.css'; // Import global alert styles

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
