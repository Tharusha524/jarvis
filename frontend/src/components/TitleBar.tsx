import { appWindow, isDesktopApp } from "../services/desktop";

export function TitleBar() {
  return (
    <header className="title-bar" data-tauri-drag-region>
      <div className="wordmark" data-tauri-drag-region>
        <span className="wordmark-core" />
        J.A.R.V.I.S
      </div>
      {isDesktopApp && (
        <div className="window-controls">
          <button type="button" aria-label="Minimize" title="Minimize" onClick={() => void appWindow.minimize()}>
            <svg viewBox="0 0 12 12"><path d="M2 6h8" /></svg>
          </button>
          <button
            type="button"
            aria-label="Maximize or restore"
            title="Maximize or restore"
            onClick={() => void appWindow.toggleMaximize()}
          >
            <svg viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" /></svg>
          </button>
          <button
            type="button"
            className="window-close"
            aria-label="Close"
            title="Close"
            onClick={() => void appWindow.close()}
          >
            <svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" /></svg>
          </button>
        </div>
      )}
    </header>
  );
}
