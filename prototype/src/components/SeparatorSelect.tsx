import { useState } from "react";

// Shared wherever a Supplier's ordering separator (M-02 decision 3) is
// picked or changed: raising a pending line (Phase 1), Order Processing's
// pending table (mass-shifts a whole stream), and View's per-line dropdown.
// Just supplies a current value, the separators already in use elsewhere for
// this Supplier, and what to do with a change — callers decide whether that
// change needs a merge confirmation first. "+ New…" swaps in a one-letter
// text field for a separator nothing is using yet.
export function SeparatorSelect({
  value,
  knownSeparators,
  onChange,
}: {
  value: string; // "" = no separator
  knownSeparators: string[]; // excludes ""
  onChange: (next: string | undefined) => void;
}) {
  const [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState("");

  if (addingNew) {
    const submit = () => {
      if (draft.trim()) onChange(draft.trim());
      setAddingNew(false);
      setDraft("");
    };
    return (
      <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
        <input
          className="inline-num"
          style={{ width: 40 }}
          maxLength={1}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") {
              setAddingNew(false);
              setDraft("");
            }
          }}
        />
        <button className="btn ghost sm" onClick={submit} title="Confirm new separator">
          ✓
        </button>
        <button
          className="btn ghost sm"
          onClick={() => {
            setAddingNew(false);
            setDraft("");
          }}
          title="Cancel"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          setAddingNew(true);
          return;
        }
        onChange(e.target.value || undefined);
      }}
    >
      <option value="">(none)</option>
      {knownSeparators.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
      <option value="__new__">+ New…</option>
    </select>
  );
}
