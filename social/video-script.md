# ekam.ink — Config Makeathon submission video (FINAL)

Master walkthrough (~3:30–3:45) + 30s social cut. Narrator = Mickey (you), first person.
Every page is covered, including `/admin`. Two live demos: `vote 2026` is returned by the AI
moderator; a hand-drawn tree passes and goes live. A dusty lofi track plays under the WHOLE
video — and it's the product's own radio (the reveal in Scene 9).

---

## Production setup (read once)

- **Record** the live site at https://ekam.ink, 1440-wide desktop, clean browser (no extensions /
  bookmarks bar). One mobile clip for the wall to show responsiveness.
- **Music:** turn the in-app lofi player ON at the very start and **let the same dusty track play
  continuously** under the entire video — never change it. In Scene 9 you reveal that this sound has
  been the site's own radio all along, so the audio must be unbroken from frame one. Duck it under
  your voice; let it breathe in the finale.
- **Captions:** small ember-accent lower-thirds per scene (💬).
- **Moderation demo:** make sure `ANTHROPIC_API_KEY` is live so `vote 2026` is actually returned.
- **Cut the film in Figma Weave** (a scored tool — and you say so in Scene 12).
- Quick cuts (1.5–3s of motion per page); let the wall, the music reveal, and the finale linger.

---

## MASTER CUT — shot list + narration

### 1 · The problem · `[0:00–0:22]`
- 🎥 Landing hero, slow drift — the ember field glowing, the live wall behind the words. (Lofi already playing.)
- 🎙️ *"We spend all day together online. Same feeds, same clips — together, but never quite **with** each other. We consume together. We almost never **make** anything together."*
- 🎙️ *"So I built a place where strangers could. One canvas. Five hundred and seventy-six little squares — and whoever shows up gets exactly one."*
- 💬 ekam · Sanskrit for *one*

### 2 · Landing · `[0:22–0:34]`
- 🎥 Slow scroll — hero, the live counter ticking, the "how it works" steps. Move the mouse so the **cursor trail** shows.
- 🎙️ *"No login. No account. No noise. Just an invitation — leave the words, draw the lines, say what's in your mind."*
- 💬 ekam.ink · many hands, one canvas

### 3 · The wall + claiming · `[0:34–0:54]`
- 🎥 `/canvas`: zoom out to the full wall, pan into a few painted tiles (hover whispers), then click an **open** tile → claim panel → type a name → "Start painting".
- 🎙️ *"The whole thing is one wall. Zoom out and it's a quilt of hundreds of hands. Zoom in, and every square is one person — their painting, their name, one line about why."*
- 🎙️ *"You tap any open tile and it's instantly yours. No email, no sign-up — just a name, and a blank square waiting."*
- 💬 One tile per person · no sign up

### 4 · The studio — paint the tree · `[0:54–1:10]`
- 🎥 The studio opens on the blank tile. Draw a simple **tree** (trunk + canopy + a little sun). Show a brush, the fill, undo. Add a one-line story ("the tree outside nani's window").
- 🎙️ *"Then you paint. A real little studio — brushes, colours, fills, your own hand. Whatever's in your mind, on one small square. I'll draw a tree."*
- 💬 Hand-painted · autosaves across devices

### 5 · The AI moderator — the `vote 2026` demo · `[1:10–1:42]`  *(highlight)*
- 🎥 First the catch: on a tile, **type "VOTE 2026"** big → submit → "Reviewing your tile…" → **"Returned by review"** (read the on-screen reason).
- 🎙️ *"But a public wall painted by strangers — someone will try to slip something in. So before anything goes live, an AI moderator reads every tile in seconds. Watch — I'll try to sneak in a political slogan."*
- 🎙️ *"Returned. It caught it — election content doesn't belong on a wall everyone shares."*
- 🎥 Then the freedom: "Draw something new" → bring back the **tree** → submit → "Reviewing…" → **"It's live!"** (confetti).
- 🎙️ *"But it's not heavy-handed — real art stays free. Two passes, both have to agree, in any language. The tree? Reviewing… and it's live."*
- 💬 Claude Opus 4.8 · two-pass vision review · in seconds

### 6 · On the wall — tile detail + voting · `[1:42–1:56]`
- 🎥 Click the live tree tile → detail panel (name, story, ♥). Click "Love this tile". Pan to a tile wearing the **golden frame**.
- 🎙️ *"Now it's on the wall, with my name beside it. Anyone can love a tile — and the most-loved one wears a golden frame, right there on the canvas."*
- 💬 Real-time · the wall updates for everyone in ~a second

### 7 · Notifications · `[1:56–2:04]`
- 🎥 Open the bell in the topbar — claimed, live, loved.
- 🎙️ *"Every claim, every decision, every bit of love finds its way back to you here."*
- 💬 Live notifications

### 8 · Share page · `[2:04–2:14]`
- 🎥 A tile's share page `/t/:id` — the framed art, the story, the share buttons.
- 🎙️ *"Every tile gets its own page to share — your small piece of something much bigger."*
- 💬 A page for every tile · open-graph cards

