# NYC Walking Visualizer

A minimalist dark-themed map visualizer for your NYC walking routes. Built with Next.js, Mapbox, and deck.gl.

## Features

- **Dark minimalist aesthetic** - Inspired by Vercel's design language
- **GPX file support** - Drop your GPX files into the `public/gpx` folder
- **Interactive map** - Click on routes to see details
- **Overlap handling** - When multiple routes overlap, select from a popup menu
- **Keyboard navigation** - Use arrow keys to cycle through walks
- **Statistics** - View total walks, distance, and time

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Mapbox

Create a `.env.local` file with your Mapbox token:

```
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_token_here
```

Get a free token at [mapbox.com](https://mapbox.com)

### 3. Add your GPX files

Place your GPX files in the `public/gpx/` directory. The app will automatically load and display them.

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see your walks visualized.

## Keyboard Shortcuts

- **Arrow keys** - Navigate between walks
- **Escape** - Deselect current walk

## Tech Stack

- **Next.js 14+** - React framework with App Router
- **Mapbox GL** - Dark-themed map tiles
- **deck.gl** - GPU-accelerated route rendering
- **Framer Motion** - Smooth animations
- **Tailwind CSS** - Styling
- **@tmcw/togeojson** - GPX parsing

## Project Structure

```
ny-walking-visualiser/
├── src/
│   ├── app/
│   │   ├── api/gpx/route.ts  # API to list GPX files
│   │   ├── globals.css       # Dark theme styles
│   │   ├── layout.tsx        # Root layout
│   │   └── page.tsx          # Main page
│   ├── components/
│   │   ├── Header.tsx        # Stats header
│   │   ├── Map.tsx           # Mapbox + deck.gl map
│   │   ├── OverlapSelector.tsx
│   │   ├── RoutePanel.tsx    # Route details panel
│   │   └── KeyboardShortcuts.tsx
│   └── lib/
│       ├── gpx-parser.ts     # GPX parsing utilities
│       ├── types.ts          # TypeScript types
│       ├── utils.ts          # Helper functions
│       └── WalksContext.tsx  # State management
└── public/
    └── gpx/                  # Your GPX files go here
```

## License

MIT
