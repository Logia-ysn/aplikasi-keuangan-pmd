# PMD Finance — Database Backups

Automated daily backups of the PostgreSQL database.
Maximum 3 days retained.

## Restore

```bash
# List available backups
bash scripts/restore.sh

# Restore specific backup
bash scripts/restore.sh pmd_finance_2026-03-17_020000.sql.gz
```

## Files

- `pmd_finance_YYYY-MM-DD_HHMMSS.sql.gz` — gzipped pg_dump (plain SQL)
