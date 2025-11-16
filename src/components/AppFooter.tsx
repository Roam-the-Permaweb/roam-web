interface AppFooterProps {
  onOpenAbout: () => void
}

export function AppFooter({ onOpenAbout }: AppFooterProps) {
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <button
          className="footer-item"
          onClick={onOpenAbout}
        >
          About
        </button>
        <span className="footer-separator">•</span>
        <a 
          href="https://github.com/roam-the-permaweb/roam-web" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="footer-item"
        >
          GitHub
        </a>
        <span className="footer-separator">•</span>
        <span className="footer-item footer-version">v0.2.1</span>
      </div>
    </footer>
  )
}