# Kessler Yards

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/anissa1881/kessler-yards-2/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/anissa1881/kessler-yards-2/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A round-based tactical shooter in the browser, built on three.js 0.187.0 with no build step. The
game is plain static files under `game/`: open it from any static HTTP server and play a round
against three bots.

    node serve.ts            # then open http://localhost:8080

## The round

A round is a freeze, then a live phase, and it ends one of four ways:

- the opposing team is eliminated;
- the player is eliminated;
- the charge is planted at the site and its 40-second fuse runs out;
- the charge is planted and the bots defuse it, which takes them 7 seconds standing on it.

Between rounds money is paid out and the buy menu opens. A win pays 3250; a loss pays 1400 and a
little more for each loss in a row, so a side that keeps losing is never starved out of the game.

## What the player controls

| input | does |
| --- | --- |
| mouse | look |
| `W A S D` | move, with acceleration and friction rather than a constant speed |
| `Shift` | crouch: lower, slower, and a tighter spread |
| `Space` | jump |
| left button | fire |
| `R` | reload |
| `E` | hold at the site to plant the charge |
| `G` | throw the selected grenade |
| `Z` | cycle which grenade comes next |
| `B` | the buy menu, during the freeze |
| `1`-`7` | buy the catalog item on that key |

## Why it is built this way

The simulation runs at a fixed 60 Hz inside a render at the display's rate, so a dropped frame
never changes where a shot lands. Each module owns one thing and nothing else:

| file | owns |
| --- | --- |
| `main.js` | the loop, the wiring, and the decisions that span two modules |
| `world.js` | the map's geometry and the colliders everything else collides with |
| `player.js` | movement, crouch, gravity, and the recoil offset that settles back |
| `weapon.js` | the view model and a gun's numbers: magazine, spread, recoil, reload |
| `bots.js` | the opposing team: one behaviour per bot, chosen from what it sees and hears |
| `match.js` | rounds, the charge's plant and defuse, money, and the score |
| `grenade.js` | thrown grenades in flight, the smoke they leave, and what a burst reaches |
| `feed.js` | the kill feed and the card shown between rounds |
| `hud.js` | the DOM HUD: it is pushed numbers and never reaches into the game |
| `audio.js` | every sound, synthesised at the moment it plays |

Three design choices are worth naming because they are easy to get wrong:

**Recoil settles.** A shot kicks the view up; the kick is held in an offset separate from the
player's own aim and eased back to zero. Sustained fire climbs and then comes back, which is what
makes a burst something to control rather than a number that runs away.

**Smoke takes a lane away.** A bot's line of sight is sampled against the map's colliders and
against every live smoke cloud, so a smoke between a bot and the player is cover in the same sense
a wall is. It blooms over half a second rather than blocking sight on the frame it lands.

**The bots have behaviours, not a patrol.** A bot posts up and covers a lane, breaks off along its
route when it takes a bad hit, stops firing to reload, and turns toward gunfire it hears. That is
what makes the yard something to take rather than a set of targets to walk past.

## Handing it in

`main.ts` copies `game/` and `screenshots/` to the output directory and writes `dossier.json` from
them with the kit's own library, so the file matches byte for byte what the gate builds again.
Every check it makes runs before anything is copied, and a refusal names the file and the fix.

    node main.ts                                  # writes /output
    MAKEFUN_OUTPUT_DIR=out node main.ts           # writes ./out instead

## Tests

The behaviour that is easy to get wrong has a test that runs in plain Node with a stub for three.js
standing in for the renderer: the plant and defuse cycle, the fuse, the loss-streak payout, the
smoke's sight cut, a frag's reach, the bot behaviours, and the kill feed's wording. They print one
line per assertion and exit non-zero on a failure.

---

<sub>Entered on [make.fun](https://make.fun/?ref=wd2jkb95&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
