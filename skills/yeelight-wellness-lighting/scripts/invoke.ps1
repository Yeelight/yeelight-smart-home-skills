$ErrorActionPreference = "Stop"

function Write-RuntimeOutdated {
  Write-Output '{"contractVersion":"1.0","requestId":"runtime-outdated","status":"error","userMessage":"PATH 中的 yeelight-home 不是当前 Yeelight Home Runtime CLI，或版本过旧，无法作为 Skill Runtime 使用。请先运行 yeelight-home version --json 和 yeelight-home doctor --json --online 检查安装来源；通常需要升级当前 PATH 上的安装渠道，例如 npm install -g yeelight-home@latest、brew update && brew upgrade yeelight-home，或设置 YEELIGHT_HOME_BIN 指向新版 yeelight-home 可执行文件。升级后重新运行 yeelight-home auth status --json；无法扫码时，可在你自己的终端通过 yeelight-home auth token set --stdin --region <region> 导入已获准的 token。","error":{"code":"runtime_outdated","message":"yeelight-home version --json did not return the expected Runtime metadata"}}'
  exit 126
}

$RuntimeArgs = $args
$RequestPayload = [Console]::In.ReadToEnd()

function Write-PreviewNoWrite {
  Write-Output '{"contractVersion":"1.0","requestId":"preview-no-write","status":"blocked","userMessage":"当前请求是预览或咨询，不会改变灯光。若要执行，请明确请求运行并由 Skill 标记 executionRequested=true。","error":{"code":"preview_no_write","message":"lighting write intent requires executionRequested=true and preview=false"}}'
  exit 0
}

function Write-InvalidRequest {
  Write-Output '{"contractVersion":"1.0","requestId":"invalid-request","status":"error","userMessage":"请求格式无效或缺少可验证的执行字段，未调用 Yeelight Runtime。请重试；执行灯光变化时需要由 Skill 明确标记 executionRequested=true。","error":{"code":"invalid_request","message":"request JSON must be valid and contain a top-level execution gate"}}'
  exit 65
}

function Get-RequestObject([string] $Payload) {
  try {
    $Request = $Payload | ConvertFrom-Json -ErrorAction Stop
  } catch {
    Write-InvalidRequest
  }
  if ($null -eq $Request -or $Request -is [System.Array] -or $Request -is [string] -or $Request -is [ValueType]) {
    Write-InvalidRequest
  }
  return $Request
}

function Get-ExactProperty($Request, [string] $Name) {
  foreach ($Property in $Request.PSObject.Properties) {
    if ($Property.Name -ceq $Name) {
      return $Property
    }
  }
  return $null
}

function Test-RequestGate([string] $Payload) {
  $Request = Get-RequestObject $Payload
  $Intent = [string] $Request.intent
  $WriteIntents = @(
    "light.power.set",
    "light.brightness.set",
    "light.color_temperature.set",
    "light.color.set",
    "lighting.design.apply"
  )
  $AllowedIntents = @("home.summary", "home.list", "home.search", "home.stat.get", "device.weather.get", "entity.list", "entity.capabilities", "state.query", "state.batch.query", "intent.explain") + $WriteIntents
  if ($AllowedIntents -cnotcontains $Intent) {
    Write-InvalidRequest
  }
  $IsWrite = $WriteIntents -ccontains $Intent
  if ($IsWrite) {
    $previewProperty = Get-ExactProperty $Request "preview"
    $executionProperty = Get-ExactProperty $Request "executionRequested"
    if ($null -eq $previewProperty -or $null -eq $executionProperty -or
        $previewProperty.Value -isnot [bool] -or $executionProperty.Value -isnot [bool]) {
      Write-InvalidRequest
    }
    if ($previewProperty.Value -eq $true -or $executionProperty.Value -ne $true) {
      Write-PreviewNoWrite
    }
  }
  return [PSCustomObject]@{ Request = $Request; IsWrite = $IsWrite }
}

function Remove-ExecutionGate($Request) {
  $RuntimeRequest = [ordered]@{}
  foreach ($Property in $Request.PSObject.Properties) {
    if ($Property.Name -ceq "preview" -or $Property.Name -ceq "executionRequested") {
      continue
    }
    $RuntimeRequest[$Property.Name] = $Property.Value
  }
  return $RuntimeRequest | ConvertTo-Json -Compress -Depth 100
}

