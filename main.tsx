import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// التقاط أخطاء النافذة العامة
window.addEventListener('error', (event) => {
  showError(event.error?.stack || event.message);
});

// التقاط أخطاء الـ Promises الرافضة
window.addEventListener('unhandledrejection', (event) => {
  showError(event.reason?.stack || event.reason);
});

function showError(msg: unknown) {
  const root = document.getElementById('root');
  if (root) {
    const errorMessage = typeof msg === 'object' && msg !== null ? JSON.stringify(msg) : String(msg);
    root.innerHTML = `
      <div style="padding: 20px; background: #fff; color: #d32f2f; font-family: monospace; dir: ltr; text-align: left;">
        <h2 style="margin-top:0;">⚠️ Runtime Error Caught:</h2>
        <pre style="white-space: pre-wrap; word-break: break-word; background: #ffebee; padding: 10px; border-radius: 4px;">${errorMessage}</pre>
      </div>
    `;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