### 9 · The music — "this whole time" · `[2:14–2:32]`  *(the reveal)*
- 🎥 Open the floating **music player** (bottom-right). Let the **visualizer** react to the track that's *already* playing, show the title, drag the card, open "browse tracks" to flash the 20-track list. The audio never changes — what they've been hearing is what's in the player.
- 🎙️ *"And one thing you probably didn't notice. That dusty lofi that's been playing since the very first second of this video — that's not my soundtrack. It's the canvas's."*
- 🎙️ *"A little radio built right in: twenty tracks, drifting, that keep playing wherever you wander — while you paint, while you scroll. You've been listening to the wall this whole time."*
- 💬 Studio radio · 20 lofi tracks · follows you across every page

### 10 · The moderation desk (Admin) · `[2:32–2:56]`  *(must-have)*
- 🎥 `/admin` tabs: **queue** (AI verdict chips + the returned `vote 2026` with its reason) → **held** → **painted tiles** → **log** (timestamped AI decisions) → **"the artwork"** (the whole wall stitching live + hi-res download).
- 🎙️ *"Behind the wall, a moderation desk. Every submission, the AI's verdict and its reasoning, and a one-click human override — because the machine is fast, but a person always has the last word."*
- 🎙️ *"And here the whole canvas stitches together, live — one picture you can download at nine thousand pixels square."*
- 💬 AI proposes · a human decides · everything logged

### 11 · The finale — the completed wall · `[2:56–3:14]`
- 🎥 The reveal: the seamless artwork, the **ember field + cursor trail** drifting over it, the scrolling **credits reel** of every artist, the "many hands, one canvas" caption, Download / Share. (Use `FINALE_FORCE=1` locally to capture it.) Let the music swell here.
- 🎙️ *"And when the canvas closes, it reveals itself — one seamless picture, every blank tile as paper, and a scrolling reel of everyone who made it. Hundreds of strangers; one thing they made together, that stays."*
- 💬 The reveal · downloadable forever

### 12 · How it was built (the workflow) · `[3:14–3:38]`  *(scored heavily)*
- 🎥 Montage: the **Figma file** (Foundations tokens, components, screens incl. the Ambience & motion page) → **Claude Code + the Figma MCP** writing to that file → the running app. Show the file's "How it was built" page.
- 🎙️ *"Here's how it was built — and how you could too. It started in Figma: the design system, the type ramp, every screen."*
- 🎙️ *"Then the Figma MCP became the bridge. The same agent — Claude Code — read and wrote **this Figma file** and the production app through one pipeline, so design and code never drifted. Next.js and Supabase run the live wall. The Claude API is the moderator. And this film was cut in Figma Weave."*
- 🎙️ *"Design and code, held by the same hands."*
- 💬 Figma → Figma MCP → Claude Code → Supabase/Vercel → Weave

### 13 · Close · `[3:38–3:50]`
- 🎥 Pull back out to the full wall / finished artwork. Hold. Music resolves.
- 🎙️ *"Five hundred and seventy-six strangers. One canvas. One small moment in history."*
- 🎙️ *"This is ekam. Come leave your mark."*
- 💬 ekam.ink · #ConfigMakeathon · @figma

---

## 30-SECOND SOCIAL CUT (required for the prize pool)

> The same lofi track plays under this cut too. Post to X / Instagram / LinkedIn · tag
> **#ConfigMakeathon** and **@figma** · credit the tools.

- 🎥 (0–6s) Hero + wall zoom-out. 🎙️ *"We consume together online. We never make anything together — so I built one canvas for 576 strangers."*
- 🎥 (6–14s) Tap a tile → paint the tree → submit. 🎙️ *"Claim a square, paint it by hand, leave one line."*
- 🎥 (14–22s) `vote 2026` returned, then the tree goes live (confetti). 🎙️ *"An AI moderator screens every tile in seconds — it catches the bad, frees the real."*
- 🎥 (22–30s) Finale artwork + credits reel; flash the music player. 🎙️ *"Even the lofi is built in. Made with Figma, the Figma MCP, Claude Code and Weave. ekam.ink — come leave your mark."*

---

## What to say for each judging category (so the points land)

| Category (5 pts) | Where | Say this |
|---|---|---|
| **Quality of work** (design/build/craft) | Wall, studio, music, admin, finale | Real product: realtime wall, painter, votes, notifications, a persistent lofi radio, 9216² stitch — warm-dark editorial system; the only colour on screen is what artists paint. |
| **Idea / real problem** | Open + close | "We consume together, we never make together." Care instead of chaos (vs r/place); a published tile is permanent — nobody paints over you. |
| **Video / workflow** | Scene 12 | Show the exact pipeline + "here's how you could do this too." Figma → MCP → Claude Code → Supabase → Weave, no drift. |
| **Novel use of Figma** | Scene 12 | The Figma file itself was **built programmatically through the Figma MCP** by the same agent that wrote the app; film cut in Weave. |
| **+5 Social** | — | Post the 30s cut, tag #ConfigMakeathon @figma + the tools. |
| **+5 Figma Community** | — | Publish the Figma file to the Community (could be featured). |

---

## Submission checklist

- [ ] Master video (this script) + 30s social cut, both cut in **Weave**.
- [ ] One unbroken lofi track under the whole master video (sets up Scene 9).
- [ ] **Live link:** https://ekam.ink
- [ ] **Working/community file:** the Figma file (publish to the Figma Community for +5 + the feature shot).
- [ ] Social post (X/IG/LinkedIn): 30s cut, **#ConfigMakeathon @figma**, tools tagged; add the social links on Contra.
- [ ] Moderation demo recorded with `ANTHROPIC_API_KEY` live.
- [ ] If teamed, tag the teammate in the entry.
