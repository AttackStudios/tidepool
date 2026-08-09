# Code signing

## Decision: ship unsigned on 25 Aug, sign afterwards

Signing on launch day would not remove the SmartScreen warning. Microsoft removed EV certificates'
instant-bypass status, so **EV and OV now build SmartScreen reputation identically**, through clean
download volume over time. A certificate bought the week before launch starts at zero reputation, so
you would pay and still get warned.

Being first matters more than a clean prompt on day one, and the Steam guide already walks users
through *More info → Run anyway*. Buy a certificate once downloads are actually happening, so the
reputation clock starts against real volume.

## macOS: skip entirely

Surf Sandbox ships no macOS build. TidePool's macOS build exists so development can happen on a Mac —
no user needs it. The Apple Developer Program is $99/year for an audience of one.

If that ever changes: Apple Developer Program, a *Developer ID Application* certificate, and
notarisation. electron-builder handles it from `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and
`APPLE_TEAM_ID`.

## Windows: the one that matters

Note that since June 2023 code signing keys must live on hardware or a cloud HSM. A plain `.pfx` on
disk is no longer an option, which is what makes the cloud services worth the money — a physical USB
token cannot sign inside GitHub Actions.

| Option | Cost | CI-friendly | Notes |
| --- | --- | --- | --- |
| **Azure Trusted Signing** (renamed Azure Artifact Signing) | $9.99/month Basic | **Yes** — cloud HSM | Open to individual developers, not just companies. Best fit here, since CI already builds the installer. |
| **Certum Open Source Code Signing** | ~€69 kit, ~€29/year renewal | No — physical card | Cheapest overall and aimed at open source, but signing has to happen by hand on your machine. |

**Recommended: Azure Trusted Signing.** It signs inside the existing Windows CI job, so releases stay
one `git tag` away rather than becoming a manual ritual.

### Wiring it into CI when you have it

electron-builder supports Azure Trusted Signing directly. The Windows job needs the endpoint, account
and certificate-profile names plus an Azure credential, all as repository secrets. Nothing else in the
workflow changes — the artifact simply comes out signed.
