#!/usr/bin/env bash
set -euo pipefail

# Запускать на чистом российском VPS (Ubuntu 24.04) от root.
# Официальный Supabase клонируется в /opt/supabase, а не в этот репозиторий.

APP_DIR="${APP_DIR:-/opt/supabase}"
REPO="https://github.com/supabase/supabase.git"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Запустите от root: sudo bash $0" >&2
  exit 1
fi

command -v docker >/dev/null || { echo "Сначала установите docker.io и docker-compose-plugin" >&2; exit 1; }
command -v git >/dev/null || { echo "Сначала установите git" >&2; exit 1; }

if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --depth 1 "$REPO" "$APP_DIR"
fi

cd "$APP_DIR/docker"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

# Официальный генератор ключей Supabase.
if [[ -f "$APP_DIR/docker/utils/generate-keys.sh" ]]; then
  bash "$APP_DIR/docker/utils/generate-keys.sh"
else
  echo "utils/generate-keys.sh не найден — генерирую ключи встроенным способом."
  python3 - <<'PY'
import base64, hashlib, hmac, io, json, os, re, secrets, time
p = ".env"
s = io.open(p, encoding="utf-8").read()
def get(k, d=""):
    m = re.search(r"^%s=(.*)$" % re.escape(k), s, re.M)
    return m.group(1) if m else d
def setv(k, v):
    global s
    if re.search(r"^%s=" % re.escape(k), s, re.M):
        s = re.sub(r"^%s=.*$" % re.escape(k), "%s=%s" % (k, v), s, flags=re.M)
    else:
        s += "\n%s=%s\n" % (k, v)
jwt = get("JWT_SECRET") or secrets.token_hex(32)
setv("JWT_SECRET", jwt)
setv("POSTGRES_PASSWORD", get("POSTGRES_PASSWORD") or secrets.token_urlsafe(24))
def b64(x):
    return base64.urlsafe_b64encode(x).decode().rstrip("=")
def key(role):
    now = int(time.time())
    payload = {"role": role, "iss": "supabase", "iat": now, "exp": now + 10*365*24*3600}
    head = b64(json.dumps({"alg":"HS256","typ":"JWT"},separators=(",",":")).encode())
    body = b64(json.dumps(payload,separators=(",",":")).encode())
    sig = b64(hmac.new(jwt.encode(), ("%s.%s" % (head, body)).encode(), hashlib.sha256).digest())
    return "%s.%s.%s" % (head, body, sig)
setv("ANON_KEY", get("ANON_KEY") or key("anon"))
setv("SERVICE_ROLE_KEY", get("SERVICE_ROLE_KEY") or key("service_role"))
io.open(p, "w", encoding="utf-8").write(s)
print("keys generated")
PY
fi

read -r -p "Домен API (например supa.uchu-po-frp.ru): " API_DOMAIN
read -r -p "Домен Studio (например studio.uchu-po-frp.ru): " STUDIO_DOMAIN
read -r -p "Домен сайта (например uchu-po-frp.ru): " SITE_DOMAIN

if [[ -z "$API_DOMAIN" || -z "$STUDIO_DOMAIN" || -z "$SITE_DOMAIN" ]]; then
  echo "Домены обязательны." >&2
  exit 1
fi

python3 - "$API_DOMAIN" "$STUDIO_DOMAIN" "$SITE_DOMAIN" <<'PY'
import io, os, re, sys
api, studio, site = sys.argv[1], sys.argv[2], sys.argv[3]
p = ".env"
s = io.open(p, encoding="utf-8").read()
def setv(key, val):
    global s
    if re.search(r"^%s=" % re.escape(key), s, re.M):
        s = re.sub(r"^%s=.*$" % re.escape(key), "%s=%s" % (key, val), s, flags=re.M)
    else:
        s += "\n%s=%s\n" % (key, val)
setv("SITE_URL", "https://" + site)
setv("API_EXTERNAL_URL", "https://" + api)
setv("SUPABASE_PUBLIC_URL", "https://" + api)
setv("STUDIO_URL", "https://" + studio)
setv("ADDITIONAL_REDIRECT_URLS", "https://" + site + ",https://www." + site)
setv("ENABLE_EMAIL_AUTOCONFIRM", "false")
setv("DISABLE_SIGNUP", "false")
io.open(p, "w", encoding="utf-8").write(s)
print("env updated")
PY

docker compose pull
docker compose up -d

echo
echo "Готово. Проверка:"
echo "  curl -s https://$API_DOMAIN/auth/v1/health"
echo
echo "ANON_KEY:"
grep -E '^ANON_KEY=' .env | cut -d= -f2-
echo "SERVICE_ROLE_KEY (не публиковать):"
grep -E '^SERVICE_ROLE_KEY=' .env | cut -d= -f2-
