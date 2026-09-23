import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// التقاط الأخطاء غير المعالجة وعرضها على الشاشة
window.addEventListener('error', (event) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding: 20px; color: red; font-family: sans-serif;">
      <h2>حدث خطأ أثناء التشغيل:</h2>
      <pre>${event.message}</pre>
    </div>`;
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
