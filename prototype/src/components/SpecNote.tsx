import { useState, type ReactNode } from "react";

// A collapsible margin note tying a screen element back to the flow spec, so a
// reviewer can see which decision a piece of UI is exercising. (Available for
// screens that want inline citations; not every screen uses it.)
export function SpecNote({ cite, children }: { cite: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span>
      <button className="btn ghost sm" onClick={() => setOpen((o) => !o)} title="Show spec reference">
        📎 {cite}
      </button>
      {open && (
        <span className="callout small" style={{ display: "block", marginTop: 4 }}>
          {children}
        </span>
      )}
    </span>
  );
}
