# Text Memorisation App

A minimalist tool for learning text through progressive revelation, with folder organization and local storage.

## Features

- **Progressive Text Revelation**: Gradually reveal text as you memorize it
- **Folder Organization**: Organize your texts into custom folders
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

1. **Create Folders**: Click the "+" button next to "Folders" in the sidebar to create new folders
2. **Add Texts**: Click "New Text" to add a new text to memorize
3. **Organize**: Use the dropdown on each text card to move it to a different folder
4. **Practice**: Click "Practice" on any text card to start practicing

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
