import { StrictMode, Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          margin: '40px auto',
          maxWidth: '600px',
          backgroundColor: '#fff3f3',
          border: '1px solid #ffcdd2',
          borderRadius: '8px',
          fontFamily: 'sans-serif',
          direction: 'rtl'
        }}>
          <h2 style={{ color: '#d32f2f', marginTop: 0 }}>تنبيه: حدث خطأ أثناء تشغيل النظام</h2>
          <p style={{ color: '#555' }}>تفاصيل الخطأ التشغيلي:</p>
          <pre style={{
            backgroundColor: '#1e1e1e',
            color: '#f8f8f2',
            padding: '12px',
            borderRadius: '6px',
            overflowX: 'auto',
            direction: 'ltr',
            fontSize: '13px'
          }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: '15px',
              padding: '8px 16px',
              backgroundColor: '#1976d2',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            إعادة تحميل الصفحة
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
