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
# 4b. A-n architecture decisions -- every citation resolves
# --------------------------------------------------------------------------

ARCH = os.path.join(ROOT, "docs", "architecture.md")
arch_ids: set[str] = set()
if os.path.exists(ARCH):
    for line in read(ARCH).splitlines():
        m = re.match(r"^\|\s*(A-\d+[a-z]?)\s*\|", line.strip())
        if m:
            arch_ids.add(m.group(1))
else:
    err("docs/architecture.md is missing")

if arch_ids:
    for path in MD_FILES:
        if rel(path) == "docs/architecture.md":
            continue
        for lineno, line in enumerate(read(path).splitlines(), 1):
            for cited in re.findall(r"(?<![\w-])(A-\d+[a-z]?)(?![\w-])", line):
                if cited not in arch_ids:
                    err(
                        f"{rel(path)}:{lineno}: cites {cited}, which is not a "
                        "decision in docs/architecture.md"
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
# 7. End-to-end register -- docs/qa/e2e-register.md
#
# The register is a table of claims about the tests. These are the claims with
# one right answer: row IDs are well-formed, contiguous, and append-only within
# a flow; each row names a flow that exists; statuses use the vocabulary; a row
# that says Automated names a spec file that exists. Whether a row asserts the
# right decision stays with /qa and the qa-reviewer.
# --------------------------------------------------------------------------

REGISTER = os.path.join(ROOT, "docs", "qa", "e2e-register.md")
REGISTER_STATUS = {"Planned", "Walked", "Automated", "Stale", "Blocked", "—", "-"}
REGISTER_ROW_RE = re.compile(r"^\|\s*(~~)?([EM]-\d{2})-T(\d+)(~~)?\s*\|(.*)$")

if not os.path.exists(REGISTER):
    warn("docs/qa/e2e-register.md is missing -- no end-to-end register")
else:
    rows_by_flow: dict[str, list[int]] = {}
    for lineno, line in enumerate(read(REGISTER).splitlines(), 1):
        m = REGISTER_ROW_RE.match(line.strip())
        if not m:
            continue
        struck_open, flow_id, num, struck_close, rest = m.groups()
        where = f"{rel(REGISTER)}:{lineno}"
        row_id = f"{flow_id}-T{num}"
        if flow_id not in flows:
            err(f"{where}: row {row_id} names {flow_id}, which is not a flow")
        rows_by_flow.setdefault(flow_id, []).append(int(num))
        cells = [c.strip() for c in rest.split("|")]
        # Scenario | Steps | Asserts | Needs | Prototype | Product | Spec | (trailing)
        if len(cells) < 7:
            err(f"{where}: row {row_id} has {len(cells)} cells; expected Scenario, Steps, Asserts, Needs, Prototype, Product, Spec")
            continue
        scenario, steps, asserts, needs, proto, product, spec = cells[:7]
        for target, status in (("Prototype", proto), ("Product", product)):
            if status.strip("`") not in REGISTER_STATUS:
                err(f"{where}: row {row_id} {target} status '{status}' is not Planned, Walked, Automated, Stale, Blocked, or an em dash")
        if "Automated" in (proto, product):
            if not spec:
                err(f"{where}: row {row_id} is Automated but names no Spec file")
            elif not os.path.exists(os.path.join(ROOT, spec.strip("`"))):
                err(f"{where}: row {row_id} is Automated but Spec {spec} does not exist")
        if not asserts or asserts.lower() in {"-", "—", "none"}:
            warn(f"{where}: row {row_id} asserts nothing -- a scenario with no decision behind it")
    for flow_id, nums in sorted(rows_by_flow.items()):
        expected = list(range(1, len(set(nums)) + 1))
        if sorted(set(nums)) != expected:
            err(
                f"{rel(REGISTER)}: {flow_id} rows must run T1..T{len(set(nums))} with no gaps "
                f"(append only, never renumber); found {sorted(set(nums))}"
            )
        if len(nums) != len(set(nums)):
            err(f"{rel(REGISTER)}: {flow_id} has a duplicated row number")
    for flow_id, flow in sorted(flows.items()):
        if flow.status == "Specified" and flow_id not in rows_by_flow:
            warn(f"{flow_id} is Specified but has no rows in docs/qa/e2e-register.md")


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
if os.path.exists(REGISTER):
    print("%d end-to-end register rows across %d flows" % (sum(len(v) for v in rows_by_flow.values()), len(rows_by_flow)))
print(f"{len(errors)} error(s), {len(warnings)} warning(s)")

sys.exit(1 if errors else 0)
