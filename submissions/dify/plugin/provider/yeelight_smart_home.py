from typing import Any

import requests
from dify_plugin import ToolProvider
from dify_plugin.errors.tool import ToolProviderCredentialValidationError


class YeelightSmartHomeProvider(ToolProvider):
    def _validate_credentials(self, credentials: dict[str, Any]) -> None:
        bridge_url = _normalize_bridge_url(credentials.get("bridge_url"))
        api_key = str(credentials.get("api_key") or "").strip()
        if not bridge_url:
            raise ToolProviderCredentialValidationError("Bridge URL is required.")
        if not api_key:
            raise ToolProviderCredentialValidationError("Bridge API key is required.")
        try:
            response = requests.get(
                f"{bridge_url}/health",
                headers={"authorization": f"Bearer {api_key}"},
                timeout=10,
            )
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            raise ToolProviderCredentialValidationError(
                f"Unable to validate Yeelight bridge: {_safe_error(exc)}"
            ) from None
        if payload.get("skill") != "yeelight-smart-home":
            raise ToolProviderCredentialValidationError("Bridge health response is not for yeelight-smart-home.")


def _normalize_bridge_url(raw: Any) -> str:
    value = str(raw or "").strip().rstrip("/")
    if not value:
        return ""
    if not value.startswith("https://") and not value.startswith("http://"):
        return ""
    return value


def _safe_error(exc: BaseException) -> str:
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        return f"HTTP {exc.response.status_code}"
    return exc.__class__.__name__
