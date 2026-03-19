# NBME Mastery

A USMLE Step 1 NBME-style practice exam application built with React, TypeScript, and Tailwind CSS.

## Features

- 📚 Timed exam blocks mimicking real NBME format
- ✅ Immediate feedback with detailed explanations
- 🧠 Review deck for flagged/incorrect questions
- 🧮 Built-in calculator and lab values reference
- 📊 Results tracking with topic breakdown
- 💾 Progress saves automatically via localStorage

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment to GitHub Pages

This repo is configured for automatic GitHub Pages deployment:

### Option 1: Automatic (Recommended)
1. Push this code to a GitHub repository
2. Go to **Settings → Pages**
3. Under "Build and deployment", select **GitHub Actions**
4. Push to `main` branch — it will auto-deploy!

Your app will be live at: `https://YOUR_USERNAME.github.io/nbme-mastery/`

### Option 2: Manual Deploy
```bash
# Build for GitHub Pages
npm run build:gh-pages

# The dist/ folder contains your static site
# Upload it to any static host (Netlify, Vercel, etc.)
```

## Adding Your Own Questions

Edit `src/data/demoExam.ts` to add your questions. Each question follows this format:

```typescript
{
  id: 1,
  stem: "Question text here...",
  image: null, // or URL to image
  options: { A: "...", B: "...", C: "...", D: "...", E: "..." },
  correct: "C",
  topic: "Cardiology",
  explanation_structured: {
    bottom_line: "Key takeaway",
    remember_as: "Memory hook",
    watch_out: ["Distractor 1", "Distractor 2"],
    high_yield: ["Term 1", "Term 2"]
  },
  explanation_full: "Detailed explanation..."
}
```

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui components
- React Router (HashRouter for GitHub Pages compatibility)

## License

Built for personal educational use.
