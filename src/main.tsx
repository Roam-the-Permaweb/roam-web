import { render } from 'preact'
import './index.css'
import './styles/error-boundary.css'
import { App } from './app.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>, 
  document.getElementById('app')!
)
