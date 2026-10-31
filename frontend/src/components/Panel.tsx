import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, children, className = "" }: PanelProps) {
  return (
    <section className={`panel ${className}`} aria-label={title}>
      <h2 className="panel-title">{title}</h2>
      {children}
    </section>
  );
}
