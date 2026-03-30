#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${DEPLOY_BRANCH:-main}"

export GIT_TERMINAL_PROMPT=0

cd "$ROOT_DIR"

echo "[evko] deploying branch ${BRANCH} from ${ROOT_DIR}"

git fetch origin "$BRANCH" --prune

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  git checkout "$BRANCH"
else
  git checkout -b "$BRANCH" "origin/$BRANCH"
fi

git reset --hard "origin/$BRANCH"
git clean -fd

git submodule sync --recursive
git submodule update --init --recursive --force

sudo -n docker compose up -d --build --remove-orphans
sudo -n docker image prune -f >/dev/null 2>&1 || true

echo "[evko] deploy completed"
