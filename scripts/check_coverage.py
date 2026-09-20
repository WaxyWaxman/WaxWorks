#!/usr/bin/env python3
"""Decision-to-test traceability for Wax Works.

Line coverage says code ran; this says whether each numbered decision has a test
named for it. A test cites a decision the way the documents do -- ``E-05 d23``,
``E-05 decision 23``, ``M-05 d27, d28``, or a bare ``A-47`` -- anywhere in a test
file, which in practice means the ``describe`` / ``it`` title or a comment on the
assertion. That is the convention the prototype's suites already follow.

    python scripts/check_coverage.py                 # report every Specified flow
    python scripts/check_coverage.py --flow E-05     # one flow
    python scripts/check_coverage.py --strict        # exit 1 on any uncovered decision
    python scripts/check_coverage.py --order docs/build/orders/E-05-U-M4.md

``--order`` is the build gate (docs/build/workflow.md section 3, gate 1): every
Checklist row of the work order must be accounted for -- a ``Done`` with a test
found in the tree, or an explicit ``Deferred`` / ``Blocked`` / ``N/A`` in its
Evidence row. A blank Evidence cell, a missing Evidence row, or a ``Done`` with no
test citing the decision fails with exit 1.

Superseded decisions (struck through in their table) are not expected to have
tests and are not reported.
"""

from __future__ import annotations

import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLOW_DIR = os.path.join(ROOT, "docs", "flows")
ARCH = os.path.join(ROOT, "docs", "architecture.md")

IGNORED_DIRS = {".git", "node_modules", "dist", ".vite", "worktrees", "test-results", "playwright-report"}
TEST_FILE_RE = re.compile(r"\.(test|spec)\.[cm]?[jt]sx?$")
PGTAP_DIR = os.path.join("supabase", "tests")

FLOW_FILE_RE = re.compile(r"^([EMOS]-\d{2})-[a-z0-9-]+\.md$")
STATUS_RE = re.compile(r"^\*\*Status:\*\*\s*(.+)$", re.MULTILINE)
# A decision row: "| 12 | text" -- struck rows begin their text with ~~
DECISION_ROW_RE = re.compile(r"^\|\s*(\d+)\s*\|\s*(~~)?", re.MULTILINE)
ARCH_ROW_RE = re.compile(r"^\|\s*(A-\d+[a-z]?)\s*\|\s*(~~)?", re.MULTILINE)

# "E-05 d23", "E-05 decision 23", followed by any number of ", d24" / "/d25" / " and d26"
FLOW_CITE_RE = re.compile(
    r"\b([EMOS]-\d{2})\s+(?:decision\s+|d)(\d+)((?:\s*(?:,|/|&|and)\s*(?:decision\s+|d)?\d+)*)",
    re.IGNORECASE,
)
FLOW_CITE_TAIL_RE = re.compile(r"(?:decision\s+|d)?(\d+)", re.IGNORECASE)
ARCH_CITE_RE = re.compile(r"(?<![\w-])(A-\d+[a-z]?)(?![\w-])")


def read(path: str) -> str:
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def rel(path: str) -> str:
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


# --------------------------------------------------------------------------
# What is decided
# --------------------------------------------------------------------------


def live_flow_decisions() -> dict[str, tuple[str, set[int]]]:
    """flow id -> (status, live decision numbers). Struck rows are excluded."""
    out: dict[str, tuple[str, set[int]]] = {}
    if not os.path.isdir(FLOW_DIR):
        return out
    for name in sorted(os.listdir(FLOW_DIR)):
        m = FLOW_FILE_RE.match(name)
        if not m:
            continue
        text = read(os.path.join(FLOW_DIR, name))
        sm = STATUS_RE.search(text)
        status = sm.group(1).strip().strip("*").split(" — ")[0].split(" -- ")[0].strip() if sm else "?"
        sec = re.search(r"^##\s+Resolved decisions\s*$(.*?)(?=^##\s|\Z)", text, re.MULTILINE | re.DOTALL)
        live: set[int] = set()
        if sec:
            for num, struck in DECISION_ROW_RE.findall(sec.group(1)):
                if not struck:
                    live.add(int(num))
        out[m.group(1)] = (status, live)
    return out


