#!/usr/bin/env bash
# Установка self-hosted Supabase на Ubuntu 22.04 в Яндекс Облаке.
# Запуск: sudo DOMAIN=api.example.ru EMAIL=you@mail.ru DASHBOARD_PASSWORD='...' bash bootstrap-vm.sh
set -euo pipefail

: "${DOMAIN:?Укажите DOMAIN, например api.uchu-po-frp.ru}"
: "${EMAIL:?Укажите EMAIL для Let's Encrypt}"
: "${DASHBOARD_PASSWORD:?Укажите сложный DASHBOARD_PASSWORD}"

if [ "$(id -u)" -ne 0 ]; then echo "Запустите через sudo"; exit 1; fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git docker.io docker-compose-plugin ufw python3
systemctl enable --now docker

# Caddy — автоматический HTTPS
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# Официальный self-hosted Supabase (только папка docker — без лишнего)
if [ ! -d /opt/supabase/docker ]; then
  rm -rf /opt/supabase
  git clone --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase.git /opt/supabase
  cd /opt/supabase
  git sparse-checkout set docker
fi
cd /opt/supabase/docker
cp -n .env.example .env || true

# Генерируем секреты и JWT-ключи (HS256, как в Supabase)
python3 - <<'PY'
import base64, hashlib, hmac, json, secrets, time, re, io
env_path = ".env"
pg = secrets.token_urlsafe(32)
jwt = secrets.token_urlsafe(48)

def b64(x):
    return base64.urlsafe_b64encode(x).rstrip(b"=")
def token(payload, secret):
    header = b64(json.dumps({"alg":"HS256","typ":"JWT"}, separators=(",",":")).encode())
    body = b64(json.dumps(payload, separators=(",",":")).encode())
    sig = b64(hmac.new(secret.encode(), header + b"." + body, hashlib.sha256).digest())
    return (header + b"." + body + b"." + sig).decode()

now = int(time.time())
anon = token({"role":"anon","iss":"supabase","iat":now,"exp":now+10*365*24*3600}, jwt)
service = token({"role":"service_role","iss":"supabase","iat":now,"exp":now+10*365*24*3600}, jwt)

text = io.open(env_path, encoding="utf-8").read()
def setk(text, key, value):
    if re.search(r"^" + re.escape(key) + r"=", text, flags=re.M):
        return re.sub(r"^" + re.escape(key) + r"=.*$", key + "=" + value, text, flags=re.M)
    return text.rstrip() + "\n" + key + "=" + value + "\n"

for k, v in {
    "POSTGRES_PASSWORD": pg,
    "JWT_SECRET": jwt,
    "ANON_KEY": anon,
    "SERVICE_ROLE_KEY": service,
    "DASHBOARD_USERNAME": "admin",
    "DASHBOARD_PASSWORD": __import__("os").environ["DASHBOARD_PASSWORD"],
    "SITE_URL": "https://uchu-po-frp.ru",
    "API_EXTERNAL_URL": "https://" + __import__("os").environ["DOMAIN"],
    "SUPABASE_PUBLIC_URL": "https://" + __import__("os").environ["DOMAIN"],
    "ADDITIONAL_REDIRECT_URLS": "https://uchu-po-frp.ru,https://uchu-po-frp.ru/*",
    "ENABLE_EMAIL_SIGNUP": "true",
    "ENABLE_PHONE_SIGNUP": "true",
    "ENABLE_PHONE_AUTOCONFIRM": "true",
}.items():
    text = setk(text, k, v)
io.open(env_path, "w", encoding="utf-8").write(text)
print("ANON_KEY=" + anon)
print("SERVICE_ROLE_KEY=" + service)
print("POSTGRES_PASSWORD=" + pg)
PY

# Домен и HTTPS
mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8000
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
  }
}
EOF
systemctl reload caddy || systemctl restart caddy

# Файрвол
ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

# Запуск Supabase
cd /opt/supabase/docker
docker compose pull
docker compose up -d

echo
echo "============================================================"
echo "Supabase поднимается. Проверьте:"
echo "  curl https://${DOMAIN}/auth/v1/health"
echo "  curl https://${DOMAIN}/rest/v1/"
echo
echo "Ключи для сайта (index.html → UCHU_SITE.cloud):"
echo "  url: https://${DOMAIN}"
grep '^ANON_KEY=' .env | sed 's/^/  /'
echo
echo "Пароль базы сохранён в /opt/supabase/docker/.env (POSTGRES_PASSWORD)."
echo "Сохраните его в надёжном месте и сделайте резервную копию .env."
echo "============================================================"
