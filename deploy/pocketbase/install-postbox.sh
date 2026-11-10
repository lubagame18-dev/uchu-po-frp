#!/usr/bin/env bash
# Add Postbox to the existing, backed-up PocketBase installation. No credentials printed.
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root on the VPS'; exit 2; }
[[ $(/opt/pocketbase/pocketbase --version) == 'pocketbase version 0.40.6' ]]
systemctl is-active --quiet pocketbase
[[ -f /etc/pocketbase/pocketbase.env ]]
REF=cc2fac4f6a420510c1622de336651339276820d2
BASE="https://raw.githubusercontent.com/lubagame18-dev/uchu-po-frp/$REF/deploy/pocketbase"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
curl --proto '=https' --tlsv1.2 -fsSL "$BASE/enter-oauth-secrets.py" -o "$STAGE/input.py"
curl --proto '=https' --tlsv1.2 -fsSL "$BASE/pb_hooks/postbox.pb.js" -o "$STAGE/postbox.pb.js"
curl --proto '=https' --tlsv1.2 -fsSL "$BASE/pb_migrations/1794327600_mail_budget.js" -o "$STAGE/mail-budget.js"
(cd "$STAGE"; sha256sum -c --status <<'SHA'
f78bbeb4315b83b0c3a7a2d8e7cfc5a5f23245c9ab01a47eadee58fca8d19646  input.py
fdcb8b53f446867a670fdf59c2c6cd80968d72d11c7a11610e667f13b7d1e18e  postbox.pb.js
e610d18b2b454b7696211f0499bb3c9bf636000aed7ee979d380576204144db8  mail-budget.js
SHA
)
# Preserve the newly supplied OAuth credentials in the existing encrypted backup first.
systemctl start uchu-pocketbase-backup.service
systemctl is-active --quiet pocketbase
install -m 644 "$STAGE/postbox.pb.js" /opt/pocketbase/pb_hooks/postbox.pb.js
install -m 644 "$STAGE/mail-budget.js" /opt/pocketbase/pb_migrations/1794327600_mail_budget.js
install -m 700 "$STAGE/input.py" /root/uchu-private-login.py
systemctl restart pocketbase
for attempt in {1..30}; do
  if curl -fsS --max-time 2 http://127.0.0.1:8090/api/uchu/auth/v1/health >/dev/null; then
    echo 'PASS: Postbox hook and private budget installed; local health OK. SMTP awaits its private key.'
    exit 0
  fi
  sleep 1
done
echo 'Health failed; no secrets printed. Keep the website cutover disabled.' >&2
exit 1
