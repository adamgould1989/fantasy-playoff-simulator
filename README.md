# Who's In? Fantasy playoff simulator

A mobile-first page that answers "what needs to happen in the final week for me to make the playoffs?" for Sleeper fantasy football leagues. It's a static site with no backend. All data comes from the public [Sleeper API](https://docs.sleeper.com/).

## What it does

- **Table**: the live league table. During the final week, games in progress count with their current scores. Tap **Refresh scores** to update.
- **Week view**: tap a team to pick the winner of each matchup, or set exact scores. The table, odds and paths all update.
- **Tiebreak explanations**: tied teams are bracketed in the table. **Why this order?** shows each team's record and points against the other tied teams, and which rule separated each pair.
- **Paths**: for any team, plain-English conditions for getting in, e.g. "you win, or you lose and A beat B". It also shows when points will decide it, and who to root for in every other game. Paths only use results up to the week before the final week. They ignore your picks and any live or real final-week scores.
- **Odds and badges**: clinched / eliminated / playoff odds. Odds come from every combination of final-week winners. Scores are simulated from each team's season average whenever points decide a tiebreak.
- Teams are shown by their owner's Sleeper username.
- **Share this scenario**: your picks are saved in the URL.
- **Replay finished seasons**: start the final week blank or load the real results, which is how to test on 2025 data.

## League rules used

- Playoff count and final regular-season week come from the league's Sleeper settings (`playoff_teams`, `playoff_week_start − 1`).
- Ranking: overall win % (a tie counts as half a win), then for teams level on win %, using games among the **whole original tied group**:
  1. Head-to-head win %
  2. Head-to-head points per matchup
  3. Total points this season

  If a step separates only some of the group, the rest are still compared on the original group's figures. The group isn't re-split.
- A tied team that never played any of the others counts as .500 head-to-head, and as its season average for points per matchup.

## Development

```sh
npm install
npm run dev      # local server
npm test         # tiebreak, scenario and path unit tests
npm run verify   # real-data check against the 2025 leagues and Sleeper's brackets
npm run build    # static build into dist/
```

Code layout: `src/api` (Sleeper fetches), `src/model` (season and override handling), `src/logic` (standings, scenarios, path minimisation, explanations), `src/ui` (Preact components), `src/styles`.

## Deploying to Netlify

In Netlify, choose **Add new site → Import an existing project → GitHub** and pick this repo. `netlify.toml` already sets the build command (`npm run build`), the publish directory (`dist`) and Node 22. No environment variables are needed.
