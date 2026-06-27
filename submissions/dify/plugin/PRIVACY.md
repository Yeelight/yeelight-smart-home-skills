# Privacy Policy

This plugin forwards the user's Yeelight Smart Home request to the configured Yeelight Skill bridge.

Data sent to the bridge:

- Natural-language utterance.
- Selected Yeelight Smart Home intent.
- Optional request parameters supplied by the Dify workflow or agent.
- Bridge API key in the authorization header.

Data not collected by this plugin:

- Yeelight account passwords.
- Yeelight access tokens.
- Local runtime credential store contents.

The bridge host runs `yeelight-home invoke --stdin`; the Yeelight Home runtime is responsible for local authentication, policy validation, confirmation gates, and redaction.