def live_arch_decisions() -> set[str]:
    if not os.path.exists(ARCH):
        return set()
    return {aid for aid, struck in ARCH_ROW_RE.findall(read(ARCH)) if not struck}


# --------------------------------------------------------------------------
# What is tested
# --------------------------------------------------------------------------


def test_files() -> list[str]:
    found: list[str] = []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not os.path.exists(os.path.join(base, d, ".git"))]
        for n in files:
            path = os.path.join(base, n)
            r = rel(path)
            if TEST_FILE_RE.search(n) or (r.startswith(PGTAP_DIR.replace(os.sep, "/")) and n.endswith(".sql")):
                found.append(path)
    return sorted(found)


def citations_in(path: str) -> tuple[set[tuple[str, int]], set[str]]:
    text = read(path)
    flow_cites: set[tuple[str, int]] = set()
    for fid, first, tail in FLOW_CITE_RE.findall(text):
        fid = fid.upper()
        flow_cites.add((fid, int(first)))
        for n in FLOW_CITE_TAIL_RE.findall(tail):
            flow_cites.add((fid, int(n)))
    arch_cites = set(ARCH_CITE_RE.findall(text))
    return flow_cites, arch_cites


def coverage_index(files: list[str]) -> tuple[dict[tuple[str, int], list[str]], dict[str, list[str]]]:
    by_flow: dict[tuple[str, int], list[str]] = {}
    by_arch: dict[str, list[str]] = {}
    for f in files:
        fc, ac = citations_in(f)
        for key in fc:
            by_flow.setdefault(key, []).append(rel(f))
        for aid in ac:
            by_arch.setdefault(aid, []).append(rel(f))
    return by_flow, by_arch


# --------------------------------------------------------------------------
# Report mode
# --------------------------------------------------------------------------


def report(flow_filter: str | None, strict: bool) -> int:
    flows = live_flow_decisions()
    arch = live_arch_decisions()
    files = test_files()
    by_flow, by_arch = coverage_index(files)

    print(f"{len(files)} test file(s) scanned")
    uncovered_total = 0
    for fid, (status, live) in sorted(flows.items()):
        if flow_filter and fid != flow_filter.upper():
            continue
        if status != "Specified":
            continue
        covered = sorted(n for n in live if (fid, n) in by_flow)
        uncovered = sorted(n for n in live if (fid, n) not in by_flow)
        uncovered_total += len(uncovered)
        print(f"\n{fid}: {len(covered)}/{len(live)} live decisions have a test named for them")
        if uncovered:
            print("  uncovered: " + ", ".join(f"d{n}" for n in uncovered))
    if not flow_filter:
        a_cov = sorted(a for a in arch if a in by_arch)
        a_unc = sorted(a for a in arch if a not in by_arch)
        print(f"\nA-n: {len(a_cov)}/{len(arch)} live architecture decisions cited by a test")
        if a_unc:
            print("  uncovered: " + ", ".join(a_unc))
    print()
    if strict and uncovered_total:
        print(f"{uncovered_total} uncovered decision(s) -- failing under --strict")
        return 1
    return 0


# --------------------------------------------------------------------------
# Order mode -- the build gate
# --------------------------------------------------------------------------

STATES = {"Done", "Deferred", "Blocked", "N/A"}


def section(text: str, heading: str) -> str:
    m = re.search(rf"^##\s+{re.escape(heading)}\s*$(.*?)(?=^##\s|\Z)", text, re.MULTILINE | re.DOTALL)
    return m.group(1) if m else ""


def table_rows(block: str) -> list[list[str]]:
    rows = []
    for line in block.splitlines():
        line = line.strip()
        if not line.startswith("|") or re.match(r"^\|\s*-+", line) or re.match(r"^\|\s*#\s*\|", line):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        rows.append(cells)
    return rows


