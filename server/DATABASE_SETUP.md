# Database bootstrap

ResQRoute uses PostgreSQL. This repository intentionally does not execute schema changes at application startup; doing so could alter a live database unexpectedly.

## Current baseline limitation

There is no checked-in baseline schema or migration runner in this project. Obtain the baseline schema from the existing deployment/database owner before creating a clean database. Do not infer or hand-write a replacement schema from controller code: defaults, constraints, timestamps, indexes, and foreign keys are part of the application contract.

The application expects these baseline tables: `users`, `disasters`, `shelters`, `rescue_teams`, `incidents`, `roads`, `resources`, and `risk_zones`. Create the independent tables first, then tables with foreign keys. In particular, `rescue_teams` must exist before applying the rescue-team association migration, and the `users` table must already exist.

## Applying the checked-in migration

After the compatible baseline schema has been created, apply migrations in numeric order:

1. `migrations/001_add_rescue_team_id_to_users.sql`

Migration 001 adds `users.rescue_team_id`, references `rescue_teams(id)`, and creates its supporting index. It is idempotent where supported by PostgreSQL (`IF NOT EXISTS`), but it must still be applied only after confirming the baseline schema is compatible.

## Safe deployment procedure

1. Back up the target database.
2. Create a new database and apply the approved baseline schema.
3. Apply numbered migrations in order with a privileged deployment account.
4. Configure the API using `server/.env.example` as the template.
5. Start the server and check `GET /api/health`.

Do not run migrations against a production database from test scripts or application startup.
