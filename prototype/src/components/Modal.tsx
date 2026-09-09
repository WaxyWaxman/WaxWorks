import type { ReactNode } from "react";
import { createPortal } from "react-dom";

// Portal to document.body — a modal is a fixed, full-viewport overlay
// regardless of where in the tree it's rendered from, so it may as well
// live there structurally too. This matters once a modal can be opened from
// inside a table row (Receiving's inline line editor): appending a <div>
// under <tbody> is invalid HTML that some tooling warns about, and a portal
// sidesteps the question entirely rather than fighting DOM nesting rules.
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
  return createPortal(
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
    </div>,
    document.body,
  );
}
