# WaterWay — ticket setup (Ticket Tool)

## Setup

1. **Invite** the bot from <https://tickettool.xyz> → Add to Discord → pick the WaterWay server.
   It needs **Manage Channels** and **Manage Roles**; don't strip those or ticket creation fails.
2. Open the **dashboard** at <https://tickettool.xyz/dashboard> and select the server.
3. Create a **panel** — the message with a button that members press to open a ticket. Set:
   - **Panel channel:** `#help` (must match what the rules point at)
   - **Ticket category:** a private category only staff can see
   - **Support role:** your staff role, added to every ticket automatically
   - **Transcripts:** on, saved to a staff-only `#ticket-logs` channel
   - **Ticket name:** `ticket-{username}` so tickets are searchable later
4. Deploy the panel, then open a test ticket yourself and confirm you can see it, reply in it,
   and close it — and that a non-staff alt account *cannot* see it.

**Changing an already-deployed panel's channel:** editing the panel and re-sending posts a *new*
message in the new channel. The old panel message stays where it was and keeps working, so delete it
manually or you end up with two live entry points. Ticket Tool will not clean it up for you.

**Permissions:** the bot needs View Channel, Send Messages and Embed Links in the panel channel. A
locked or read-only `#help` still has to grant the bot those three, or the panel silently never appears.

Until Aug 25 there are no mods to support, so a single button is enough. Split into
Mod support / Bug report / Moderation appeal once real volume shows up.

## Panel message

```
## 🎫 Open a ticket

Need help with a mod, want to report a WaterWay bug, or think a moderation call was wrong? Press the button below and a private channel opens between you and staff.

**Have these ready** — it's the difference between a fix in one reply and a fix in ten:
- Your `BepInEx/LogOutput.log`
- Your mod list, with versions
- What you expected, and what actually happened

-# Quick questions are fine right here in #help — open a ticket when it needs staff or gets private.
```

## Auto-reply when a ticket opens

```
Thanks for opening a ticket. Someone will be with you shortly — no need to ping anyone, we see every one.

To get this moving, post now:
**1. Your log** — attach `BepInEx/LogOutput.log` from your Surf Sandbox folder
**2. Your mods** — names and versions, or a screenshot of your mod list
**3. What happened** — what you did, what you expected, what you got

-# Never share account details, purchase receipts, or passwords here. Staff will not ask for them.
```
