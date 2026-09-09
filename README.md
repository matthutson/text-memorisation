# Text Memorisation App

A minimalist tool for learning text through progressive revelation, with folder organization and local storage.

## Features

- **Progressive Text Revelation**: Gradually reveal text as you memorize it
- **Tags**: Organise songs with as many tags as you like
- **Local Storage**: All data is stored locally in your browser
- **Auto-Advance**: Automatic column scrolling with adjustable speed
- **Customizable Display**: Adjust font size, column width, and reveal percentage
- **Minimalist Design**: Clean, distraction-free interface

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Usage

### Home Page

1. **Create tags**: Click "+" next to "Tags" in the sidebar. A song can carry any number of tags.
2. **Add songs**: Click "New song" and give it a title, the words, and any tags.
3. **Find things**: Search matches titles, artists and tag names. Sort by name or by most recently added.
4. **Practice**: Click "Practice" on any card.

### Practice Mode

- **Reveal Slider**: Control how much of the text is visible
- **Text Size**: Adjust font size with +/- buttons
- **Columns**: Adjust column width with +/- buttons
- **Column Navigation**: Use arrow buttons to navigate between columns
- **Auto-Advance**: Enable automatic scrolling with adjustable speed
- **Back Button**: Return to the home page

## Data Storage

All data is stored in your browser's localStorage. Your texts and folders will persist across sessions, but are tied to your specific browser and domain.

## Technologies

- React 18
- Vite
- LocalStorage API
- Custom CSS utilities (Tailwind-inspired)

## Splitting a song into stems

The Tracks panel can send a song to [LALAL.AI](https://www.lalal.ai/) and get the
vocal and the backing back as separate stems.

The licence key stays on the server, in the Vercel functions under `api/lalal/`,
because a key in the browser bundle could be read and spent by anyone visiting
the site. To enable the feature, set these Vercel environment variables:

| Variable | Purpose |
| --- | --- |
| `LALAL_LICENSE_KEY` | Your LALAL.AI licence key |
| `VITE_SUPABASE_URL` | Already set for the app; the functions reuse it to save finished stems |
| `VITE_SUPABASE_ANON_KEY` | As above |

Until `LALAL_LICENSE_KEY` is set the panel shows "Not set up" and splitting is
unavailable. The rest of the app is unaffected.

Songs are uploaded to the `stems` bucket first and streamed to LALAL.AI from
there, because Vercel caps request bodies at 4.5MB. The finished stems are
copied back into the bucket, since LALAL.AI's own result URLs expire.

## Backing tracks from a YouTube link

Paste a YouTube URL into a song and tick "Fetch this track and split it into
vocals and backing". The song is saved straight away and the work is queued.

The work happens on your own machine, for two reasons. YouTube refuses
datacenter addresses: a download from a cloud host gets `429 Too Many
Requests` and then "Sign in to confirm you're not a bot". And the separation
runs in [StemDeck](https://github.com/stemdeckapp/stemdeck), a local service on
127.0.0.1 that a deployed function could never reach. Splitting is therefore
local, free, and needs no licence key.

### One-time setup

Install StemDeck and run the backing track jobs section of
`supabase-schema.sql`, then create a `.env` in the repo with the same two
values the app uses:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

### Running it

StemDeck has to be up first, then:

```bash
npm run fetch-songs             # watch for new jobs
npm run fetch-songs -- --once   # take one job and stop
```

The fetcher checks StemDeck is reachable before it starts, so a missing
service fails immediately rather than halfway through a song. Progress shows
in the Tracks panel of the song, and Demucs takes a minute or so per song.

| Variable | Default | What it does |
| --- | --- | --- |
| `STEMDECK_URL` | `http://127.0.0.1:8000` | Where StemDeck is listening |
| `POLL_SECONDS` | `20` | How often to look for new jobs |
| `STEMDECK_CLEANUP` | off | Set to `1` to delete each StemDeck job once its stems are safely in Supabase |

To have it start at login, point launchd agents at StemDeck and at
`npm run fetch-songs` in this directory. Both need to be running: the fetcher
is inert without StemDeck.
