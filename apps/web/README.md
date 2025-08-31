# Xtracta OCR Web App

A modern, interactive OCR (Optical Character Recognition) web application built with Next.js 14, React 18, and TypeScript.

## Features

- **Drag & Drop Upload**: Easy file upload with drag-and-drop support
- **Interactive Canvas**: Click and drag to select areas for OCR processing
- **Real-time OCR**: Uses OCR.space API for text extraction
- **Visual Highlights**: Shows detected words and lines with colored overlays
- **Zoom & Rotate**: Full image manipulation controls
- **Responsive Design**: Works on desktop and mobile devices
- **Modern UI**: Built with Tailwind CSS for a clean, professional look

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Start the development server:
```bash
pnpm dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

### Usage

1. **Start Services**: Make sure both the web app and gateway service are running
2. **Upload an Image**: Drag and drop a PNG/JPG file or click "Choose File"
3. **Select Text Areas**: Click and drag on the image to create selection rectangles
4. **Process OCR**: Release the mouse to automatically process the selected area via the gateway
5. **View Results**: Hover over highlighted areas to see extracted text
6. **Manipulate Image**: Use the toolbar to zoom, rotate, or toggle highlights

### Environment Configuration

The app connects to the Gateway service for OCR processing. The gateway URL is hardcoded to `http://localhost:3001` for simplicity.

**Note**: For production deployments, you can modify the `GATEWAY_BASE_URL` constant in `src/components/ocr-demo.tsx` or use environment variables.

Make sure the Gateway service is running on port 3001.

## Development

### Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm test:gateway` - Test gateway integration

### Project Structure

```
src/
├── app/
│   ├── globals.css      # Global styles with Tailwind
│   ├── layout.tsx       # Root layout component
│   └── page.tsx         # Main page component
└── components/
    └── ocr-demo.tsx     # Main OCR demo component
```

## Technologies Used

- **Next.js 14** - React framework with App Router
- **React 18** - UI library with hooks
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **Canvas API** - For image manipulation and drawing
- **OCR.space API** - For text extraction

## License

MIT
