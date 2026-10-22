#!/usr/bin/env bash
# Show logs for the AtomCapitol backend (gunicorn via systemd) and nginx.
#
# Usage:
#   ./logs.sh                 full report: status, app logs, errors, nginx (last 200 lines)
#   ./logs.sh -f              live tail of app + nginx together (Ctrl+C to stop)
#   ./logs.sh app [N]         last N app log lines (default 200)
#   ./logs.sh errors [SINCE]  only errors/tracebacks (default since "24 hours ago")
#   ./logs.sh nginx [N]       last N nginx access + error lines
#   ./logs.sh since "1 hour ago"   app logs since a time
#   ./logs.sh grep PATTERN    search app logs (last 7 days) for PATTERN
#   ./logs.sh status          service status, memory, recent restarts

SERVICE="${SERVICE:-atomcap}"
NGINX_ACCESS="/var/log/nginx/access.log"
NGINX_ERROR="/var/log/nginx/error.log"
ERROR_PATTERN='Traceback|Error|Exception|CRITICAL|Internal Server Error|Too Many Requests|refused|denied|failed|5[0-9]{2} '

if [ -t 1 ]; then
  BOLD=$'\e[1m'; CYAN=$'\e[36m'; RED=$'\e[31m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
else
  BOLD=""; CYAN=""; RED=""; YELLOW=""; RESET=""
fi

header() {
  echo
  echo "${BOLD}${CYAN}==================== $* ====================${RESET}"
}

# Colour error lines red and warnings yellow so they stand out.
highlight() {
  sed -E \
    -e "s/(.*(Traceback|Error|Exception|CRITICAL|refused|denied).*)/${RED}\1${RESET}/" \
    -e "s/(.*(WARNING|Too Many Requests|Not Found).*)/${YELLOW}\1${RESET}/"
}

app_logs() {
  sudo journalctl -u "$SERVICE" --no-pager -o short-iso "$@" | highlight
}

show_status() {
  header "SERVICE STATUS ($SERVICE)"
  sudo systemctl status "$SERVICE" --no-pager -l | head -n 20

  header "RECENT STARTS / STOPS / CRASHES"
  sudo journalctl -u "$SERVICE" --no-pager -o short-iso --since "7 days ago" \
    | grep -E "Started|Stopped|Stopping|Failed|failed|exited|Booting worker|Worker exiting|WORKER TIMEOUT|Listening at" \
    | tail -n 30 | highlight

  header "SYSTEM"
  echo "Uptime:  $(uptime -p)"
  echo "Disk:    $(df -h / | awk 'NR==2 {print $3 " used / " $2 " (" $5 ")"}')"
  echo "Memory:  $(free -h | awk '/Mem:/ {print $3 " used / " $2}')"
}

show_app() {
  local n="${1:-200}"
  header "APP LOGS — last $n lines ($SERVICE)"
  app_logs -n "$n"
}

show_errors() {
  local since="${1:-24 hours ago}"
  header "ERRORS & TRACEBACKS since \"$since\""
  # -B/-A keeps the traceback lines around each error match.
  sudo journalctl -u "$SERVICE" --no-pager -o short-iso --since "$since" \
    | grep -E -B 15 -A 2 "$ERROR_PATTERN" | highlight

  header "ERROR COUNTS since \"$since\" (by message)"
  sudo journalctl -u "$SERVICE" --no-pager -o cat --since "$since" \
    | grep -E "Internal Server Error|Too Many Requests|Not Found|Bad Request|Forbidden|Unauthorized|^[a-zA-Z_.]+(Error|Exception):" \
    | sort | uniq -c | sort -rn | head -n 25
}

show_nginx() {
  local n="${1:-100}"
  if [ -f "$NGINX_ERROR" ]; then
    header "NGINX ERROR LOG — last $n lines"
    sudo tail -n "$n" "$NGINX_ERROR" | highlight
  else
    header "NGINX ERROR LOG"; echo "(not found: $NGINX_ERROR)"
  fi

  if [ -f "$NGINX_ACCESS" ]; then
    header "NGINX ACCESS LOG — last $n lines"
    sudo tail -n "$n" "$NGINX_ACCESS" \
      | sed -E -e "s/(.*\" 5[0-9]{2} .*)/${RED}\1${RESET}/" -e "s/(.*\" 4[0-9]{2} .*)/${YELLOW}\1${RESET}/"

    header "NGINX STATUS CODES (last 5000 requests)"
    sudo tail -n 5000 "$NGINX_ACCESS" | awk '{print $9}' | sort | uniq -c | sort -rn

    header "NGINX TOP ENDPOINTS (last 5000 requests)"
    sudo tail -n 5000 "$NGINX_ACCESS" | awk '{print $7}' | sed 's/?.*//' | sort | uniq -c | sort -rn | head -n 15
  else
    header "NGINX ACCESS LOG"; echo "(not found: $NGINX_ACCESS)"
  fi
}

follow_all() {
  header "LIVE: $SERVICE + nginx (Ctrl+C to stop)"
  trap 'kill 0' EXIT
  sudo journalctl -u "$SERVICE" -f -n 50 --no-pager -o short-iso | sed -u "s/^/[app]   /" | highlight &
  if [ -f "$NGINX_ERROR" ]; then
    sudo tail -F -n 10 "$NGINX_ERROR" | sed -u "s/^/[nginx-err] /" | highlight &
  fi
  if [ -f "$NGINX_ACCESS" ]; then
    sudo tail -F -n 10 "$NGINX_ACCESS" | sed -u "s/^/[nginx] /" &
  fi
  wait
}

case "${1:-all}" in
  -f|follow|live) follow_all ;;
  app)            show_app "${2:-200}" ;;
  errors)         show_errors "${2:-24 hours ago}" ;;
  nginx)          show_nginx "${2:-100}" ;;
  status)         show_status ;;
  since)
    header "APP LOGS since \"${2:-1 hour ago}\""
    app_logs --since "${2:-1 hour ago}" ;;
  grep)
    [ -z "$2" ] && { echo "Usage: $0 grep PATTERN"; exit 1; }
    header "APP LOGS matching \"$2\" (last 7 days)"
    sudo journalctl -u "$SERVICE" --no-pager -o short-iso --since "7 days ago" \
      | grep -E -i -B 5 -A 5 "$2" | highlight ;;
  all)
    {
      show_status
      show_app 200
      show_errors "24 hours ago"
      show_nginx 100
    } | less -R ;;
  -h|--help|help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) echo "Unknown option: $1"; sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
