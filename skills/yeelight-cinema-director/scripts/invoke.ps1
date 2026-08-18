$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$action = if ($args.Count -gt 0) { $args[0] } else { "start" }
$rest = if ($args.Count -gt 1) { $args[1..($args.Count - 1)] } else { @() }
$entry = if (@("host-prepare-validation", "host-run-validation", "host-recover-validation", "host-recover-screening") -contains $action) { "validation-host.mjs" } else { "service.mjs" }
& node (Join-Path $scriptDir $entry) $action @rest
exit $LASTEXITCODE
