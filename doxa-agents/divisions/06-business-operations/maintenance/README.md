# Maintenance

Database hygiene and one-time cleanup scripts. Most steps are pg_cron RPC jobs, not Edge Functions.

| Step | Kind | Notes |
|------|------|--------|
| [purge-drop-stories](01-purge-drop-stories/) | rpc | Monthly purge of old `DROP` stories |
| [cleanup-logs](02-cleanup-logs/) | rpc | Cron run details + HTTP response cleanup |
| [clustering-cleanup-unschedule](03-clustering-cleanup-unschedule/) | maintenance_script | Unschedule deprecated clustering crons |

Cron SQL: `02-cleanup-logs/schedule.sql` and siblings under this workflow.
