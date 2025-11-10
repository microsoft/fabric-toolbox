# Removing other modules from the session that might conflict
Write-Verbose "Removing conflicting modules from session"
 if (Get-Module -Name FabricTools -ErrorAction SilentlyContinue) {
     Remove-Module -Name FabricTools -Force -ErrorAction SilentlyContinue
 }
