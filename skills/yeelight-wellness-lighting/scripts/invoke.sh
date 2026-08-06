#!/usr/bin/env sh
set -eu

runtime_outdated() {
  cat <<'JSON'
{"contractVersion":"1.0","requestId":"runtime-outdated","status":"error","userMessage":"PATH 中的 yeelight-home 不是当前 Yeelight Home Runtime CLI，或版本过旧，无法作为 Skill Runtime 使用。请先运行 yeelight-home version --json 和 yeelight-home doctor --json --online 检查安装来源；通常需要升级当前 PATH 上的安装渠道，例如 npm install -g yeelight-home@latest、brew update && brew upgrade yeelight-home，或设置 YEELIGHT_HOME_BIN 指向新版 yeelight-home 可执行文件。升级后重新运行 yeelight-home auth status --json；无法扫码时，可在你自己的终端通过 yeelight-home auth token set --stdin --region <region> 导入已获准的 token。","error":{"code":"runtime_outdated","message":"yeelight-home version --json did not return the expected Runtime metadata"}}
JSON
  exit 126
}

preview_no_write() {
  cat <<'JSON'
{"contractVersion":"1.0","requestId":"preview-no-write","status":"blocked","userMessage":"当前请求是预览或咨询，不会改变灯光。若要执行，请明确请求运行并由 Skill 标记 executionRequested=true。","error":{"code":"preview_no_write","message":"lighting write intent requires executionRequested=true and preview=false"}}
JSON
  exit 0
}

request_invalid() {
  cat <<'JSON'
{"contractVersion":"1.0","requestId":"invalid-request","status":"error","userMessage":"请求格式无效或缺少可验证的执行字段，未调用 Yeelight Runtime。请重试；执行灯光变化时需要由 Skill 明确标记 executionRequested=true。","error":{"code":"invalid_request","message":"request JSON must be valid and contain a top-level execution gate"}}
JSON
  exit 65
}

enforce_request_gate() {
  payload="$1"
  if command -v jq >/dev/null 2>&1; then
    json_parser="jq"
    gate_result=$(printf '%s' "$payload" | jq -r '
      def is_write: .intent as $intent | ["light.power.set", "light.brightness.set", "light.color_temperature.set", "light.color.set", "lighting.design.apply"] | index($intent) != null;
      def is_allowed: .intent as $intent | ["home.summary", "home.list", "home.search", "home.stat.get", "device.weather.get", "entity.list", "entity.capabilities", "state.query", "state.batch.query", "intent.explain", "light.power.set", "light.brightness.set", "light.color_temperature.set", "light.color.set", "lighting.design.apply"] | index($intent) != null;
      if type != "object" then "invalid"
      elif (.intent | type) != "string" or (is_allowed | not) then "invalid"
      elif is_write and ((has("preview") | not) or (has("executionRequested") | not) or (.preview | type) != "boolean" or (.executionRequested | type) != "boolean") then "invalid"
      elif is_write and (.preview == true or .executionRequested != true) then "block"
      elif is_write then "write"
      else "read"
      end
    ' 2>/dev/null) || request_invalid
  elif command -v python3 >/dev/null 2>&1; then
    json_parser="python3"
    gate_result=$(printf '%s' "$payload" | python3 -c 'import json, re, sys
try:
    request = json.load(sys.stdin)
except Exception:
    print("invalid")
    raise SystemExit(0)
if not isinstance(request, dict):
    print("invalid")
else:
    intent = request.get("intent")
    writes = {"light.power.set", "light.brightness.set", "light.color_temperature.set", "light.color.set", "lighting.design.apply"}
    allowed = {"home.summary", "home.list", "home.search", "home.stat.get", "device.weather.get", "entity.list", "entity.capabilities", "state.query", "state.batch.query", "intent.explain", *writes}
    if not isinstance(intent, str) or intent not in allowed:
        print("invalid")
    elif intent in writes and ("preview" not in request or "executionRequested" not in request or not isinstance(request["preview"], bool) or not isinstance(request["executionRequested"], bool)):
        print("invalid")
    else:
        print("block" if intent in writes and (request["preview"] is True or request["executionRequested"] is not True) else "write" if intent in writes else "read")
') || request_invalid
  else
    request_invalid
  fi
  case "$gate_result" in
    block) preview_no_write ;;
    read|write) request_kind="$gate_result" ;;
    *) request_invalid ;;
  esac
}

strip_execution_gate() {
  payload="$1"
  case "$json_parser" in
    jq)
      printf '%s' "$payload" | jq -c 'del(.preview, .executionRequested)'
      ;;
    python3)
      printf '%s' "$payload" | python3 -c 'import json, sys
request = json.load(sys.stdin)
request.pop("preview")
request.pop("executionRequested")
json.dump(request, sys.stdout, ensure_ascii=False, separators=(",", ":"))'
      ;;
    *)
      return 1
      ;;
  esac
}