def check_order(path: str) -> int:
    text = read(path)
    errors: list[str] = []
    flows = live_flow_decisions()
    arch = live_arch_decisions()
    by_flow, by_arch = coverage_index(test_files())

    status = STATUS_RE.search(text)
    if not status or "Approved" not in status.group(1) and "In review" not in status.group(1) and "Accepted" not in status.group(1):
        errors.append("order is not Approved / In review / Accepted -- its checklist is not a fixed scope")

    checklist = {r[0]: r for r in table_rows(section(text, "Checklist")) if r and r[0].isdigit()}
    evidence = {r[0]: r for r in table_rows(section(text, "Evidence")) if r and r[0].isdigit()}
    if not checklist:
        errors.append("no Checklist rows found")

    for num, row in sorted(checklist.items(), key=lambda kv: int(kv[0])):
        decision_cell = row[1] if len(row) > 1 else ""
        cites: list[tuple[str, int] | str] = []
        for fid, first, tail in FLOW_CITE_RE.findall(decision_cell):
            cites.append((fid.upper(), int(first)))
            for n in FLOW_CITE_TAIL_RE.findall(tail):
                cites.append((fid.upper(), int(n)))
        cites += ARCH_CITE_RE.findall(decision_cell)
        if not cites:
            errors.append(f"checklist row {num}: names no decision ({decision_cell[:60]!r})")
            continue
        # the decision must exist and be live
        for c in cites:
            if isinstance(c, tuple):
                fid, n = c
                if fid not in flows:
                    errors.append(f"checklist row {num}: {fid} is not a flow")
                elif n not in flows[fid][1]:
                    errors.append(f"checklist row {num}: {fid} decision {n} is not a live decision (missing or superseded)")
            elif c not in arch:
                errors.append(f"checklist row {num}: {c} is not a live architecture decision")

        ev = evidence.get(num)
        state = (ev[1] if ev and len(ev) > 1 else "").strip("`* ")
        if not ev:
            errors.append(f"checklist row {num}: no Evidence row")
            continue
        if state not in STATES:
            errors.append(f"checklist row {num}: Evidence state {state!r} is not one of Done, Deferred, Blocked, N/A")
            continue
        if state == "Done":
            found = False
            for c in cites:
                if (isinstance(c, tuple) and c in by_flow) or (isinstance(c, str) and c in by_arch):
                    found = True
            if not found:
                errors.append(f"checklist row {num}: Done, but no test file cites {decision_cell[:50]!r}")
            output = ev[3] if len(ev) > 3 else ""
            if not output.strip():
                errors.append(f"checklist row {num}: Done, but the Run output cell is empty -- quote the run")
        elif state in {"Deferred", "Blocked"}:
            note = ev[4] if len(ev) > 4 else ""
            if not note.strip():
                errors.append(f"checklist row {num}: {state}, but no owner / open question recorded in Note")

    for num in evidence:
        if num not in checklist:
            errors.append(f"evidence row {num}: no matching Checklist row")

    for e in errors:
        print(f"ERROR {rel(path)}: {e}")
    accounted = len(checklist) - sum(1 for e in errors if e.startswith("checklist row"))
    print(f"\n{rel(path)}: {accounted}/{len(checklist)} checklist rows accounted for; {len(errors)} error(s)")
    return 1 if errors else 0


def main() -> int:
    try:  # em dashes in decision text; a Windows console may not be UTF-8
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--flow", help="report one flow, e.g. E-05")
    ap.add_argument("--strict", action="store_true", help="exit 1 on any uncovered live decision")
    ap.add_argument("--order", help="gate a work order: every checklist row must be accounted for")
    args = ap.parse_args()
    if args.order:
        return check_order(os.path.join(ROOT, args.order) if not os.path.isabs(args.order) else args.order)
    return report(args.flow, args.strict)


if __name__ == "__main__":
    sys.exit(main())
