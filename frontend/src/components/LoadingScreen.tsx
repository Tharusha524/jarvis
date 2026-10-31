interface LoadingScreenProps {
  graphicsReady: boolean;
  statusReady: boolean;
  leaving: boolean;
}

function Step({ label, done }: { label: string; done: boolean }) {
  return (
    <li className={done ? "is-done" : ""}>
      <i />
      {label}
    </li>
  );
}

export function LoadingScreen({ graphicsReady, statusReady, leaving }: LoadingScreenProps) {
  return (
    <div className={`loading-screen ${leaving ? "is-leaving" : ""}`} role="status" aria-label="JARVIS is starting">
      <div className="loading-reactor">
        <span />
        <span />
        <span />
      </div>
      <div className="loading-title">J.A.R.V.I.S</div>
      <ul className="loading-steps">
        <Step label="3D graphics" done={graphicsReady} />
        <Step label="System checks" done={statusReady} />
      </ul>
    </div>
  );
}
