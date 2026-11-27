import type { ReactNode } from "react";

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "danger" }) {
  return <button className={`button button-${variant}`} {...props}>{children}</button>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function Empty({ children = "Aucun élément pour le moment." }: { children?: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function Table({ children }: { children: ReactNode }) {
  return <div className="table-scroll"><table>{children}</table></div>;
}

export function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

export function SelectField({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select {...props}>{children}</select>
    </label>
  );
}

export function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div><div className="heading-accent">G.</div></div>;
}

export function PanelTitle({ title, count }: { title: string; count: number }) {
  return <div className="panel-title"><h2>{title}</h2><span className="count-pill">{count}</span></div>;
}

export function Status({ active }: { active: boolean }) {
  return <span className={`status ${active ? "status-active" : "status-inactive"}`}>{active ? "Actif" : "Inactif"}</span>;
}
