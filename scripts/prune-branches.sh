#!/usr/bin/env bash
#
# Delete the branches whose PR has already been squash-merged, locally and on
# the remote, plus any stale worktree registrations.
#
# Squash-merging is why this script has to exist: the merge commit on main is a
# NEW commit, so the branch that produced it never becomes an ancestor of main.
# `git branch --merged main` therefore reports almost every dead branch as
# unmerged and is useless here. The only reliable "this work is in main" signal
# is the PR state, which is what this reads.
#
# Dry run by default. Pass --apply to actually delete.
#
#   ./scripts/prune-branches.sh           # show what would go
#   ./scripts/prune-branches.sh --apply   # delete it
#
set -euo pipefail

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

cd "$(git rev-parse --show-toplevel)"

echo "Fetching…"
git fetch --prune --quiet

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Every branch that has a MERGED pull request behind it. Anything not in this
# list is left alone — an open PR, a closed-unmerged PR, or a branch that was
# never PR'd at all is work this script has no business deleting.
gh pr list --state merged --limit 2000 --json headRefName \
  --jq '.[].headRefName' | sort -u > "$TMP/merged"

# Branches that are currently checked out in a worktree can't be deleted, and
# shouldn't be — that's live work.
git worktree list --porcelain \
  | awk '/^branch /{sub("refs/heads/","",$2); print $2}' | sort -u > "$TMP/checkedout"

printf 'main\n' >> "$TMP/checkedout"
sort -u -o "$TMP/checkedout" "$TMP/checkedout"

git for-each-ref --format='%(refname:short)' refs/heads | sort -u > "$TMP/local"
# %(refname:short) is not usable here: git shortens refs/remotes/origin/HEAD to
# the bare string "origin", which then survives every filter as a phantom branch.
git for-each-ref --format='%(refname)' refs/remotes/origin \
  | sed 's#^refs/remotes/origin/##' | grep -v '^HEAD$' | sort -u > "$TMP/remote"

comm -12 "$TMP/local"  "$TMP/merged" | comm -23 - "$TMP/checkedout" > "$TMP/kill-local"
comm -12 "$TMP/remote" "$TMP/merged" | comm -23 - "$TMP/checkedout" > "$TMP/kill-remote"

# Everything left over, reported so it never silently accumulates again.
comm -23 "$TMP/remote" "$TMP/merged" > "$TMP/keep-remote"

echo
echo "local branches:         $(wc -l < "$TMP/local"  | tr -d ' ')  → deleting $(wc -l < "$TMP/kill-local"  | tr -d ' ')"
echo "remote branches:        $(wc -l < "$TMP/remote" | tr -d ' ')  → deleting $(wc -l < "$TMP/kill-remote" | tr -d ' ')"
echo "remote branches kept:   $(wc -l < "$TMP/keep-remote" | tr -d ' ')  (no merged PR — open, closed, or never PR'd)"
echo

if [ "$APPLY" -eq 0 ]; then
  echo "Dry run. Branches that would be kept on the remote:"
  sed 's/^/  /' "$TMP/keep-remote" | head -40
  [ "$(wc -l < "$TMP/keep-remote")" -gt 40 ] && echo "  …"
  echo
  echo "Re-run with --apply to delete."
  exit 0
fi

if [ -s "$TMP/kill-local" ]; then
  echo "Deleting local branches…"
  # -D, not -d: see the squash-merge note above — git cannot tell these are merged.
  xargs -n 50 git branch -D < "$TMP/kill-local" > /dev/null
fi

if [ -s "$TMP/kill-remote" ]; then
  echo "Deleting remote branches (in batches)…"
  xargs -n 40 git push --quiet origin --delete < "$TMP/kill-remote"
fi

echo "Pruning stale worktree registrations…"
git worktree prune -v

echo
echo "Done. $(git for-each-ref --format='%(refname:short)' refs/heads | wc -l | tr -d ' ') local, $(git for-each-ref --format='%(refname:short)' refs/remotes/origin | wc -l | tr -d ' ') remote branches remain."
