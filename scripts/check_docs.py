#!/usr/bin/env python3
"""Mechanical consistency checks for the Wax Works specification documents.

Deterministic subset of `/spec-audit` -- the checks that have one right answer and
need no judgement, so they can gate a pull request without an LLM in the loop.
The judgement calls (contradictions, unpropagated commitments, status honesty)
stay with `/spec-audit`.

    python scripts/check_docs.py

Only the repository's own tracked markdown is linted -- never a stray worktree
checkout or other untracked tree that happens to sit under the repo root.

Exit code 1 if any ERROR is found; warnings do not fail the build.
"""

from __future__ import annotations

import os
import re
import subprocess
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


IGNORED_DIRS = {".git", "node_modules", "dist", ".vite"}
IGNORED_PREFIXES = (".claude/worktrees/",)


def tracked_markdown() -> list[str] | None:
    """Markdown files git knows about, or None if git cannot answer.

    The index is the definition of "the repo's own documents". Anything
    untracked or ignored -- notably the stray worktree checkouts under
    .claude/worktrees/, each carrying its own copy of docs/ -- is not ours to
    lint, and linting it made the gate fail for reasons unrelated to the
    change under review.
    """
    try:
        out = subprocess.run(
            ["git", "-C", ROOT, "ls-files", "-z", "--", "*.md"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=True,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    paths = [
        os.path.join(ROOT, entry.replace("/", os.sep))
        for entry in out.decode("utf-8").split("\0")
        if entry
    ]
    # A tracked-but-deleted file is a different problem; skip rather than crash.
    return sorted(p for p in paths if os.path.isfile(p))


def walked_markdown() -> list[str]:
    """Fallback for a tarball or a machine without git: walk, minus the strays."""
    found = []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [
            d
            for d in dirs
            if d not in IGNORED_DIRS
            and not rel(os.path.join(base, d)).startswith(IGNORED_PREFIXES)
            # a nested checkout or worktree carries its own .git file or dir
            and not os.path.exists(os.path.join(base, d, ".git"))
        ]
        found += [os.path.join(base, n) for n in files if n.endswith(".md")]
    return sorted(found)


def all_markdown() -> list[str]:
    tracked = tracked_markdown()
    return tracked if tracked else walked_markdown()


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
        self.struck = self._struck()

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


    def _struck(self) -> set[int]:
        """Decision numbers whose row is struck through -- i.e. superseded.

        The house rule is that a superseded decision stays in the table, struck
        in place, pointing at what replaced it, because citations of it are
        permanent addresses. That makes `~~` immediately after the number cell
        the one reliable machine-readable signal that a row no longer holds.

        An *amended* row is deliberately not struck: it still holds in part, and
        its prefix says which part. Those are left alone.
        """
        m = re.search(
            r"^##\s+Resolved decisions\s*$(.*?)(?=^##\s|\Z)",
            self.text,
            re.MULTILINE | re.DOTALL,
        )
        if not m:
            return set()
        out: set[int] = set()
        for line in m.group(1).splitlines():
            cell = re.match(r"^\|\s*(\d+)\s*\|\s*~~", line.strip())
            if cell:
                out.add(int(cell.group(1)))
        return out


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
# 4a. Short-form citations -- "M-07 d28", "[M-07](...) d28", and a bare "d28"
#     inside a flow, which means that flow's own decision.
#
# Check 4 above only matches the long form ("E-02 decision 8"). The documents
# overwhelmingly use the short form, so until now the form the repo actually
# writes was not validated at all -- not for staleness, not even for existence.
# --------------------------------------------------------------------------

# "[M-07](M-07-chart-of-accounts.md) d28" or "M-07 d28", optionally continued
# as a list or a range -- "d28, d29", "d28 and d29", "d28/d29", "d28-d30" --
# every member of which belongs to the same flow. check_coverage.py reads lists
# the same way, so a citation that counts as coverage there resolves here. A
# range is checked at its two ends; decision numbers are contiguous (check 3),
# so if both ends exist, everything between them does.
QUALIFIED_RE = re.compile(
    r"\[?([EM]-\d{2})\]?(?:\([^)]*\))?\s+d(\d+)\b"
    r"((?:\s*(?:,|/|&|and|to|[-\u2013\u2014])\s*d\d+\b)*)"
)
LIST_TAIL_RE = re.compile(r"d(\d+)\b")
# a bare "d28", once the qualified ones have been blanked out of the line
BARE_RE = re.compile(r"(?<![\w-])d(\d+)\b")


def short_citations(path: str, line: str) -> list[tuple[str, int]]:
    """Every (flow_id, decision) this line cites in short form."""
    found: list[tuple[str, int]] = []
    rest = line
    for m in QUALIFIED_RE.finditer(line):
        flow_id = m.group(1).upper()
        found.append((flow_id, int(m.group(2))))
        for tail in LIST_TAIL_RE.finditer(m.group(3)):
            found.append((flow_id, int(tail.group(1))))
        rest = rest.replace(m.group(0), " " * len(m.group(0)), 1)
    # A bare dN only means something inside a flow document, where it refers to
    # that flow's own table. Elsewhere -- the PRD, the architecture, a skill --
    # it is ambiguous and is left alone.
    own = FLOW_FILE_RE.match(os.path.basename(path))
    if own and os.path.dirname(path) == FLOW_DIR:
        for m in BARE_RE.finditer(rest):
            found.append((own.group(1), int(m.group(1))))
    return found


for path in MD_FILES:
    if rel(path).startswith((".claude/", "docs/templates/")):
        continue
    for lineno, line in enumerate(read(path).splitlines(), 1):
        for cited_id, cited_num in short_citations(path, line):
            target = flows.get(cited_id)
            if target is None:
                continue  # 4b and 5 already police unknown IDs and dead links
            if cited_num not in target.decisions:
                err(
                    f"{rel(path)}:{lineno}: cites '{cited_id} d{cited_num}', "
                    f"but {cited_id} has no decision {cited_num}"
                )


# --------------------------------------------------------------------------
# 4c. Citations of a SUPERSEDED decision (warning)
#
# The failure this exists for: a decision is struck mid-session and the text
# already citing it is never revisited. The number still resolves, so check 4
# passes, and the citation reads as current. Four of these appeared in one
# session on the M-08 branch, all from supersessions landing after the citing
# text was written.
#
# A warning rather than an error, because discussing a struck row on purpose is
# legitimate and common -- the superseding row says what it replaced, an
# amendment prefix names what fell. A line that shows it knows is left alone.
# --------------------------------------------------------------------------

# Process docs cite illustratively -- CLAUDE.md and CONTRIBUTING.md both use
# "E-02 decision 8" to show what a citation looks like, and that example going
# stale is not a defect. Their citations are still checked for EXISTENCE by 4a;
# only the staleness warning is suppressed, on the same grounds check 4 already
# skips .claude/ and docs/templates/.
ILLUSTRATIVE = ("CLAUDE.md", "CONTRIBUTING.md", "docs/README.md")

AWARE_RE = re.compile(
    r"~~|supersed|amend|retire|struck|reverse|replaced by|no longer|fell to|overtaken",
    re.IGNORECASE,
)

# Suppression is judged in a WINDOW around the citation, not across the whole
# line. A decision row here is one line and routinely runs past two thousand
# characters, so whole-line suppression lets a stale citation hide anywhere
# inside a row that mentions an amendment for its own separate reasons. That is
# not hypothetical: A-77 cited a struck M-08 d16 while saying "amended" about
# something else in the same row, and whole-line matching missed it.
AWARE_WINDOW = 140


def cites_knowingly(line: str, at: int) -> bool:
    return bool(AWARE_RE.search(line[max(0, at - AWARE_WINDOW) : at + AWARE_WINDOW]))


for path in MD_FILES:
    if rel(path).startswith((".claude/", "docs/templates/")) or rel(path) in ILLUSTRATIVE:
        continue
    for lineno, line in enumerate(read(path).splitlines(), 1):
        # A row that is ITSELF struck through is a historical record citing a
        # historical record -- a retired e2e-register row naming the decision it
        # used to hold, say. Nothing there needs to be current.
        if re.match(r"^\|\s*~~", line.strip()):
            continue
        seen: set[tuple[str, int]] = set()
        for pattern in (QUALIFIED_RE, CITATION_RE):
            for m in pattern.finditer(line):
                cited_id, cited_num = m.group(1).upper(), int(m.group(2))
                if (cited_id, cited_num) in seen:
                    continue
                seen.add((cited_id, cited_num))
                target = flows.get(cited_id)
                if not target or cited_num not in target.struck:
                    continue
                if cites_knowingly(line, m.start()):
                    continue  # this citation says it knows
                warn(
                    f"{rel(path)}:{lineno}: cites {cited_id} d{cited_num}, which is "
                    "struck through in its own table -- say what superseded it"
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

PLACEHOLDER_RE = re.compile(r"<[^>]+>")

for path in MD_FILES:
    base = os.path.dirname(path)
    for lineno, line in enumerate(read(path).splitlines(), 1):
        for target in LINK_RE.findall(line):
            target = target.strip()
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            if PLACEHOLDER_RE.search(target):
                continue  # `<file>.md` in a template -- a slot, not a link
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
