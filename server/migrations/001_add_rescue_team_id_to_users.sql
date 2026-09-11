-- Adds the explicit user-to-rescue-team association.
-- Existing users remain unassigned (NULL); apply manually before using the association API.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS rescue_team_id INTEGER
    REFERENCES rescue_teams(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_rescue_team_id
    ON users(rescue_team_id);
