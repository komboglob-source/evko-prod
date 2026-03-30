#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="${SERVICE_NAME:-evko-autodeploy}"
EVKO_DIR="${EVKO_DIR:-$ROOT_DIR}"
EVKO_USER="${EVKO_USER:-$(id -un)}"

service_source="${ROOT_DIR}/deploy/systemd/evko-autodeploy.service"
timer_source="${ROOT_DIR}/deploy/systemd/evko-autodeploy.timer"

service_target="/etc/systemd/system/${SERVICE_NAME}.service"
timer_target="/etc/systemd/system/${SERVICE_NAME}.timer"

tmp_service="$(mktemp)"
tmp_timer="$(mktemp)"
trap 'rm -f "$tmp_service" "$tmp_timer"' EXIT

sed \
  -e "s|__EVKO_DIR__|${EVKO_DIR}|g" \
  -e "s|__EVKO_USER__|${EVKO_USER}|g" \
  "$service_source" >"$tmp_service"

sed \
  -e "s|__EVKO_DIR__|${EVKO_DIR}|g" \
  -e "s|__EVKO_USER__|${EVKO_USER}|g" \
  "$timer_source" >"$tmp_timer"

sudo install -m 0644 "$tmp_service" "$service_target"
sudo install -m 0644 "$tmp_timer" "$timer_target"

sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}.timer"

echo "[evko] installed ${SERVICE_NAME}.timer for ${EVKO_DIR}"
sudo systemctl status "${SERVICE_NAME}.timer" --no-pager
