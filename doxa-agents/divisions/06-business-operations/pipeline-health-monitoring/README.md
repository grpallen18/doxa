# Pipeline health monitoring

Operational reporting for the ingestion and processing pipeline.

| Step | Deploy | Schedule |
|------|--------|----------|
| [discord-daily-health](01-discord-daily-health/) | `discord_daily_health` | Daily Discord summary |

Uses `get_daily_health_report` RPC; see migration history under `supabase/migrations/*health_report*`.
