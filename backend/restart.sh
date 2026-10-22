#!/usr/bin/env bash
# Check migrations, apply them, and restart the AtomCapitol backend (gunicorn via systemd).
#
# Usage:
#   ./restart.sh        check -> migrate -> restart -> verify
#   ./restart.sh -y     same, but don't ask for confirmation on warnings

set -o pipefail

SERVICE="${SERVICE:-atomcap}"
cd "$(dirname "$0")" || exit 1
PY="./venv/bin/python"
ASSUME_YES=false
[ "$1" = "-y" ] && ASSUME_YES=true

if [ -t 1 ]; then
  BOLD=$'\e[1m'; CYAN=$'\e[36m'; RED=$'\e[31m'; YELLOW=$'\e[33m'; GREEN=$'\e[32m'; RESET=$'\e[0m'
else
  BOLD=""; CYAN=""; RED=""; YELLOW=""; GREEN=""; RESET=""
fi

header() { echo; echo "${BOLD}${CYAN}==> $*${RESET}"; }
ok()     { echo "${GREEN}✔ $*${RESET}"; }
warn()   { echo "${YELLOW}⚠ $*${RESET}"; }
fail()   { echo "${RED}✘ $*${RESET}"; exit 1; }

confirm() {
  $ASSUME_YES && return 0
  read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || fail "Aborted."
}

[ -x "$PY" ] || fail "venv not found at $(pwd)/venv"

header "Database target"
DB_INFO=$($PY manage.py shell -c "from django.db import connection as c; s=c.settings_dict; print(s['ENGINE'].split('.')[-1], s['NAME'], s.get('HOST') or '-')" 2>&1) \
  || { echo "$DB_INFO"; fail "Could not load Django settings."; }
echo "$DB_INFO"
if [[ "$DB_INFO" == sqlite3* ]]; then
  warn "Using SQLite — DB_NAME is not set. Check that backend/.env exists and has the production DB settings."
  confirm "Continue with SQLite anyway?"
fi

header "Django system check"
$PY manage.py check || fail "System check failed — not restarting."
ok "System check passed"

header "Model changes without migration files"
if $PY manage.py makemigrations --check --dry-run; then
  ok "All model changes have migration files"
else
  warn "Some model changes have no migration file. Run makemigrations locally, commit, and pull."
  confirm "Continue without them?"
fi

header "Pending migrations"
PENDING=$($PY manage.py showmigrations --plan 2>&1 | grep -F "[ ]")
if [ -n "$PENDING" ]; then
  echo "$PENDING"
  header "Applying migrations"
  $PY manage.py migrate --noinput || fail "Migration failed — not restarting."
  ok "Migrations applied"
else
  ok "No pending migrations"
fi

header "Restarting $SERVICE"
sudo systemctl restart "$SERVICE" || fail "systemctl restart failed"
sleep 3

if systemctl is-active --quiet "$SERVICE"; then
  ok "$SERVICE is running (since $(systemctl show "$SERVICE" -p ActiveEnterTimestamp --value))"
else
  echo
  sudo journalctl -u "$SERVICE" -n 40 --no-pager -o short-iso
  fail "$SERVICE failed to start — logs above. More: ./logs.sh"
fi

header "Startup log"
sudo journalctl -u "$SERVICE" --since "-10s" --no-pager -o short-iso | tail -n 20
