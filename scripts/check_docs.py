#!/usr/bin/env python3
"""Mechanical consistency checks for the Wax Works specification documents.

Deterministic subset of `/spec-audit` -- the checks that have one right answer and
need no judgement, so they can gate a pull request without an LLM in the loop.
The judgement calls (contradictions, unpropagated commitments, status honesty)
stay with `/spec-audit`.

    python scripts/check_docs.py

Exit code 1 if any ERROR is found; warnings do not fail the build.
"""

from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLOW_DIR = os.path.join(ROOT, "docs", "flows")
DOCS_INDEX = os.path.join(ROOT, "docs", "README.md")
PRD = os.path.join(ROOT, "docs", "PRD.md")

VALID_STATUS = {"Stub", "In clarification", "Specified"}
FLOW_FILE_RE = re.compile(r"^([EM]-\d{2})-[a-z0-9-]+\.md$")
CITATION_RE = re.compile(r"\b([EM]-\d{2})\s+decision\s+(\d+)", re.IGNORECASE)
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
STATUS_LINE_RE = re.compile(r"^\*\*Status:\*\*\s*(.+)$", re.MULTILINE)
RELATED_LINE_RE = re.compile(r"^\*\*Related:\*\*\s*(.+)$", re.MULTILINE)

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def read(path: str) -> str:
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def rel(path: str) -> str:
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def norm_status(raw: str) -> str:
    """'Stub -- awaiting flow' and '**Specified**' both reduce to the bare value."""
    value = raw.strip().strip("*").strip()
    return re.split(r"\s+[-—–]+\s+", value)[0].strip()


def all_markdown() -> list[str]:
    found = []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in {".git", "node_modules"}]
        found += [os.path.join(base, n) for n in files if n.endswith(".md")]
    return sorted(found)


# --------------------------------------------------------------------------
# Load the flow documents
# --------------------------------------------------------------------------


class Flow:
    def __init__(self, flow_id: str, path: str, text: str) -> None:
        self.id = flow_id
        self.path = path
        self.text = text
        self.status = self._status()
        self.decisions = self._decisions()

    def _status(self) -> str | None:
        m = STATUS_LINE_RE.search(self.text)
        if not m:
            err(f"{rel(self.path)}: no '**Status:**' line")
            return None
        status = norm_status(m.group(1))
        if status not in VALID_STATUS:
            err(
                f"{rel(self.path)}: status {status!r} is not one of "
                + ", ".join(sorted(VALID_STATUS))
            )
        return status

    def _decisions(self) -> list[int]:
        m = re.search(
            r"^##\s+Resolved decisions\s*$(.*?)(?=^##\s|\Z)",
            self.text,
            re.MULTILINE | re.DOTALL,
        )
        if not m:
            return []
        numbers: list[int] = []
        for line in m.group(1).splitlines():
            cell = re.match(r"^\|\s*(\d+)\s*\|", line.strip())
            if cell:
                numbers.append(int(cell.group(1)))
        return numbers


flows: dict[str, Flow] = {}

if not os.path.isdir(FLOW_DIR):
    err("docs/flows/ is missing")
else:
    for name in sorted(os.listdir(FLOW_DIR)):
        if not name.endswith(".md"):
            continue
        m = FLOW_FILE_RE.match(name)
        if not m:
            err(
                f"docs/flows/{name}: filename must be <ID>-<kebab-slug>.md, "
                "e.g. E-05-sell-a-record.md"
            )
            continue
        path = os.path.join(FLOW_DIR, name)
        flow = Flow(m.group(1), path, read(path))
        if flow.id in flows:
            err(f"duplicate flow ID {flow.id}")
        flows[flow.id] = flow


# --------------------------------------------------------------------------
# 1. Index tables -- every flow has a row, every row has a flow
# --------------------------------------------------------------------------


def index_rows(path: str) -> dict[str, str]:
    """Map flow ID -> status, for table rows that link into flows/."""
    rows: dict[str, str] = {}
    for line in read(path).splitlines():
        line = line.strip()
        if not line.startswith("|") or "flows/" not in line:
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 2 or not re.fullmatch(r"[EM]-\d{2}", cells[0]):
            continue
        rows[cells[0]] = norm_status(cells[-1])
    return rows


indexes: dict[str, dict[str, str]] = {}
for path in (DOCS_INDEX, PRD):
    if os.path.exists(path):
        indexes[rel(path)] = index_rows(path)
    else:
        err(f"{rel(path)} is missing")

