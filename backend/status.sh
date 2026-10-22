#!/usr/bin/env bash
# Show status of the AtomCapitol backend (atomcap / gunicorn) and nginx.
#
# Usage: ./status.sh

SERVICE="${SERVICE:-atomcap}"

if [ -t 1 ]; then
  BOLD=$'\e[1m'; CYAN=$'\e[36m'; RED=$'\e[31m'; YELLOW=$'\e[33m'; GREEN=$'\e[32m'; RESET=$'\e[0m'
else
  BOLD=""; CYAN=""; RED=""; YELLOW=""; GREEN=""; RESET=""
fi

header() { echo; echo "${BOLD}${CYAN}==================== $* ====================${RESET}"; }

# One-line summary: running/stopped, since when, restarts, memory.
summary() {
  local svc="$1" state since restarts mem
  state=$(systemctl is-active "$svc" 2>/dev/null)
  since=$(systemctl show "$svc" -p ActiveEnterTimestamp --value)
  restarts=$(systemctl show "$svc" -p NRestarts --value)
  mem=$(systemctl show "$svc" -p MemoryCurrent --value)
  [[ "$mem" =~ ^[0-9]+$ ]] && mem="$((mem / 1024 / 1024)) MB" || mem="-"

  if [ "$state" = "active" ]; then
    printf "%-8s ${GREEN}%-10s${RESET} since %s | auto-restarts: %s | memory: %s\n" "$svc" "$state" "$since" "${restarts:-0}" "$mem"
  else
    printf "%-8s ${RED}%-10s${RESET} (run: sudo journalctl -u %s -n 50)\n" "$svc" "${state:-unknown}" "$svc"
  fi
}

header "SUMMARY"
summary "$SERVICE"
summary nginx

header "$SERVICE (gunicorn)"
sudo systemctl status "$SERVICE" --no-pager -l | head -n 25

header "nginx"
sudo systemctl status nginx --no-pager -l | head -n 15

header "nginx config test"
if sudo nginx -t 2>&1; then
  echo "${GREEN}✔ config OK${RESET}"
else
  echo "${RED}✘ config has errors${RESET}"
fi

header "Listening ports"
sudo ss -tlnp | grep -E "nginx|gunicorn|python" || echo "(no nginx/gunicorn listeners found)"

header "Recent errors in $SERVICE (last hour)"
ERRORS=$(sudo journalctl -u "$SERVICE" --since "1 hour ago" --no-pager -o cat \
  | grep -E "Internal Server Error|Traceback|CRITICAL|WORKER TIMEOUT|^[a-zA-Z_.]+(Error|Exception):")
if [ -n "$ERRORS" ]; then
  echo "$ERRORS" | sort | uniq -c | sort -rn | head -n 10 | sed "s/^/${RED}/;s/$/${RESET}/"
  echo "Details: sudo journalctl -u $SERVICE --since \"1 hour ago\""
else
  echo "${GREEN}✔ none${RESET}"
fi

header "System"
echo "Uptime:  $(uptime -p)"
echo "Load:    $(cut -d' ' -f1-3 /proc/loadavg)"
echo "Disk:    $(df -h / | awk 'NR==2 {print $3 " used / " $2 " (" $5 ")"}')"
echo "Memory:  $(free -h | awk '/Mem:/ {print $3 " used / " $2}')"
