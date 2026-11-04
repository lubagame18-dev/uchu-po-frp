# Выкладка сайта в Яндекс Облако без GitHub Actions (когда минуты закончились).
# Нужен AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
# Ключи — статический ключ сервисного аккаунта с ролью storage.editor:
#   https://console.yandex.cloud/folders/b1gh2pavc41nvt0kcki7/iam
# Запуск из PowerShell:
#   $env:YC_KEY_ID="..."; $env:YC_SECRET="..."; .\deploy\local-deploy.ps1

$ErrorActionPreference = "Stop"
if (-not $env:YC_KEY_ID -or -not $env:YC_SECRET) {
  throw "Задайте переменные YC_KEY_ID и YC_SECRET (ключ сервисного аккаунта storage.editor)."
}
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw "Не найден AWS CLI. Установите: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$env:AWS_ACCESS_KEY_ID = $env:YC_KEY_ID
$env:AWS_SECRET_ACCESS_KEY = $env:YC_SECRET
$env:AWS_DEFAULT_REGION = "ru-central1"
$bucket = "uchu-po-frp.ru"
$endpoint = "https://storage.yandexcloud.net"

Push-Location $root
try {
  aws s3 sync . "s3://$bucket" --endpoint-url $endpoint --delete --no-progress `
    --exclude ".git/*" --exclude ".github/*" --exclude "proxy/*" --exclude "api/*" `
    --exclude "docs/*" --exclude "*.md" --exclude "*.sql" --exclude "*.zip" `
    --exclude "wrangler.toml" --exclude "vercel.json" --exclude "_worker.js" `
    --exclude ".assetsignore" --exclude ".nojekyll" --exclude "CNAME" --exclude ".gitignore" `
    --cache-control "public, max-age=300"
  foreach ($f in @("sw.js", "index.html")) {
    aws s3 cp $f "s3://$bucket/$f" --endpoint-url $endpoint --cache-control "no-cache" --no-progress
  }
  Write-Host "Готово: сайт выложен в $bucket" -ForegroundColor Green
} finally {
  Pop-Location
}
