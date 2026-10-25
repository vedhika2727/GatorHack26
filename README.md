# Chemo Nerve Check

A React web app that helps people on chemotherapy notice and share changes in their **walking, balance, and hand function** between infusions, next to the nerve symptoms they report and how their tumor is responding on scans.

Built for Gator Hack V (an official MLH Hack Day).

**AI model:** Gemma 4, specifically **`gemma-4-26b-a4b-it`** (Gemma 4 26B A4B, instruction-tuned), called through the Gemini API (Google AI Studio). Set `GEMMA_MODEL=gemma-4-31b-it` to use the 31B model.

## The problem

Many chemotherapy drugs (taxanes, platinum drugs, vinca alkaloids, bortezomib) can damage the nerves in the feet and hands: chemotherapy-induced peripheral neuropathy. It shows up as numbness, unsteady walking, falls, and clumsy hands. Oncologists may lower or pause the dose because of it, but between infusions it is usually checked with a quick question at the visit, and patients tend to under-report it.

## What it does

- **Home page and accounts:** a landing page, sign up / sign in with email and password (Supabase), an on-device profile option with no password, and a demo patient.
- **Check-in (about 2 minutes):** symptom ratings (0–10 buttons), a 30-second walk with the phone in a pocket, a 20-second stance with eyes open and optionally eyes closed (Romberg-style), and a 10-second finger-tapping test per hand.
- **Function twin:** a Kalman-filter model that fuses eight noisy signals into one estimate (0–100) of how much function has changed since the first check-in, with an uncertainty range. It flags check-ins that are **worse than it expected** and explains when signals disagree.
- **What you can see:** a body map that glows with reported symptoms, walking figures that replay the real step rhythm (baseline vs. now), and every measurement over time.
- **Scan reports:** paste, upload (PDF or text), or photograph a radiology report. Gemma 4 extracts each measurement and the radiologist's conclusion. **Every size is checked against the report text, and anything not found word for word is dropped.** Tumor size is plotted next to the twin.
- **Two doctors, one scan:** reports of the same scan within 7 days are compared lesion by lesion, and Gemma explains the differences neutrally without picking a side.
- **Care-team report:** patient summary, twin summary, scans, clinician summary, and questions for the next visit. Copy or print it.

### What it does not claim

The phone measures **function, not nerves**. Walking, balance, and hand function can change from neuropathy, but also from fatigue, anemia, pain, deconditioning, or other causes. The app never diagnoses, grades neuropathy, weighs tumor response against side effects, or suggests treatment changes.

### Where the AI is and isn't used

| Job | Done by |
| --- | --- |
| Step detection, sway, tapping metrics | Signal processing (`src/core/gait.js`) |
| Which changes get flagged | Fixed rules (`src/core/trends.js`) |
| Function change estimate | Kalman filter (`src/core/twin.js`) |
| Reading radiology reports, including photos | **Gemma 4**, every number verified against the text (`lib/scans-ai.js`) |
| Plain-language explanations, two-doctor comparison, care-team report | **Gemma 4** (`lib/explain.js`) |

Without a Gemma key, the app still runs using built-in rules and template text, labeled as such.

## What's new (the recent technology)

- **Gemma 4** (released April 2, 2026, Apache 2.0) reads photos of printed reports and writes the explanations.
- The test design follows **NeuroDetect** (JMIR, 2025), a smartphone study in chemotherapy patients compared against specialists' neurological exams. Phone gait and balance tests detected foot neuropathy (AUC about 0.84); Romberg-style stance contributed most for feet and finger tapping most for hands (hand detection was not statistically significant).

## Run it

Requires Node 18 or newer.

```bash
npm install
cp .env.example .env        # then fill in GEMINI_API_KEY (from aistudio.google.com)
npm run dev                 # app + Gemma API on http://localhost:5173
```

Production build:

```bash
npm run build
npm start                   # serves dist/ and the API on http://localhost:3000
```

Phones only share motion sensors with **https** pages. To test the walk and balance tests on a phone, deploy (below) or use a tunnel such as `npx localtunnel --port 5173`.

### Real accounts (optional, Supabase)

1. Create a free project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql`. It creates one table with row-level security so each person sees only their own data.
3. Copy the project URL and anon key (Project settings → API) into `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Optional for a demo: in Authentication → Providers → Email, turn off "Confirm email" so new accounts can sign in right away.

Without these keys the app offers an on-device profile instead. This is health data: fine for a hackathon demo, but real patient use would need a HIPAA-ready setup, consent, and a security review.

### Deploy (Vercel)

1. Push to a public GitHub repo and import it at vercel.com (it detects Vite).
2. Add environment variables: `GEMINI_API_KEY`, and if using accounts, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Open the https link on your phone.

The Gemma key is only read on the server and never reaches the browser. Never commit `.env`.

## Tests

```bash
npm test                    # step detection, twin model, Gemma request/fallback handling (simulated API)
node test/validate.js trial.csv --steps 52 --time t --ax accX --ay accY --az accZ --time-unit s --accel-unit g
```

`validate.js` checks step detection against real accelerometer recordings, for example a trial from the open **WearGait-PD** dataset (Scientific Data, 2026, CC BY 4.0) or your own phone walking a counted number of steps.

## Project layout

```
src/
  core/         framework-free logic: gait.js, twin.js, trends.js, scans.js, demo data
  screens/      Landing, Auth, Home, CheckIn, Twin, ScansScreen, Report, Account
  components/   Icon, Chip, Logo, Confirm dialog, Viz (chart wrappers)
  viz/draw.js   SVG drawing: body map, walkers, charts
  lib/          sensors, file reading, API calls with fallbacks, formatting
  store.jsx     accounts (Supabase / device / demo) and data
lib/            server-side Gemma 4 calls and API routes
api/            Vercel serverless functions
server.js       production server
supabase/       database schema
test/           tests and validation script
```

## Limitations

- Not a medical device and not clinically validated. The twin's parameters are reasonable starting values, not calibrated on patients.
- Phone measurements depend on pocket placement, shoes, floor, and phone model; compare only with the same person's earlier check-ins.
- Symptom questions are simple 0–10 ratings. A real deployment should license a validated questionnaire such as the EORTC QLQ-CIPN20.
- The eyes-closed stance is optional and can be unsafe for people with severe neuropathy.
- Websites can't read Apple Watch sensors; a native app with HealthKit would be the next step.

## License

MIT. See `LICENSE`. The Archivo typeface (`src/assets/archivo-wdth.woff2`) is by Omnibus-Type and licensed under the SIL Open Font License 1.1.
