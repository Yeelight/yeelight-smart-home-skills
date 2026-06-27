from collections.abc import Generator
from typing import Any
import json
import uuid

import requests
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage


class YeelightSmartHomeTool(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage, None, None]:
        bridge_url = _normalize_bridge_url(self.runtime.credentials.get("bridge_url"))
        api_key = str(self.runtime.credentials.get("api_key") or "").strip()
        utterance = str(tool_parameters.get("utterance") or "").strip()
        intent = str(tool_parameters.get("intent") or "").strip()
        if not bridge_url:
            yield self.create_text_message("Yeelight bridge URL is not configured.")
            return
        if not api_key:
            yield self.create_text_message("Yeelight bridge API key is not configured.")
            return
        if not utterance or not intent:
            yield self.create_text_message("Both utterance and intent are required.")
            return

        params = _parse_parameters(tool_parameters.get("parameters_json"))
        if params is None:
            yield self.create_text_message("parameters_json must be a JSON object when provided.")
            return

        request_payload = {
            "contractVersion": "1.0",
            "requestId": f"dify-{uuid.uuid4()}",
            "locale": "zh-CN",
            "utterance": utterance,
            "intent": intent,
        }
        if params:
            request_payload["parameters"] = params

        try:
            response = requests.post(
                f"{bridge_url}/invoke",
                headers={
                    "authorization": f"Bearer {api_key}",
                    "content-type": "application/json",
                },
                json=request_payload,
                timeout=60,
            )
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            yield self.create_text_message(f"Yeelight bridge invocation failed: {_safe_error(exc)}")
            return

        yield self.create_json_message(payload)
        yield self.create_text_message(_format_response(payload))


def _parse_parameters(raw: Any) -> dict[str, Any] | None:
    text = str(raw or "").strip()
    if not text:
        return {}
    try:
      value = json.loads(text)
    except json.JSONDecodeError:
      return None
    return value if isinstance(value, dict) else None


def _normalize_bridge_url(raw: Any) -> str:
    value = str(raw or "").strip().rstrip("/")
    if not value.startswith("https://") and not value.startswith("http://"):
        return ""
    return value


def _safe_error(exc: BaseException) -> str:
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        return f"HTTP {exc.response.status_code}"
    return exc.__class__.__name__


def _format_response(payload: dict[str, Any]) -> str:
    status = payload.get("status") or "unknown"
    message = payload.get("userMessage") or ""
    if message:
        return f"Yeelight Smart Home returned {status}: {message}"
    return f"Yeelight Smart Home returned {status}."
