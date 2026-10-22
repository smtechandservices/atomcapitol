#!/usr/bin/env bash
# Show the last 20 lines of the AtomCapitol backend logs, then follow live (Ctrl+C to stop).

SERVICE="${SERVICE:-atomcap}"

sudo journalctl -u "$SERVICE" -n 20 -f --no-pager -o short-iso
