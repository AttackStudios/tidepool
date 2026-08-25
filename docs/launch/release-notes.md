Free, open-source mod manager for **Surf Sandbox**.

Browse and install mods with dependencies resolved, keep separate profiles, manage and share
beaches, and launch straight from the app.

### What's in it

- **Beach Manager.** Reads the levels in your game install, shows what each one actually is —
  maximum depth in metres, swell, and whether the sea floor bottoms out on the game's limit —
  and installs, shares and deletes them. The folder is resolved from the game every time, so it
  follows a moved or reinstalled copy without being told.
- **Break Pack.** Nine real waves rebuilt from their actual sea-floor shape: Pipeline, Teahupo'o,
  Nazaré, Jeffreys Bay, Skeleton Bay, Mavericks, Puerto Escondido, Pleasure Point, and one gentle
  sandbar to learn on. Pleasure Point is measured rather than described, sampled from NOAA's CUDEM
  model along the line a refracted swell actually travels into the point. Installs from Essentials
  and needs no mod loader.
- **Profiles.** Separate sets of mods. Switching never touches your game install, so vanilla is
  always one click, and a whole setup shares as a code — no account, no server.
- **Browse Thunderstore, GameBanana and Essentials.** Thunderstore installs resolve dependencies
  and install them in the right order, showing exactly what will land before you commit.
- **Three ways to play.** Run directly with your mods, hand off to Steam to keep the overlay and
  playtime, or launch vanilla to check whether a mod caused a bug.

### On code mods

Surf Sandbox runs on Unity 6.3. **BepInEx does not work on it** — the build Thunderstore ships never
starts, and the newest development build spins indefinitely generating interop. MelonLoader 0.7.3
does load, so that is the loader TidePool detects and launches.

Beaches need no loader at all, which is why Break Pack works today.

---

Free and open source, MIT licensed, no account. Report anything broken at
<https://github.com/AttackStudios/tidepool/issues> or in Discord.
