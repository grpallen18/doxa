# Doxa L3 Slack approvals

HTTP handlers live in the Next.js app (`/api/slack/events`, `/api/slack/interactions`, `/api/slack/notify`). This folder is the Slack CLI manifest only — not a Bolt process.

## Agent install (Phase 3)

```bash
slackcli login
cd integrations/slack-l3-approvals
slackcli init
slackcli install
```

The desktop Slack app already owns the `slack` command on Windows, so the developer CLI is installed as **`slackcli`**.

Then set `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APPROVAL_CHANNEL_ID` (`#l3-approvals`) in Vercel and `.env.local`. Optional: `SLACK_OPS_CHANNEL_ID` (`#grok-ops`), `SLACK_APPROVER_USER_IDS`, `SLACK_NOTIFY_SECRET`, `DOXA_APP_URL`.

Enable Event Subscriptions only after `/api/slack/events` is deployed (URL verification).
