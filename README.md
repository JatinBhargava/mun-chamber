# MUN Chamber

Run a Model UN committee online. Parliament-style seating, chair-controlled procedure, and live **voice only** (no video) for whoever holds the floor. No accounts: the Chair creates a committee and shares a 6-letter code.

## Run it

```bash
npm install
npm run dev        # website on http://localhost:3000, realtime server on :8787
```

There are two parts:

| Part | What it does | Where it runs |
|---|---|---|
| Website (`app/`, `components/`) | Pages and UI, a plain Next.js app | Vercel |
| Realtime server (`worker/`) | Committee state, live updates, timers, voice setup | Cloudflare Workers + Durable Objects |

Each committee code gets its own Durable Object: one small server that holds that committee and everyone's live connection. State is saved to its storage after every change, so a committee survives restarts. A committee is deleted a day after its last activity.

## Deploy

1. **Realtime server (Cloudflare).** One time: `npx wrangler login`. Then:
   ```bash
   npm run deploy:live
   ```
   It prints an address like `https://mun-chamber-realtime.<you>.workers.dev`.
2. **Website (Vercel).** Import the project and add one environment variable:
   `NEXT_PUBLIC_REALTIME_URL = https://mun-chamber-realtime.<you>.workers.dev`
3. **Lock the server to your site.** In `worker/wrangler.jsonc`, set `ALLOWED_ORIGINS` to your Vercel address (for example `https://mun-chamber.vercel.app`; separate several with commas) and run `npm run deploy:live` again.

Durable Objects with SQLite storage are on Cloudflare's free plan.

## AI practice rooms

At `/practice`, a student can run a solo round with an AI Chair and four AI delegates, played by Claude Haiku 5.5. The round covers every stage of a normal committee: roll call, setting the agenda, opening speeches (with yields and Points of Information), a moderated caucus, an unmoderated caucus for working papers, draft resolutions, amendments, voting procedure with a roll call vote, and adjournment. It ends with personal feedback and an award (about 25 minutes).

- The Cloudflare server runs the round (`worker/practice.ts`) through the same rules engine as normal committees. Claude writes the speeches, the caucus topic, the draft, the AI votes, replies to points and notes, and the feedback (`worker/ai.ts`).
- AI speeches are read aloud with the browser's built-in voices. Spoken speeches from the student reach the AI through live captions.
- **Setup:** add your Anthropic API key as a Cloudflare secret, then deploy:
  ```bash
  npx wrangler secret put ANTHROPIC_API_KEY -c worker/wrangler.jsonc
  npm run deploy:live
  ```
  Locally, put `ANTHROPIC_API_KEY=...` in `worker/.dev.vars`. Without a key, `AI_MOCK=1` there gives canned AI answers so you can test the flow.
- **Cost guard:** `PRACTICE_DAILY_LIMIT` in `worker/wrangler.jsonc` caps new practice rooms per day across the site (default 30), and each room makes at most 60 Claude calls.

## What it covers

| Stage | In the app |
|---|---|
| Roll call | Delegates answer *Present* / *Present and voting*; Chair can mark anyone; latecomers can mark themselves |
| Agenda | Motion to set the agenda → procedural vote |
| Speakers' list | Queue, timer, yield to the Chair / to questions / to another delegate |
| Moderated caucus | Motion with topic + times; delegates raise placards; Chair clicks a seat to recognize |
| Unmoderated caucus | Timed; delegates draft working papers |
| Resolutions | Working paper → sponsors & signatories → submit → Chair approves as `DR x.y` → introduced |
| Amendments | Friendly (all sponsors agree, added automatically) or unfriendly (voted in voting procedure) |
| Voting | Close debate (2/3) seals the chamber and stops notes; amendments first, then resolutions; secret or roll-call votes; Security Council P5 veto |
| Adjournment | Awards and a downloadable Markdown report |

Points (personal privilege, order, parliamentary inquiry, information) and chits (private notes; the Chair can read all of them) work throughout.

## Voice

The speaker's browser sends their microphone straight to every other browser (WebRTC). The server only relays the connection setup, and it refuses to start audio from anyone who doesn't hold the floor. The Chair has their own mic toggle. Optional live captions use the browser's built-in speech recognition (Chrome, Edge, Safari).

Things to know:
- Browsers allow the microphone only on `https://` or `localhost`. Vercel and Cloudflare both serve HTTPS.
- Only public STUN servers are configured. People on very strict networks (some school or corporate firewalls) may need a TURN server, which you'd add to `ICE` in `components/useVoice.ts`.
- One speaker sends audio to everyone, so this suits committees of up to about 50.

## Code map

- `lib/engine.ts` contains all the rules of procedure: modes, speakers, motions, points, documents, amendments, votes, timers.
- `lib/types.ts` holds the shared state and action types.
- `worker/index.ts` is the Cloudflare realtime server: create/peek/join over HTTP, one Durable Object per committee with WebSockets, a separate view for each person (secret ballots, private notes), timer alarms and the WebRTC relay.
- `lib/client.ts` is the browser side: HTTP calls plus a WebSocket that reconnects on its own.
- `components/` contains the UI. `Chamber.tsx` is the main screen.

## License

MIT. See [LICENSE](LICENSE).
