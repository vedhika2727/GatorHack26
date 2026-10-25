# Notes for Claude Code

Chemo Nerve Check: React (Vite) web app for people on chemotherapy. Read README.md first.

- Run: `npm install`, `npm run dev` (Vite serves the app and mounts the Gemma API routes from `lib/routes.js` via a plugin in `vite.config.js`). Tests: `npm test`.
- Plain JavaScript (no TypeScript), React 18, no UI library, no router library (hash-based views in `src/App.jsx`). Icons are hand-drawn in `src/components/Icon.jsx`.
- Design tokens live at the top of `src/styles.css`. Look: Apple Health style. Pale grey page (#F2F2F7), white cards without borders, white translucent header, no dark sections. Font: the system font stack (San Francisco on Apple devices). Black primary buttons with 10px corners (not pills), pink accents. Accent roles: navy = actions and the twin, forest = steady/improving, rose = scans/tumor and "worth mentioning", red = only "worse than expected" and safety.
- `src/core/` is framework-free and shared by the browser and the server. Keep it free of React and DOM code.
- Gemma 4 (`gemma-4-26b-a4b-it`) is only called server-side (`lib/`). The key is `GEMINI_API_KEY`; never expose it to the client or commit `.env`.
- Wording rule: the twin estimates change in walking, balance, and hand FUNCTION. Never describe it as measuring nerves or nerve damage, and never add diagnosis or treatment advice.
- Every measurement shown from a radiology report must pass `Scans.verify` (the number has to appear in the report text).
- `npm run preview-file` builds a single self-contained HTML file for hosted previews (no server, no sensors, template text instead of Gemma).
