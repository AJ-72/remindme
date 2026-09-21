<#
Builds and deploys artifacts/remindme-website to Cloudflare Pages.

First run:
  1. npx wrangler login   (opens a browser to authorize your Cloudflare account)
  2. Create the Pages project once (or let the first deploy create it):
       npx wrangler pages project create remindme-website --production-branch main
  3. Run this script.

Usage:
  .\scripts\deploy-website-pages.ps1
  .\scripts\deploy-website-pages.ps1 -ProjectName my-other-name
#>
param(
  [string]$ProjectName = "remindme-website"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$WebsiteDir = Join-Path $RepoRoot "artifacts\remindme-website"

if (-not (Test-Path $WebsiteDir)) {
  Write-Error "Website folder not found at $WebsiteDir"
  exit 1
}

Write-Host "Building artifacts/remindme-website..." -ForegroundColor Cyan
pnpm --filter "@workspace/remindme-website" run build:pages
if ($LASTEXITCODE -ne 0) {
  Write-Error "Build failed, aborting deploy."
  exit 1
}

$DistDir = Join-Path $WebsiteDir "dist"
if (-not (Test-Path $DistDir)) {
  Write-Error "Build succeeded but dist/ was not found at $DistDir"
  exit 1
}

Write-Host "Deploying $DistDir to Cloudflare Pages project '$ProjectName' (production)..." -ForegroundColor Cyan
# --branch main forces this onto the production branch regardless of the local git branch,
# since wrangler otherwise deploys to a Preview environment named after the current git branch
# (confirmed 2026-09-21: a deploy from a feature branch landed as Preview only, and the bare
# <project>.pages.dev URL showed "Nothing is here yet" until a --branch main deploy landed).
npx wrangler pages deploy $DistDir --project-name $ProjectName --branch main
if ($LASTEXITCODE -ne 0) {
  Write-Error "wrangler pages deploy failed. If this is the first deploy, create the project first:`n  npx wrangler pages project create $ProjectName --production-branch main"
  exit 1
}

Write-Host "Deploy complete." -ForegroundColor Green
