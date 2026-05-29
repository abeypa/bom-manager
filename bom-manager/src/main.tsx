import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' }

  static getDerivedStateFromError(e: Error) {
    return { hasError: true, message: e.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif', background: '#eef4fb', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 24, padding: '2rem 2.5rem', maxWidth: 480, border: '1px solid rgba(31,73,117,0.13)', boxShadow: '0 12px 30px rgba(6,20,40,0.10)' }}>
            <div style={{ fontSize: 32, marginBottom: 8, fontWeight: 700 }} aria-hidden="true">!</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Something went wrong</h2>
            <p style={{ color: '#425c78', margin: '0 0 1.5rem', fontSize: 14 }}>{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0f6cbf 45%, #0c2244 100%)', color: 'white', border: 'none', borderRadius: 999, padding: '10px 20px', fontWeight: 600, cursor: 'pointer' }}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
