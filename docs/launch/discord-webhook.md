# Discord notifications

Two separate things, and they answer different needs.

## 1. Release announcements (built, needs one secret)

`.github/workflows/announce.yml` posts a formatted embed to Discord whenever a release is
published — version, notes, and direct download links, in TidePool's colours.

It stays inert until the secret exists, so it is safe sitting in the repo unconfigured.

**Setup, once:**

1. In Discord: **Server Settings → Integrations → Webhooks → New Webhook**
2. Pick the channel it should post to (`#announcements` is the obvious one), then **Copy Webhook URL**
3. Store it as a repository secret:

   ```sh
   gh secret set DISCORD_WEBHOOK -R AttackStudios/tidepool
   ```

   It prompts for the value, so the URL never lands in your shell history or a file.

**Test it without cutting a release:**

```sh
gh workflow run announce.yml -R AttackStudios/tidepool -f tag=v0.1.0-rc.8
```

That re-posts an existing release, which is also how you recover if a real announcement fails.

**Behaviour worth knowing:**

- A **full release** pings `@everyone`. A **prerelease** does not, and is labelled *Test build —
  not the full release*, because someone installing an rc thinking it is the release is exactly
  the confusion to avoid.
- `latest.yml` is filtered out of the download list. It is updater plumbing, not something to
  hand a person.
- Notes longer than ~1400 characters are trimmed at a line break with the link left intact.
- If Discord rejects the post the workflow **fails**, rather than passing quietly. A silent
  failure here means a release nobody hears about.

The same `DISCORD_WEBHOOK` secret is also used by `release-watch.yml`, which pings the server if
Surf Sandbox itself goes live.

## 2. Commits, issues and pull requests (no code needed)

If you want the noisier developer feed, Discord speaks GitHub's webhook format natively — no
workflow required.

1. Create a second Discord webhook, in a `#github` channel rather than `#announcements`
2. **Append `/github` to the URL**
3. In the repo: **Settings → Webhooks → Add webhook**, paste that URL, content type
   `application/json`, and choose which events to send

Keep this out of the channel your community reads. A steady drip of commit messages buries the
announcements that actually matter to them.
