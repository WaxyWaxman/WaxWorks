#!/usr/bin/env python3
"""PreToolUse hook for the `developer` subagent: refuse writes outside its lane.

The developer role builds code and tests for its track and fills in the Evidence
section of its own work order. It never edits a specification, a contract, the
end-to-end register, the agent configuration, or the check scripts -- those are
other roles' to write (docs/build/workflow.md section 1). This hook makes that a
refusal rather than a convention.

Claude Code passes the tool call as JSON on stdin. Exit 2 blocks the call and the
message on stderr is shown to the model; exit 0 allows it. It is a guard against
the obvious, not a sandbox: a determined Bash command can get around it, which is
why the reviewers also diff the pull request against the same lanes.
"""

from __future__ import annotations

import json
import os
import re
import sys

# Paths the developer never writes. Matched as prefixes of the repo-relative path.
PROTECTED = (
    "docs/flows/",
    "docs/architecture.md",
    "docs/PRD.md",
    "docs/lexicon.md",
    "docs/README.md",
    "docs/prototype.md",
    "docs/qa/",
    "docs/reference/",
    "docs/templates/",
    "docs/build/workflow.md",
    "docs/build/status.md",
    "packages/contracts/",
    ".claude/",
    ".github/",
    "scripts/check_docs.py",
    "scripts/check_coverage.py",
    "scripts/hooks/",
    "CLAUDE.md",
    "CONTRIBUTING.md",
)

# The one place under docs/ the developer does write: its own work order.
ALLOWED_UNDER_PROTECTED = ("docs/build/orders/",)

# Bash commands that write, when they mention a protected path.
WRITE_SHAPED = re.compile(
    r"(>{1,2}|\btee\b|\bsed\s+-i|\bmv\b|\bcp\b|\brm\b|\btouch\b|\btruncate\b"
    r"|\bgit\s+(checkout|restore|rm|mv)\b|\bpython\s+-\b|\bnode\s+-e\b)"
)

# Bash commands the developer never runs, regardless of path.
FORBIDDEN_COMMANDS = re.compile(
    r"\bgit\s+(push|merge|rebase|reset\s+--hard|commit\s+--amend)\b|\bgh\s+pr\s+(merge|create)\b"
)


def repo_relative(path: str, cwd: str) -> str:
    path = os.path.normpath(os.path.join(cwd, path) if not os.path.isabs(path) else path)
    root = cwd
    # The worktree root is the nearest ancestor of cwd that holds a .git entry.
    probe = cwd
    while probe and probe != os.path.dirname(probe):
        if os.path.exists(os.path.join(probe, ".git")):
            root = probe
            break
        probe = os.path.dirname(probe)
    try:
        rel = os.path.relpath(path, root)
    except ValueError:  # different drive on Windows
        rel = path
    return rel.replace(os.sep, "/")


def is_protected(rel: str) -> bool:
    if any(rel.startswith(a) for a in ALLOWED_UNDER_PROTECTED):
        return False
    return any(rel == p.rstrip("/") or rel.startswith(p) for p in PROTECTED)


def refuse(msg: str) -> None:
    sys.stderr.write(
        f"developer lane: {msg}\n"
        "This path belongs to another role (docs/build/workflow.md section 1). "
        "A spec problem is an open question filed in the work order; a contract "
        "change is a pull request both humans review. Do not route around this.\n"
    )
    sys.exit(2)


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)  # not our shape; never block on a parse failure
    tool = payload.get("tool_name", "")
    tool_input = payload.get("tool_input") or {}
    cwd = payload.get("cwd") or os.getcwd()

    if tool in {"Edit", "Write", "MultiEdit", "NotebookEdit"}:
        target = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
        if target:
            rel = repo_relative(target, cwd)
            if is_protected(rel):
                refuse(f"refusing to write {rel}")
        sys.exit(0)

    if tool == "Bash":
        command = tool_input.get("command") or ""
        if FORBIDDEN_COMMANDS.search(command):
            refuse("refusing a git push / merge / rebase / hard reset / amend, or gh pr merge / create -- a human merges, the coordinator opens")
        if WRITE_SHAPED.search(command):
            for p in PROTECTED:
                if p in command and not any(a in command for a in ALLOWED_UNDER_PROTECTED):
                    refuse(f"refusing a write-shaped command naming {p}")
        sys.exit(0)

    sys.exit(0)


if __name__ == "__main__":
    main()
