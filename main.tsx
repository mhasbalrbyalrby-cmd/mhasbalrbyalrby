import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// التقاط أخطاء النافذة العامة
window.addEventListener('error', (event) => {
  showError(event.error?.stack || event.message);
});

// التقاط أخطاء الـ Promises الرافضة (مثل أخطاء Supabase أو الشبكة)
window.addEventListener('unhandledrejection', (event) => {
  showError(event.reason?.stack || event.reason);
});

function showError(msg: any) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 20px; background: #fff; color: #d32f2f; font-family: monospace; dir: ltr; text-align: left;">
        <h2 style="margin-top:0;">⚠️ Runtime Error Caught:</h2>
        <pre style="white-space: pre-wrap; word-break: break-word; background: #ffebee; padding: 10px; border-radius: 4px;">${msg}</pre>
      </div>
    `;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
