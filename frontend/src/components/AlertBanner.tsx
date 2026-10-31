interface AlertBannerProps {
  tone: "error" | "task";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function AlertBanner({ tone, title, message, actionLabel, onAction }: AlertBannerProps) {
  return (
    <div className={`alert-banner alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