version_at_least_minimum() {
  version="$1"
  case "$version" in
    *+*) version=${version%%+*} ;;
  esac
  prerelease=""
  case "$version" in
    *-*) prerelease=${version#*-}; version=${version%%-*} ;;
  esac
  case "$version" in
    *[!0-9.]*|.*|*.|*..*|"") return 1 ;;
  esac
  old_ifs=$IFS
  IFS=.
  set -- $version
  IFS=$old_ifs
  [ "$#" -eq 3 ] || return 1
  case "$1/$2/$3" in *[!0-9/]*|"") return 1 ;; esac
  if [ "$1" -gt 0 ]; then return 0; fi
  [ "$1" -eq 0 ] || return 1
  if [ "$2" -gt 1 ]; then return 0; fi
  [ "$2" -eq 1 ] || return 1
  if [ "$3" -gt 20 ]; then return 0; fi
  [ "$3" -eq 20 ] && [ -z "$prerelease" ]
}

assert_runtime_compatible() {
  version_json="$("$1" version --json 2>/dev/null || true)"
  case "$version_json" in
    \{*)
      runtime_version=$(printf '%s' "$version_json" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
      if printf '%s' "$version_json" | grep -q '"cli"[[:space:]]*:[[:space:]]*"yeelight-home"' &&
        [ -n "$runtime_version" ] && version_at_least_minimum "$runtime_version"; then
        return 0
      fi
      ;;
  esac
  runtime_outdated
}

invoke_runtime() {
  runtime_bin="$1"
  shift
  case "$runtime_bin" in
    */*)
      runtime_dir=$(dirname "$runtime_bin")
      PATH="$runtime_dir:$PATH"
      export PATH
      ;;
  esac
  request_with_sentinel=$(cat; printf '%s' '__YEELIGHT_WELLNESS_EOF__')
  request_payload=${request_with_sentinel%__YEELIGHT_WELLNESS_EOF__}
  enforce_request_gate "$request_payload"
  assert_runtime_compatible "$runtime_bin"
  if [ "$request_kind" = "write" ]; then
    runtime_payload=$(strip_execution_gate "$request_payload") || request_invalid
    printf '%s' "$runtime_payload" | "$runtime_bin" invoke --stdin "$@"
  else
    printf '%s' "$request_payload" | "$runtime_bin" invoke --stdin "$@"
  fi
  exit $?
}

if [ -n "${YEELIGHT_HOME_BIN:-}" ]; then
  if [ -x "$YEELIGHT_HOME_BIN" ]; then
    invoke_runtime "$YEELIGHT_HOME_BIN" "$@"
  fi
  cat <<'JSON'
{"contractVersion":"1.0","requestId":"runtime-missing","status":"error","userMessage":"YEELIGHT_HOME_BIN 指向的 yeelight-home 不存在或不可执行。请将 YEELIGHT_HOME_BIN 设置为 yeelight-home 可执行文件的绝对路径，或取消该环境变量后使用 PATH 中公开安装的 yeelight-home。安装后先运行 yeelight-home auth status --json；若未登录，优先运行 yeelight-home auth login --qr；无法扫码时，可在你自己的终端通过安全输入管道运行 yeelight-home auth token set --stdin --region <region> 导入已获准的 token。houseId 是可选默认家庭，只有家庭内设备、房间、情景、自动化等操作需要选择。","error":{"code":"runtime_missing","message":"YEELIGHT_HOME_BIN is not executable"}}
JSON
  exit 127
fi

if command -v yeelight-home >/dev/null 2>&1; then
  invoke_runtime "yeelight-home" "$@"
fi

for candidate in \
  "/opt/homebrew/bin/yeelight-home" \
  "/usr/local/bin/yeelight-home" \
  "/usr/bin/yeelight-home" \
  "$HOME/.local/bin/yeelight-home"; do
  if [ -x "$candidate" ]; then
    invoke_runtime "$candidate" "$@"
  fi
done

cat <<'JSON'
{"contractVersion":"1.0","requestId":"runtime-missing","status":"error","userMessage":"Yeelight 本地 Runtime 未安装或不在 PATH 中。请从公开仓库 Yeelight/yeelight-home 的 GitHub Releases 安装 yeelight-home CLI，或使用当前已发布的 Homebrew、Scoop、npm 等包管理器渠道；也可以设置 YEELIGHT_HOME_BIN 指向 yeelight-home 可执行文件。安装后先运行 yeelight-home auth status --json；若未登录，优先运行 yeelight-home auth login --qr；无法扫码时，可在你自己的终端通过安全输入管道运行 yeelight-home auth token set --stdin --region <region> 导入已获准的 token。houseId 是可选默认家庭，只有家庭内设备、房间、情景、自动化等操作需要选择。","error":{"code":"runtime_missing","message":"yeelight-home CLI not found"}}
JSON
exit 127
