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
