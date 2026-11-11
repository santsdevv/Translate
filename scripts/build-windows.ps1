$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Ok($m)   { Write-Host "  [ok] $m" -ForegroundColor Green }
function Fail($m) { Write-Host "  [!!] $m" -ForegroundColor Red; $script:missing = $true }

Write-Host "`nVerificando pré-requisitos..." -ForegroundColor Cyan
$missing = $false

if (Get-Command node -ErrorAction SilentlyContinue) {
  $v = (node --version).TrimStart("v"); if ([version]$v -ge [version]"20.0.0") { Ok "Node.js $v" } else { Fail "Node.js $v encontrado; instale a versão 20 ou mais nova: https://nodejs.org" }
} else { Fail "Node.js não encontrado: https://nodejs.org (versão LTS)" }

if (Get-Command cargo -ErrorAction SilentlyContinue) {
  Ok ((cargo --version) -join "")
  $targets = rustup target list --installed
  if ($targets -notcontains "x86_64-pc-windows-msvc") { Fail "Alvo MSVC do Rust ausente. Rode: rustup default stable-msvc" }
} else { Fail "Rust não encontrado: https://rustup.rs (escolha a opção padrão)" }

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasVc = $false
if (Test-Path $vswhere) {
  $hasVc = [bool](& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
}
if ($hasVc) { Ok "Ferramentas de build C++ do Visual Studio" } else {
  Fail "Instale o 'Build Tools for Visual Studio' com 'Desenvolvimento para desktop com C++': https://visualstudio.microsoft.com/visual-cpp-build-tools/"
}

$wv = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue
if ($wv) { Ok "WebView2 $($wv.pv)" } else { Write-Host "  [--] WebView2 não detectado (o instalador do Translate baixa automaticamente)" -ForegroundColor Yellow }

if ($missing) { Write-Host "`nInstale o que falta e rode o script de novo.`n" -ForegroundColor Red; exit 1 }

Write-Host "`nInstalando dependências do frontend..." -ForegroundColor Cyan
if (Test-Path package-lock.json) { npm ci } else { npm install }

Write-Host "`nCompilando e gerando o instalador (a primeira vez leva alguns minutos)..." -ForegroundColor Cyan
npm run tauri build

$exe = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($exe) {
  Write-Host "`nPronto! Instalador gerado em:" -ForegroundColor Green
  Write-Host "  $($exe.FullName)`n"
  explorer.exe /select,"$($exe.FullName)"
} else {
  Write-Host "`nO build terminou, mas o instalador não foi encontrado em src-tauri\target\release\bundle\nsis." -ForegroundColor Red
  exit 1
}
