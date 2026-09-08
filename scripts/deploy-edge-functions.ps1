param(
    [Parameter(Mandatory=$true)]
    [string]$Function
)

if (-not $env:SUPABASE_ACCESS_TOKEN) {
    Write-Error "SUPABASE_ACCESS_TOKEN is not set. Get one from supabase.com -> Account -> Access Tokens, then `$env:SUPABASE_ACCESS_TOKEN = '<token>` before running this script."
    exit 1
}

$ProjectRef = "zeeanhbvcjslzirftass"

Write-Host "Deploying $Function to $ProjectRef..."
npx supabase functions deploy $Function --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) {
    Write-Error "Deploy failed for $Function (exit $LASTEXITCODE)."
    exit $LASTEXITCODE
}
Write-Host "Deployed $Function."
