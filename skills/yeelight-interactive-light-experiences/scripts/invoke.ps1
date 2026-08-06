$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$action = if ($args.Count -eq 0) { "start" } elseif ($args.Count -eq 1) { [string]$args[0] } else { throw "Use only start, status, or stop." }
if ($action -notin @("start", "status", "stop")) { throw "Use only start, status, or stop." }
& node (Join-Path $scriptRoot "service.mjs") $action
exit $LASTEXITCODE
