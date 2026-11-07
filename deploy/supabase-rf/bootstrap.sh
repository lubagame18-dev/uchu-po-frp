#!/usr/bin/env bash
# Ubuntu 24.04. Run from the copied supabase-rf directory as root.
set -euo pipefail
umask 077
: "${DOMAIN:?Set DOMAIN=supa.example.ru}"
: "${STUDIO_DOMAIN:?Set STUDIO_DOMAIN=studio.example.ru}"
: "${EMAIL:?Set EMAIL for TLS}"
: "${SITE_URL:?Set SITE_URL=https://your-site.ru}"
[[ $EUID == 0 ]] || { echo 'Run as root'; exit 1; }
for host in "$DOMAIN" "$STUDIO_DOMAIN"; do
  [[ $host =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ && $host == *.* ]] || exit 1
done
[[ $DOMAIN != "$STUDIO_DOMAIN" && $SITE_URL == https://* ]] || exit 1
BASE=$(cd -- "$(dirname -- "$0")" && pwd)
[[ $EMAIL =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || { echo 'Invalid TLS email'; exit 1; }
export DOMAIN STUDIO_DOMAIN EMAIL SITE_URL
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git openssl python3 docker.io docker-compose-v2 caddy
systemctl enable --now docker
if [[ ! -d /opt/uchu-supabase ]]; then
  git clone --depth 1 --branch self-hosted/v0.8.4 --filter=blob:none --sparse \
    https://github.com/supabase/supabase.git /opt/uchu-supabase
  git -C /opt/uchu-supabase sparse-checkout set docker
fi
cd /opt/uchu-supabase/docker
if [[ ! -e .env ]]; then
  cp .env.example .env
  # Official generator emits secrets; never send its output to logs.
  sh utils/generate-keys.sh --update-env >/dev/null
  python3 "$BASE/configure.py"
  chmod 600 .env
elif [[ ! -f .uchu-initialized ]]; then
  echo 'Existing .env without initialization marker. Review manually; secrets were not changed.' >&2
  exit 1
fi
# No secrets on stdout, including rendered compose configuration.
docker compose config --quiet
docker compose pull
docker compose up -d --wait --wait-timeout 300
# Caddy env is root-only and contains the dashboard bcrypt hash.
python3 "$BASE/configure.py" --caddy
install -m 644 "$BASE/Caddyfile" /etc/caddy/Caddyfile
mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=/etc/caddy/uchu.env\n' > /etc/systemd/system/caddy.service.d/uchu.conf
systemctl daemon-reload
systemctl restart caddy
curl --fail --silent --show-error --retry 10 --retry-delay 3 "https://$DOMAIN/auth/v1/health"
echo 'Health responded. Secrets remain in /opt/uchu-supabase/docker/.env; migration is not complete.'
