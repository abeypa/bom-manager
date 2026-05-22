# ================================================================
# SUPABASE BACKUP SCRIPT (BOM Manager / EngineFlow-PM)
# Usage: .\backup.ps1
# ================================================================

# 1. Load Environment Variables from .env
if (Test-Path ".env") {
    foreach ($line in Get-Content ".env") {
        if ($line -match "^(.*)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

# 2. Check for Database Password
$dbPassword = [Environment]::GetEnvironmentVariable("DB_PASSWORD")
if ([string]::IsNullOrWhiteSpace($dbPassword) -or $dbPassword -eq "your_database_password_here") {
    Write-Host "Please enter your Database Password:" -ForegroundColor Yellow
    $dbPassword = Read-Host -AsSecureString
    $dbPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword))
}

# 3. Define Connection Details (db.<ref>.supabase.co)
$dbHost = "db.buvzefqfoeyupxsmhgkd.supabase.co" # project-ref from URL
$dbUser = "postgres"
$dbName = "postgres"
$dbPort = "5432"

# 4. Create Output Filename (Ex: backup_2026-04-07.sql)
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$outputFile = "backup_$timestamp.sql"

Write-Host "----------------------------------------------------" -ForegroundColor Cyan
Write-Host "Backing up BOM Manager Database..." -ForegroundColor Green
Write-Host "Target: $dbHost" -ForegroundColor Cyan
Write-Host "Output: $outputFile" -ForegroundColor Cyan
Write-Host "----------------------------------------------------"

# 5. Set PGPASSWORD for this session (prevents prompt)
$env:PGPASSWORD = $dbPassword

# 6. Run Local pg_dump (No Docker required!)
try {
    # Set PGPASSWORD for this session (prevents prompt)
    $env:PGPASSWORD = $dbPassword

    Write-Host "Running: pg_dump (Local)..." -ForegroundColor Gray
    
    # Use the local pg_dump.exe we downloaded
    .\pg_dump.exe --host=$dbHost --port=$dbPort --username=$dbUser --dbname=$dbName --format=plain --file=$outputFile --no-owner --no-privileges
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "----------------------------------------------------"
        Write-Host "SUCCESS! Your full backup is saved to:" -ForegroundColor Green
        Write-Host "$outputFile" -ForegroundColor Cyan
        Write-Host "----------------------------------------------------"
    } else {
        Write-Host "Error: Database dump failed with exit code $LASTEXITCODE." -ForegroundColor Red
        Write-Host "Please verify your DB_PASSWORD in .env." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Critical Error: Could not run pg_dump.exe. Is the file downloaded?" -ForegroundColor Red
    Write-Host $_.Exception.Message
} finally {
    # Clear the password from environment
    $env:PGPASSWORD = $null
}

Pause
