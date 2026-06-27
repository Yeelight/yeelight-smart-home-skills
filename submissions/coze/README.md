# Coze / 扣子 Submission Kit

Status: submission kit ready, Coze app/plugin adapter still required.

Coze does not consume the current Skill ZIP directly. Use this repository as the canonical release source, then create a Coze bot/plugin that calls a safe Yeelight bridge.

Required materials:

- Bot/plugin name: Yeelight Smart Home.
- Description: Control, organize, diagnose, design and answer product questions for a Yeelight smart home through the local yeelight-home Runtime.
- Public release URL: https://github.com/Yeelight/yeelight-smart-home-skills/releases/tag/yeelight-skill-yeelight-smart-home-v0.1.0
- Runtime dependency: `yeelight-home >= 0.1.7`.
- Safety: write operations require confirmation.
