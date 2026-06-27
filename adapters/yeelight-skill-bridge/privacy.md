# Privacy

The Yeelight Skill Bridge forwards user requests to the locally installed `yeelight-home` runtime and returns the runtime response.

The bridge does not intentionally store Yeelight account credentials, access tokens, home data, device data, conversation content, or runtime responses. Authentication secrets for the runtime remain in the `yeelight-home` credential store on the bridge host.

Operators are responsible for configuring transport security, access control, retention policy, and log redaction on the deployment platform.
