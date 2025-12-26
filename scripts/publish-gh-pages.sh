#!/usr/bin/env bash
set -euo pipefail

# Publishes `frontend/public` to the `gh-pages` branch on both GitHub and GitLab.

ROOT="$(pwd)"
FRONTEND_PUBLIC="$ROOT/frontend/public"
PUBLISH_BRANCH="gh-pages"
WORKTREE_DIR="$ROOT/.gh-pages"

if [[ ! -d "$FRONTEND_PUBLIC" ]]; then
  echo "frontend/public does not exist" >&2
  exit 1
fi

if [[ -z "${GITLAB_TOKEN:-}" ]]; then
  echo "GITLAB_TOKEN is required" >&2
  exit 1
fi

REMOTE_NAME="gitlab"
REMOTE_URL="https://oauth2:${GITLAB_TOKEN}@gitlab.com/khan.sahil99133/Signupdemo1.git"

if ! git rev-parse --verify "$PUBLISH_BRANCH" >/dev/null 2>&1; then
  git checkout --orphan "$PUBLISH_BRANCH"
  git reset --hard
  git commit --allow-empty -m "Initialize gh-pages"
  git push origin "$PUBLISH_BRANCH"
  git checkout -
fi

if ! git remote | grep -q "^${REMOTE_NAME}$"; then
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

# Prepare the worktree
rm -rf "$WORKTREE_DIR"
git worktree prune
git worktree add "$WORKTREE_DIR" "$PUBLISH_BRANCH"

rsync -a --delete "$FRONTEND_PUBLIC/" "$WORKTREE_DIR/"

pushd "$WORKTREE_DIR" >/dev/null
git add -A
if ! git diff --cached --quiet; then
  git commit -m "Publish frontend at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
else
  echo "No changes to publish"
fi
git push origin "$PUBLISH_BRANCH" --force
git push "$REMOTE_NAME" "$PUBLISH_BRANCH" --force
popd >/dev/null

# Clean up to keep working tree tidy
git worktree remove "$WORKTREE_DIR"
