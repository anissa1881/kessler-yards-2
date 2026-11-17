# Ambil screenshot Kessler Yards di Windows.
#
#   powershell -ExecutionPolicy Bypass -File jalan.ps1
#
# Skrip ini memeriksa dulu apa yang terpasang, memberi tahu kalau ada yang kurang,
# baru mengunduh, memasang dan menjalankan penangkapan gambar.

$ErrorActionPreference = 'Stop'

function Say($text)  { Write-Host $text -ForegroundColor Cyan }
function Good($text) { Write-Host "  OK   $text" -ForegroundColor Green }
function Bad($text)  { Write-Host "  MISSING  $text" -ForegroundColor Red }

Say "`n1. Memeriksa yang terpasang"

# Node is the one thing that cannot be installed for you here.
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Bad "node (Node.js)"
  Write-Host "`nPasang Node.js dulu dari https://nodejs.org (pilih versi LTS)." -ForegroundColor Yellow
  Write-Host "Setelah terpasang, tutup PowerShell lalu buka lagi, dan jalankan skrip ini sekali lagi.`n"
  exit 1
}
$nodeVersion = (node --version)
Good "node $nodeVersion"

$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
  Bad "npm"
  Write-Host "`nnpm biasanya ikut terpasang bersama Node.js. Pasang ulang Node.js dari https://nodejs.org.`n" -ForegroundColor Yellow
  exit 1
}
Good "npm"

$git = Get-Command git -ErrorAction SilentlyContinue
if ($git) { Good "git" } else { Write-Host "  (git tidak ada, akan pakai unduhan ZIP)" -ForegroundColor DarkGray }

Say "`n2. Menyiapkan folder kerja"

# If this script is already sitting inside the source (for example in kessler-yards-2-main
# unzipped from the archive), use that folder rather than making a second copy.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$inner = $scriptDir
$alreadyHere = (Test-Path (Join-Path $inner 'game\index.html')) -and (Test-Path (Join-Path $inner 'capture.mjs'))

if ($alreadyHere) {
  Write-Host "  memakai folder yang sudah ada: $inner"
  $work = Split-Path -Parent $inner
} else {
  $work = Join-Path $env:USERPROFILE 'kessler-yards-work'
  if (Test-Path $work) {
    Write-Host "  folder sudah ada, memakai yang lama: $work"
  } else {
    New-Item -ItemType Directory -Path $work | Out-Null
    Write-Host "  dibuat: $work"
  }
  $inner = Join-Path $work 'kessler-yards'
}
Set-Location $work

Say "`n3. Mengambil source"

$hasGame = Test-Path (Join-Path $inner 'game\index.html')

if ($hasGame) {
  Good "source sudah ada"
} elseif ($git) {
  Write-Host "  git clone..."
  git clone https://github.com/anissa1881/kessler-yards-2.git
  if ($LASTEXITCODE -ne 0) { Write-Host "`ngit clone gagal.`n" -ForegroundColor Red; exit 1 }
} else {
  $zip = Join-Path $work 'src.zip'
  Write-Host "  mengunduh ZIP..."
  Invoke-WebRequest -Uri 'https://github.com/anissa1881/kessler-yards-2/archive/refs/heads/main.zip' -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $work -Force
  $extracted = Join-Path $work 'kessler-yards-2-main'
  if (Test-Path $extracted) { Move-Item $extracted $inner }
}

if (-not (Test-Path (Join-Path $inner 'game\index.html'))) {
  Write-Host "`nSource tidak ditemukan di $inner.`n" -ForegroundColor Red
  exit 1
}
Good "source siap di $inner"
Set-Location $inner

Say "`n4. Memasang playwright"

Write-Host "  npm install (mungkin butuh 1-2 menit)..."
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nnpm install gagal. Perhatikan pesan di atas.`n" -ForegroundColor Red
  exit 1
}
Good "playwright terpasang"

Say "`n5. Mengunduh Chromium (~120 MB)"

npx playwright install chromium
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nUnduhan Chromium gagal, biasanya karena jaringan.`n" -ForegroundColor Red
  exit 1
}
Good "Chromium siap"

Say "`n6. Menangkap screenshot"

node capture.mjs
$code = $LASTEXITCODE

Say "`nSelesai."
if ($code -eq 0) {
  Write-Host "`nTiga screenshot ada di:" -ForegroundColor Green
  Write-Host "  $inner\screenshots\`n"
  Write-Host "Kirim ketiganya, atau langsung commit:" -ForegroundColor Green
  Write-Host "  cd `"$inner`""
  Write-Host "  git add screenshots"
  Write-Host '  git commit -m "Real screenshots"'
  Write-Host "  git push`n"
} elseif ($code -eq 3) {
  Write-Host "`nCanvas 3D kosong: WebGL tidak jalan di PC ini." -ForegroundColor Yellow
  Write-Host "Coba buka Chrome langsung: npm run serve, lalu buka http://localhost:8080`n"
} else {
  Write-Host "`nPenangkapan gambar gagal (kode $code). Perhatikan pesan di atas.`n" -ForegroundColor Red
}
