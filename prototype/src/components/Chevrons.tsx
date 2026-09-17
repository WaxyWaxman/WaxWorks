// The slab's open/close pair, in one place.
//
// Every track-1 slab retracts to a 52px strip, and the strip has to promise
// one thing above all: that it opens back up. A magnifier does not say that —
// it says "search", which is a different errand and happens to be inside.
// Receiving had this right first (its strip comment made the distinction:
// search "opens it to DO something", the chevron "just gives the width
// back"); Find, Customers, Suppliers and On Order have been brought onto it.
//
// Lifted out of ReceiveSlab and TillRail, which carried identical private
// copies. Six call sites is four too many to keep duplicating.

const ICON = {
  width: 19,
  height: 19,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
} as const;

export const ChevronRight = () => (
  <svg {...ICON} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const ChevronLeft = () => (
  <svg {...ICON} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
