import { useState } from "react";

// Sample codes surfaced as chips so a reviewer can "scan" without a scanner.
const SAMPLES: { code: string; label: string }[] = [
  { code: "081227971609", label: "UPC · Blue (3 grades → picker)" },
  { code: "075992751612", label: "UPC · Rumours (New, 2 sellable)" },
  { code: "888751545519", label: "UPC · Kind of Blue (1 copy)" },
  { code: "075992511018", label: "UPC · Purple Rain (below min)" },
  { code: "200000001243", label: "Internal · Blue VG+ copy" },
  { code: "200000005235", label: "Internal · Illmatic (backroom)" },
  { code: "GC-4417", label: "Gift card · $25 balance" },
  { code: "GC-8890", label: "Gift card · not yet loaded" },
  { code: "FREIGHT", label: "Non-tracked · price prompt" },
  { code: "889854250515", label: "UPC · Illmatic (0 on floor)" },
];

export function BarcodeInput({
  onScan,
  placeholder = "Scan or type a barcode…",
}: {
  onScan: (code: string) => void;
  placeholder?: string;
}) {
  const [v, setV] = useState("");
  const submit = () => {
    if (!v.trim()) return;
    onScan(v.trim());
    setV("");
  };
  return (
    <div className="stack">
      <div className="row">
        <input
          type="text"
          value={v}
          placeholder={placeholder}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn primary" onClick={submit}>
          Scan
        </button>
      </div>
      <div className="row wrap xsmall">
        <span className="muted">Quick scan:</span>
        {SAMPLES.map((s) => (
          <button
            key={s.code}
            className="btn sm"
            title={s.code}
            onClick={() => onScan(s.code)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
