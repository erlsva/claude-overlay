/** Small building blocks shared by the Studio tabs. */

import { Plus, Play, Pencil, Trash2 } from "lucide-react";

// Colour, border and radius come from the shared `.studio-panel` field rules.
export const fieldStyle = {
  width: "100%",
  height: 34,
  boxSizing: "border-box" as const,
  padding: "0 12px",
  fontSize: 13,
};

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="studio-section">
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </section>
  );
}

export function CreateRow({
  name,
  setName,
  placeholder,
  onCreate,
  label,
  disabled,
}: {
  name: string;
  setName: (v: string) => void;
  placeholder: string;
  onCreate: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <>
      <input
        style={fieldStyle}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onCreate()}
        placeholder={placeholder}
        maxLength={60}
      />
      <button className="ui-button studio-primary" onClick={onCreate} disabled={disabled}>
        <Plus size={14} />
        {label}
      </button>
    </>
  );
}

export function Item({
  name,
  detail,
  onPrimary,
  primary,
  onDelete,
  onEdit,
  onTest,
  leading,
  active,
}: {
  name: string;
  detail: string;
  onPrimary: () => void;
  primary: string;
  onDelete: () => void;
  onEdit?: () => void;
  onTest?: () => void;
  leading?: React.ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={`studio-item${active === false ? " studio-item--off" : ""}${leading ? " studio-item--icon" : ""}`}
    >
      {leading && (
        <span className="studio-item__icon" aria-hidden="true">
          {leading}
        </span>
      )}
      <div className="studio-item__body">
        <strong>{name}</strong>
        <small>{detail}</small>
      </div>
      <div className="studio-item__actions">
        {onTest && (
          <button
            className="ui-icon-button ui-button--compact ui-icon-button--ghost"
            onClick={onTest}
            title={`Run ${name} now as a test`}
            aria-label={`Run ${name} now as a test`}
          >
            <Play size={14} />
          </button>
        )}
        {onEdit && (
          <button
            className="ui-icon-button ui-button--compact ui-icon-button--ghost"
            onClick={onEdit}
            title={`Edit ${name}`}
            aria-label={`Edit ${name}`}
          >
            <Pencil size={14} />
          </button>
        )}
        {active === undefined ? (
          <button
            className="ui-button ui-button--compact"
            onClick={onPrimary}
            title={`${primary} ${name}`}
          >
            {primary === "Play" ? <Play size={12} /> : primary}
          </button>
        ) : (
          <button
            type="button"
            className="ui-switch"
            onClick={onPrimary}
            role="switch"
            aria-checked={active}
            aria-label={`${name} is ${active ? "enabled" : "disabled"}`}
            title={`${active ? "Disable" : "Enable"} ${name}`}
          />
        )}
        <button
          className="ui-icon-button ui-button--compact ui-icon-button--ghost ui-icon-button--danger"
          onClick={onDelete}
          title={`Delete ${name}`}
          aria-label={`Delete ${name}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
