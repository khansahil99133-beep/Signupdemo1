Param(
    [switch]$Help
)

if ($Help) {
    Write-Host "Usage: .\publish-gh-pages.ps1"
    Write-Host "  Copies frontend/public into gh-pages, commits, and force-pushes."
    return
}

$root = (git rev-parse --show-toplevel) 2>$null
if (-not $root) {
    Throw "Unable to locate git repository root."
}

Push-Location $root
$currentBranch = git rev-parse --abbrev-ref HEAD
try {
    git fetch origin gh-pages
    git checkout gh-pages
    git reset --hard origin/gh-pages

    Get-ChildItem -LiteralPath $root -Force |
        Where-Object { $_.Name -ne '.git' } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    Copy-Item -LiteralPath (Join-Path $root 'frontend\public\*') -Destination $root -Recurse -Force -ErrorAction Stop

    git add -A
    git commit -m "Publish Jeetwin frontend" --quiet
    git push --force origin gh-pages
} finally {
    git checkout $currentBranch | Out-Null
    Pop-Location
}
