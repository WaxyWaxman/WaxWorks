import type { ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
  wide,
  foot,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  foot?: ReactNode;
}) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className={"modal" + (wide ? " wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}
