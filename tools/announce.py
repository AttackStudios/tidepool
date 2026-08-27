#!/usr/bin/env python3
"""
Post a release to Discord.

Lives here rather than inside a workflow because it has to be callable from two
places. A release created by CI carries GITHUB_TOKEN, and GitHub deliberately
refuses to raise workflow-triggering events for that token, so an
`on: release: [published]` workflow never fires for our own releases. The build
job therefore calls this directly, and announce.yml calls the same script for
manual re-posts.

  tools/announce.py <tag> [--dry-run]

Env: DISCORD_WEBHOOK, DISCORD_WEBHOOK_BETA, BETA_ROLE_ID (optional), GH_TOKEN
"""
import json
import os
import re
import subprocess
import sys
import urllib.request


def read_release(tag: str, repo: str) -> dict:
    out = subprocess.run(
        ["gh", "release", "view", tag, "--repo", repo,
         "--json", "tagName,name,body,isPrerelease,url,assets"],
        capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def build_payload(r: dict) -> dict:
    tag = r["tagName"]
    prerelease = r["isPrerelease"]

    body = (r.get("body") or "").strip()
    if len(body) > 1400:
        body = body[:1400].rsplit("\n", 1)[0] + "\n\n…"

    # .yml is the updater manifest and .blockmap is a delta index; neither is
    # something a person downloads.
    assets = [a for a in r.get("assets", [])
              if not a["name"].endswith((".yml", ".blockmap"))]
    downloads = "\n".join(
        f"[{a['name']}]({a['url']}) · {a['size'] // 1024 // 1024} MB" for a in assets)

    # A release nobody needs woken for.
    #
    # Every stable release pinged @everyone, which is right for 1.0 and wrong for
    # a patch that adds one button — the people in that server get a notification
    # for something that, from their side, changes nothing they were waiting on.
    # Marking the notes quiet posts the announcement without the mention.
    quiet = "[quiet]" in body.lower()
    if quiet:
        body = re.sub(r"\[quiet\]\s*", "", body, flags=re.IGNORECASE).strip()

    launch = not prerelease and tag.lstrip("v").split("-")[0] == "1.0.0"
    role = os.environ.get("BETA_ROLE_ID", "").strip()
    mentions = {"parse": []}

    if launch:
        content = ("@everyone\n"
                   "# 🌊  TidePool 1.0 is out\n"
                   "-# The first mod manager for Surf Sandbox — shipping the day the game does.")
        title = "TidePool 1.0 — out now"
        description = (
            "**Install mods without ever opening a folder.**\n"
            "Dependencies resolve themselves, profiles keep your setups apart, and the "
            "game launches straight from the app.\n\n"
            "**·**  Browse every mod and install in one click\n"
            "**·**  Separate profiles — swap whole setups instantly\n"
            "**·**  Share a profile or a beach with a single code\n"
            "**·**  Free, open source, no account needed\n")
        if downloads:
            description += "\n**Downloads**\n" + downloads
        description += "\n\n[Full release notes](%s)" % r["url"]
        color = 0x3FD8E8
        mentions = {"parse": ["everyone"]}
    elif prerelease:
        content = (("<@&%s>\n" % role) if role else "") + "## 🧪  New beta build"
        title = "Beta build — " + (r.get("name") or tag)
        description = body or "No notes for this build."
        if downloads:
            description += "\n\n**Downloads**\n" + downloads
        description += ("\n\n-# Unfinished build. Export your profiles before installing it, "
                        "and keep these files in this channel — they are not for sharing.")
        color = 0xF2B45A
        if role:
            mentions = {"parse": [], "roles": [role]}
    else:
        content = "" if quiet else "@everyone"
        title = r.get("name") or tag
        description = body or "No release notes."
        if downloads:
            description += "\n\n**Downloads**\n" + downloads
        color = 0x3FD8E8
        mentions = {"parse": [] if quiet else ["everyone"]}

    return {
        # No username/avatar override: each webhook carries its own identity, so
        # the beta channel posts as TidePool Beta by itself.
        "content": content,
        "allowed_mentions": mentions,
        "embeds": [{
            "title": title,
            "url": r["url"],
            "description": description,
            "color": color,
            "footer": {"text": "tidepool · attackstudios.github.io/tidepool"},
        }],
    }


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if not args:
        print("usage: announce.py <tag> [--dry-run]", file=sys.stderr)
        return 2
    tag = args[0]
    repo = os.environ.get("GITHUB_REPOSITORY", "AttackStudios/tidepool")

    r = read_release(tag, repo)
    payload = build_payload(r)
    target = "beta" if r["isPrerelease"] else "main"

    if dry:
        print(f"target={target}")
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0

    webhook = os.environ.get("DISCORD_WEBHOOK_BETA" if target == "beta" else "DISCORD_WEBHOOK", "")
    if not webhook:
        print(f"No webhook configured for target '{target}'. Skipping.")
        return 0

    req = urllib.request.Request(
        webhook, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "tidepool-announce"})
    # A silent failure here means a release nobody hears about, so let it raise.
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status not in (200, 204):
            print(f"Discord rejected the post: HTTP {resp.status}", file=sys.stderr)
            return 1
    print(f"Announced {tag} to the {target} channel.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
