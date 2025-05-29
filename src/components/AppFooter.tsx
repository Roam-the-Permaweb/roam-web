interface AppFooterProps {
  onOpenAbout: () => void
}

export function AppFooter({ onOpenAbout }: AppFooterProps) {
  return (
    <footer className="app-footer">
      <nav>
        <button
          className="footer-link"
          onClick={onOpenAbout}
        >
          About
        </button>
        <span className="footer-separator">|</span>
        <a href="https://github.com/roam-the-permaweb/roam-web" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
      </nav>
      <div className="footer-copy">Roam v0.0.4</div>
    </footer>
  )
}