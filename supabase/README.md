# Supabase

Migrations for BEAN Protocol profile, social connections, and beanpot announcements.

## Tables

- **profiles** — wallet_address, username, bio, pfp_url, banner_url
- **social_connections** — wallet_address, discord_id, discord_username, twitter_id, twitter_handle
- **beanpot_announcements** — round_id (tracks which rounds have been announced to Discord)

## GitHub Integration

With `Supabase changes only` enabled, preview branches are created when files in this folder change. Migrations run automatically on:

- **Production** — when merged to `main`
- **Preview** — when a PR modifies `supabase/` files

## Local development

```bash
# Link to your Supabase project (optional)
supabase link --project-ref <your-project-ref>

# Push migrations to linked project
supabase db push
```

## Adding migrations

```bash
supabase migration new my_migration_name
# Edit supabase/migrations/<timestamp>_my_migration_name.sql
```
