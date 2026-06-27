# Plugin Submission

## Plugin information

- **Author**: yeelight
- **Plugin name**: yeelight-smart-home
- **Version**: 0.1.0
- **Source repository**: https://github.com/Yeelight/yeelight-smart-home-skills
- **Contact**: support@yeelight.com

## Submission type

- [x] New plugin
- [ ] Version update

## What changed

Adds the official Yeelight Smart Home Dify tool plugin. The plugin calls a configured Yeelight Skill bridge, which invokes the local `yeelight-home` runtime with `yeelight-home invoke --stdin`.

## Risk level

- [ ] Low risk
- [x] Medium risk
- [ ] High risk

The plugin can trigger smart-home read and write flows through the Yeelight runtime. Persistent or risky changes are still confirmation-gated by the runtime.

## Required checks

- [x] I have read and followed the Marketplace submission requirements.
- [x] I have read and comply with the Plugin Developer Agreement.
- [ ] I tested this plugin on Dify Community Edition and Dify Cloud, or documented any limitation below.
- [x] The package contains only files needed at runtime.
- [x] The package does not contain secrets, local credentials, `.env` files, `.git` directories, virtual environments, caches, logs, or IDE files.
- [x] The package does not contain executables or bundled binaries.
- [x] The plugin README includes setup steps, usage instructions, required APIs or credentials, connection requirements, and the source repository link.
- [x] The plugin includes `PRIVACY.md`, and `manifest.yaml` references it.
- [x] All user-facing text is primarily in English.

## Security and privacy notes

The plugin forwards user utterances, selected intent, optional request parameters, and the configured bridge API key to the user's configured Yeelight Skill bridge. The plugin does not store Yeelight credentials or bundle the runtime.

## Local validation

```sh
dify plugin package submissions/dify/plugin -o submissions/dify/yeelight-smart-home-0.1.0.difypkg
dify plugin checksum submissions/dify/yeelight-smart-home-0.1.0.difypkg
node scripts/verify-publication-assets.mjs
```

## Reviewer notes

The bridge must be deployed by the user or workspace operator on HTTPS and protected by an API key. The Yeelight Home runtime remains responsible for local authentication, policy checks, confirmation gates, and redaction.
