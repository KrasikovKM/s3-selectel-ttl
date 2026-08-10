#!/bin/sh
# ssl-renewer: issues/renews the Selectel S3 custom-domain cert via acme.sh (DNS-01)
# and uploads it through the Selectel SSL API. Config comes from env (Dokploy).
set -e

HOME_DIR=/root/.acme.sh
SRC=/opt/acme-install
ACME="$HOME_DIR/acme.sh"

: "${SEL_IAM_USER:?SEL_IAM_USER required}"
: "${SEL_IAM_PASSWORD_B64:?SEL_IAM_PASSWORD_B64 required (base64 of the IAM password)}"
: "${SEL_ACCOUNT:?SEL_ACCOUNT required}"
: "${SEL_PROJECT_ID:?SEL_PROJECT_ID required}"
: "${CERT_DOMAINS:?CERT_DOMAINS required (comma-separated)}"
ACME_EMAIL="${ACME_EMAIL:-admin@alavenir.space}"

# password carries shell/.env-hostile chars ($ # ') -> passed as base64, decode here
SEL_IAM_PASSWORD=$(printf '%s' "$SEL_IAM_PASSWORD_B64" | base64 -d)
export SEL_IAM_PASSWORD

# 1) populate acme.sh into the (persistent, possibly-empty) home volume
mkdir -p "$HOME_DIR"
if [ ! -f "$ACME" ]; then
  echo "[entrypoint] seeding acme.sh into $HOME_DIR"
  cp -a "$SRC"/. "$HOME_DIR"/
fi
mkdir -p "$HOME_DIR/dnsapi"
cp -f /opt/ssl-renewer/dns_selauto.sh "$HOME_DIR/dnsapi/dns_selauto.sh"

# 2) materialize creds.json (600) from env for the python hooks
python3 - <<PY
import os, json
cfg = {
  "user": os.environ["SEL_IAM_USER"],
  "password": os.environ["SEL_IAM_PASSWORD"],
  "account": os.environ["SEL_ACCOUNT"],
  "project_id": os.environ["SEL_PROJECT_ID"],
  "auth_url": os.environ.get("SEL_AUTH_URL", "https://cloud.api.selcloud.ru/identity/v3/auth/tokens"),
  "dns_api": os.environ.get("SEL_DNS_API", "https://api.selectel.ru/domains/v2"),
  "ssl_api": os.environ.get("SEL_SSL_API", "https://api.ru-1.storage.selcloud.ru/v2/ssl"),
  "domains": [d.strip() for d in os.environ["CERT_DOMAINS"].split(",") if d.strip()],
}
open("/opt/ssl-renewer/creds.json", "w").write(json.dumps(cfg))
os.chmod("/opt/ssl-renewer/creds.json", 0o600)
print("[entrypoint] creds.json for", cfg["user"], cfg["domains"])
PY

"$ACME" --home "$HOME_DIR" --set-default-ca --server letsencrypt >/dev/null 2>&1 || true

MAIN=$(echo "$CERT_DOMAINS" | cut -d, -f1)
DARGS=""
for d in $(echo "$CERT_DOMAINS" | tr ',' ' '); do DARGS="$DARGS -d $d"; done

# 3) issue on first run (no cert in the volume yet)
if ! "$ACME" --home "$HOME_DIR" --list 2>/dev/null | grep -q "$MAIN"; then
  echo "[entrypoint] issuing cert: $CERT_DOMAINS"
  if "$ACME" --home "$HOME_DIR" --issue --server letsencrypt --dns dns_selauto $DARGS \
       --keylength 2048 --dnssleep 60 -m "$ACME_EMAIL" \
       --renew-hook "python3 /opt/ssl-renewer/upload.py"; then
    FC="$HOME_DIR/$MAIN/fullchain.cer"; KEY="$HOME_DIR/$MAIN/$MAIN.key"
    if [ -f "$FC" ]; then
      echo "[entrypoint] initial upload to Selectel"
      CERT_FULLCHAIN_PATH="$FC" CERT_KEY_PATH="$KEY" python3 /opt/ssl-renewer/upload.py || echo "[entrypoint] initial upload FAILED"
    fi
  else
    echo "[entrypoint] issue FAILED; will retry in renew loop"
  fi
else
  echo "[entrypoint] cert already present in volume; skipping issue"
fi

# 4) renew loop: acme.sh --cron renews when due and fires the renew-hook (upload)
echo "[entrypoint] entering renew loop (checks every 12h)"
while true; do
  "$ACME" --home "$HOME_DIR" --cron || true
  sleep 43200
done