function ConvertTo-NativeArgument([string] $Value) {
  if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
  $Builder = [System.Text.StringBuilder]::new()
  [void] $Builder.Append('"')
  $Backslashes = 0
  foreach ($Character in $Value.ToCharArray()) {
    if ($Character -eq '\') {
      $Backslashes += 1
    } elseif ($Character -eq '"') {
      [void] $Builder.Append(('\' * (($Backslashes * 2) + 1)))
      [void] $Builder.Append('"')
      $Backslashes = 0
    } else {
      if ($Backslashes -gt 0) { [void] $Builder.Append(('\' * $Backslashes)) }
      [void] $Builder.Append($Character)
      $Backslashes = 0
    }
  }
  if ($Backslashes -gt 0) { [void] $Builder.Append(('\' * ($Backslashes * 2))) }
  [void] $Builder.Append('"')
  return $Builder.ToString()
}

function Invoke-NativeRuntime($RuntimeCommand, [string] $Payload) {
  # Preserve exact stdin bytes while honoring the documented invoke --stdin contract.
  $NativeArgs = @("invoke", "--stdin") + @($RuntimeArgs | ForEach-Object { [string] $_ })
  $StartInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = [string] $RuntimeCommand
  $StartInfo.UseShellExecute = $false
  $StartInfo.RedirectStandardInput = $true
  $ArgumentListProperty = $StartInfo.PSObject.Properties | Where-Object { $_.Name -ceq "ArgumentList" }
  if ($null -ne $ArgumentListProperty) {
    foreach ($Argument in $NativeArgs) { [void] $StartInfo.ArgumentList.Add($Argument) }
  } else {
    $StartInfo.Arguments = ($NativeArgs | ForEach-Object { ConvertTo-NativeArgument $_ }) -join " "
  }
  $Process = [System.Diagnostics.Process]::new()
  $Process.StartInfo = $StartInfo
  [void] $Process.Start()
  $Process.StandardInput.Write($Payload)
  $Process.StandardInput.Close()
  $Process.WaitForExit()
  $ExitCode = $Process.ExitCode
  $Process.Dispose()
  return $ExitCode
}

function Invoke-Runtime($RuntimeCommand) {
  $Gate = Test-RequestGate $RequestPayload
  $RuntimePayload = if ($Gate.IsWrite) { Remove-ExecutionGate $Gate.Request } else { $RequestPayload }
  Assert-RuntimeCompatible $RuntimeCommand
  $ExitCode = Invoke-NativeRuntime $RuntimeCommand $RuntimePayload
  exit $ExitCode
}

function Test-VersionAtLeastMinimum([string] $Version) {
  if ([string]::IsNullOrWhiteSpace($Version)) { return $false }
  $core = ($Version -split '\+', 2)[0]
  $parts = $core -split '-', 2
  $core = $parts[0]
  $preRelease = if ($parts.Count -eq 2) { $parts[1] } else { $null }
  if ($core -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') { return $false }
  $numbers = $core.Split('.') | ForEach-Object { [int64] $_ }
  if ($numbers[0] -gt 0) { return $true }
  if ($numbers[0] -lt 0 -or $numbers[1] -lt 1) { return $false }
  if ($numbers[1] -gt 1) { return $true }
  if ($numbers[2] -gt 20) { return $true }
  return $numbers[2] -eq 20 -and [string]::IsNullOrEmpty($preRelease)
}

function Assert-RuntimeCompatible($RuntimeCommand) {
  $VersionJson = ""
  try {
    $VersionJson = & $RuntimeCommand version --json 2>$null
  } catch {
    Write-RuntimeOutdated
  }
  $VersionObject = $null
  try {
    $VersionObject = $VersionJson | ConvertFrom-Json
  } catch {
    Write-RuntimeOutdated
  }
  if (-not ($VersionObject.cli -eq "yeelight-home" -and (Test-VersionAtLeastMinimum ([string] $VersionObject.version)))) {
    Write-RuntimeOutdated
  }
}

if ($env:YEELIGHT_HOME_BIN) {
  if (Test-Path $env:YEELIGHT_HOME_BIN) {
    Invoke-Runtime $env:YEELIGHT_HOME_BIN
  }
  Write-Output '{"contractVersion":"1.0","requestId":"runtime-missing","status":"error","userMessage":"YEELIGHT_HOME_BIN 指向的 yeelight-home 不存在或不可执行。请将 YEELIGHT_HOME_BIN 设置为 yeelight-home 可执行文件的绝对路径，或取消该环境变量后使用 PATH 中公开安装的 yeelight-home。安装后先运行 yeelight-home auth status --json；若未登录，优先运行 yeelight-home auth login --qr；无法扫码时，可在你自己的终端通过安全输入管道运行 yeelight-home auth token set --stdin --region <region> 导入已获准的 token。houseId 是可选默认家庭，只有家庭内设备、房间、情景、自动化等操作需要选择。","error":{"code":"runtime_missing","message":"YEELIGHT_HOME_BIN is not executable"}}'
  exit 127
}

$Command = Get-Command yeelight-home -ErrorAction SilentlyContinue
if ($Command) {
  Invoke-Runtime "yeelight-home"
}

$CandidatePaths = @()
if ($env:ProgramFiles) {
  $CandidatePaths += (Join-Path $env:ProgramFiles "Yeelight Home/yeelight-home.exe")
  $CandidatePaths += (Join-Path $env:ProgramFiles "yeelight-home/yeelight-home.exe")
}
if (${env:ProgramFiles(x86)}) {
  $CandidatePaths += (Join-Path ${env:ProgramFiles(x86)} "Yeelight Home/yeelight-home.exe")
}
if ($env:LOCALAPPDATA) {
  $CandidatePaths += (Join-Path $env:LOCALAPPDATA "Programs/yeelight-home/yeelight-home.exe")
  $CandidatePaths += (Join-Path $env:LOCALAPPDATA "Microsoft/WinGet/Packages/Yeelight.yeelight-home/yeelight-home.exe")
}
foreach ($Candidate in ($CandidatePaths | Select-Object -Unique)) {
  if ($Candidate -and (Test-Path $Candidate)) {
    Invoke-Runtime $Candidate
  }
}

Write-Output '{"contractVersion":"1.0","requestId":"runtime-missing","status":"error","userMessage":"Yeelight 本地 Runtime 未安装或不在 PATH 中。请从公开仓库 Yeelight/yeelight-home 的 GitHub Releases 安装 yeelight-home CLI，或使用当前已发布的 Homebrew、Scoop、npm 等包管理器渠道；也可以设置 YEELIGHT_HOME_BIN 指向 yeelight-home 可执行文件。安装后先运行 yeelight-home auth status --json；若未登录，优先运行 yeelight-home auth login --qr；无法扫码时，可在你自己的终端通过安全输入管道运行 yeelight-home auth token set --stdin --region <region> 导入已获准的 token。houseId 是可选默认家庭，只有家庭内设备、房间、情景、自动化等操作需要选择。","error":{"code":"runtime_missing","message":"yeelight-home CLI not found"}}'
exit 127