for label, rows in indexes.items():
    for flow_id in flows:
        if flow_id not in rows:
            err(f"{label}: no index row for {flow_id}")
    for flow_id in rows:
        if flow_id not in flows:
            err(f"{label}: index row for {flow_id}, but no such file in docs/flows/")


# --------------------------------------------------------------------------
# 2. Status coherence -- the flow file and both index tables must agree
# --------------------------------------------------------------------------

for flow_id, flow in sorted(flows.items()):
    if flow.status is None:
        continue
    for label, rows in indexes.items():
        listed = rows.get(flow_id)
        if listed is not None and listed != flow.status:
            err(
                f"{flow_id}: status drift -- {rel(flow.path)} says {flow.status!r}, "
                f"{label} says {listed!r}"
            )


# --------------------------------------------------------------------------
# 3. Decision numbering -- contiguous from 1, never reused
# --------------------------------------------------------------------------

for flow_id, flow in sorted(flows.items()):
    nums = flow.decisions
    if not nums:
        continue
    dupes = sorted({n for n in nums if nums.count(n) > 1})
    if dupes:
        err(f"{flow_id}: decision number(s) reused: {dupes}")
    if sorted(set(nums)) != list(range(1, len(set(nums)) + 1)):
        err(
            f"{flow_id}: decision numbers must run 1..{len(set(nums))} with no gaps "
            f"(append only, never renumber); found {sorted(set(nums))}"
        )


# --------------------------------------------------------------------------
# 4. Citations -- "E-02 decision 8" must resolve
# --------------------------------------------------------------------------

MD_FILES = all_markdown()

for path in MD_FILES:
    if rel(path).startswith((".claude/", "docs/templates/")):
        continue  # skills and templates cite illustratively
    for lineno, line in enumerate(read(path).splitlines(), 1):
        for cited_id, cited_num in CITATION_RE.findall(line):
            cited_id = cited_id.upper()
            target = flows.get(cited_id)
            if target is None:
                err(f"{rel(path)}:{lineno}: cites {cited_id}, which does not exist")
            elif int(cited_num) not in target.decisions:
                err(
                    f"{rel(path)}:{lineno}: cites '{cited_id} decision {cited_num}', "
                    f"but {cited_id} has no decision {cited_num}"
                )


# --------------------------------------------------------------------------
# 5. Relative links resolve
# --------------------------------------------------------------------------

for path in MD_FILES:
    if rel(path).startswith("docs/templates/"):
        continue  # placeholder targets are intentional
    base = os.path.dirname(path)
    for lineno, line in enumerate(read(path).splitlines(), 1):
        for target in LINK_RE.findall(line):
            target = target.strip()
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            target = target.split("#")[0]
            if not target:
                continue
            if not os.path.exists(os.path.normpath(os.path.join(base, target))):
                err(f"{rel(path)}:{lineno}: dead link -> {target}")


# --------------------------------------------------------------------------
# 6. Related: lines are reciprocal (warning -- occasionally one-way on purpose)
# --------------------------------------------------------------------------

for flow_id, flow in sorted(flows.items()):
    m = RELATED_LINE_RE.search(flow.text)
    if not m:
        continue
    # dedupe: a markdown link repeats the ID in both its label and its filename
    for other in sorted(set(re.findall(r"\b([EM]-\d{2})\b", m.group(1)))):
        target = flows.get(other)
        if target is None:
            err(f"{flow_id}: Related: names {other}, which does not exist")
            continue
        back = RELATED_LINE_RE.search(target.text)
        if not back or flow_id not in back.group(1):
            warn(f"{flow_id} relates {other}, but {other} does not relate {flow_id} back")


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------

by_status: dict[str, int] = {}
for f in flows.values():
    key = f.status or "?"
    by_status[key] = by_status.get(key, 0) + 1
tbd_total = sum(f.text.count("_TBD_") for f in flows.values())

for w in warnings:
    print(f"WARN  {w}")
for e in errors:
    print(f"ERROR {e}")

print()
print(
    "%d flows: %s"
    % (len(flows), ", ".join(f"{n} {s}" for s, n in sorted(by_status.items())) or "none")
)
print(f"{tbd_total} _TBD_ markers outstanding")
print(f"{len(errors)} error(s), {len(warnings)} warning(s)")

sys.exit(1 if errors else 0)
