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
    const errorMessage = typeof msg === 'object' && msg !== null ? JSON.stringify(msg, null, 2) : String(msg);
    root.innerHTML = `
      <div dir="ltr" style="padding: 24px; background: #fff; color: #d32f2f; font-family: monospace; text-align: left; height: 100vh; overflow-y: auto; box-sizing: border-box;">
        <h2 style="margin-top:0; font-size: 20px; border-bottom: 2px solid #ffebee; padding-bottom: 8px;">⚠️ Runtime Error Caught:</h2>
        <pre style="white-space: pre-wrap; word-break: break-word; background: #ffebee; padding: 12px; border-radius: 6px; font-size: 14px; color: #b71c1c;">${errorMessage}</pre>
        <button onclick="window.location.reload()" style="margin-top: 16px; background: #d32f2f; color: #fff; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-family: inherit; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">إعادة تحميل التطبيق / Reload App</button>
      </div>
    `;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
