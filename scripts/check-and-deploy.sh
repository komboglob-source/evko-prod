#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${DEPLOY_BRANCH:-main}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-${ROOT_DIR}/.autodeploy.lock}"

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"

if ! flock -n 9; then
  echo "[evko] autodeploy is already running"
  exit 0
fi

cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[evko] ${ROOT_DIR} is not a git repository" >&2
  exit 1
fi

git fetch origin "$BRANCH" --prune

current_commit="$(git rev-parse HEAD)"
remote_commit="$(git rev-parse "origin/${BRANCH}")"

if [[ "$current_commit" == "$remote_commit" ]]; then
  echo "[evko] no updates for ${BRANCH}"
  exit 0
fi

echo "[evko] new commit detected: ${current_commit} -> ${remote_commit}"
/bin/bash "${ROOT_DIR}/scripts/deploy.sh"
