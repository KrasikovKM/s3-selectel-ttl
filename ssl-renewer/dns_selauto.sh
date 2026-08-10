#!/usr/bin/env sh
# acme.sh DNS API wrapper -> Selectel dnsv2 (delegates to python helper)
dns_selauto_add() {
  python3 /opt/ssl-renewer/dns_hook.py add "$1" "$2"
}
dns_selauto_rm() {
  python3 /opt/ssl-renewer/dns_hook.py rm "$1" "$2"
}
