import { useState, type ReactNode } from "react";

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

export type ConfirmRequest = { message: string; onConfirm: () => void };
export type PromptRequest = {
  message: string;
  onSubmit: (value: string) => void;
  inputType?: "text" | "password";
};

// Remplace window.confirm par une boîte de dialogue accessible et stylée, cohérente avec le reste de l'interface.
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  if (!request) return null;
  return (
    <div className="detail-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="detail-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <p id="confirm-dialog-title">{request.message}</p>
        <div className="form-actions">
          <Button variant="quiet" type="button" onClick={onClose}>Annuler</Button>
          <Button type="button" onClick={() => { const { onConfirm } = request; onClose(); onConfirm(); }}>Confirmer</Button>
        </div>
      </section>
    </div>
  );
}

// Remplace window.prompt : la saisie reste locale au composant, la validation métier reste à la charge de l'appelant.
// Le composant interne n'existe dans l'arbre que pendant qu'une demande est active, ce qui réinitialise
// naturellement sa saisie à chaque ouverture sans dépendre d'un effet.
export function PromptDialog({ request, onClose }: { request: PromptRequest | null; onClose: () => void }) {
  if (!request) return null;
  return <PromptDialogBody request={request} onClose={onClose} />;
}

function PromptDialogBody({ request, onClose }: { request: PromptRequest; onClose: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="detail-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-dialog-title">
        <p id="prompt-dialog-title">{request.message}</p>
        <Field
          label=""
          type={request.inputType ?? "text"}
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="form-actions">
          <Button variant="quiet" type="button" onClick={onClose}>Annuler</Button>
          <Button type="button" onClick={() => { const { onSubmit } = request; const submitted = value; onClose(); onSubmit(submitted); }}>Confirmer</Button>
        </div>
      </section>
    </div>
  );
}
