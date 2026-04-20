# BEP BOM Manager - Production Deploy Script (Improved)
param(
    [string]$Message = "chore: deploy UI polish + Phase 3 features"
)

$ErrorActionPreference = "Stop"
$branch = "main"

Write-Host "`n=== BEP BOM Manager Deploy ===" -ForegroundColor Cyan

# Step 0: Safety checks
if ((git branch --show-current) -ne $branch) {
    Write-Host "❌ You are not on '$branch' branch!" -ForegroundColor Red
    exit 1
}

Write-Host "`nStep 1/5 - Pulling latest changes..." -ForegroundColor Cyan
git pull origin $branch --rebase

Write-Host "`nStep 2/5 - Building production bundle..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`nStep 3/5 - Deploying to Cloudflare Workers..." -ForegroundColor Cyan
npx wrangler deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Cloudflare deploy failed. Run 'npx wrangler login' if needed." -ForegroundColor Red
    exit 1
}

Write-Host "`nStep 4/5 - Committing source changes only..." -ForegroundColor Cyan
git add -A
git commit -m "$Message" --allow-empty
git push origin $branch

Write-Host "`n✅ Deploy complete!" -ForegroundColor Green
Write-Host "Live at: https://bep-bom-manager.abeypa.workers.dev" -ForegroundColor Green
Write-Host "Cloudflare Pages Dashboard: https://pages.cloudflare.com" -ForegroundColor Gray