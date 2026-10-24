# Chemo Nerve Check

A phone-based **digital twin of walking, balance, and hand function during chemotherapy**. Before each infusion, a patient does a two-minute check-in on their phone. A state-space model combines several noisy measurements into one estimate of how much function has changed since their first check-in, with an uncertainty range, and shows it next to the nerve symptoms they report and their tumor measurements from radiology reports, including when two doctors read the same scan differently.

**What it does not claim:** the phone measures function, not nerves. Walking, balance, and hand function can change because of chemotherapy-induced neuropathy, but also because of fatigue, anemia, pain, deconditioning, or other causes. The goal is to surface changes early so the care team can examine the patient and decide what they mean.

Built for Gator Hack V (an official MLH Hack Day).

**AI model:** Gemma 4, specifically **`gemma-4-26b-a4b-it`** (Gemma 4 26B A4B, instruction-tuned), called through the Gemini API (Google AI Studio). Set `GEMMA_MODEL=gemma-4-31b-it` to use the 31B model instead.

## The problem

Many chemotherapy drugs (taxanes, platinum drugs, vinca alkaloids, bortezomib) damage the nerves in the feet and hands. This is called chemotherapy-induced peripheral neuropathy. It causes numbness, unsteady walking, falls, and trouble with buttons and small objects. Oncologists often lower the dose or pause treatment because of it, but it's usually assessed with a quick question at the infusion visit, and patients tend to under-report it between visits.

## What it does

1. **Check-in (about 2 minutes, before each infusion)**
   - Symptom ratings (0–10) for feet and hands, trouble with small objects, falls or near-falls
   - **30-second walk** with the phone in a front pocket: cadence, step-time variability, step regularity, hesitations
   - **20-second stance**, feet together, eyes open, then optionally eyes closed (Romberg-style): body sway and the eyes-closed/eyes-open sway ratio
   - **10-second finger-tapping test per hand** on the touchscreen: tap rate, rhythm steadiness, accuracy
2. **Function twin:** a Kalman-filter model whose hidden state is "change in function since baseline" (0–100). Each chemo cycle adds expected stress (process model); each signal is a noisy observation weighted by how reliable it tends to be. The twin shows its estimate, an uncertainty range, what it expected before each check-in, and flags check-ins that were **worse than expected**. When signals disagree (for example symptoms rise but walking is steady), it says so.
3. **What you can see:** a body map whose feet and hands glow with reported symptoms, and two walking figures that replay the real step timing of the baseline and the selected check-in.
4. **Scan reports:** paste, upload (PDF or text), or photograph a radiology report. Gemma 4 extracts each measured spot, its size, the previous size, and the radiologist's conclusion. **Every size is checked against the report text, and anything that doesn't appear word for word is dropped.** Tumor size is plotted on the same timeline as the function twin.
5. **Two doctors, one scan:** reports of the same scan within 7 days are compared lesion by lesion (similar, measured differently, only in one report, new finding or not). Gemma explains the differences neutrally and suggests questions. It never says which doctor is right.
6. **Report for the care team:** Gemma writes a patient summary, a twin summary, a scans summary, a clinician summary, and questions for the next visit. It can be printed or saved as PDF.

### Where the AI is and isn't used

| Job | Done by |
| --- | --- |
| Step detection, sway, tapping metrics | Deterministic signal processing (`public/gait.js`) |
| Which changes get flagged | Fixed rules (`public/trends.js`) |
| Function change estimate | Kalman filter (`public/nervetwin.js`) |
| Reading radiology reports, including photos | **Gemma 4**, with every number verified against the text (`lib/scans-ai.js`) |
| Plain-language explanations, opinion comparison, care-team report | **Gemma 4** (`lib/explain.js`) |

Gemma never diagnoses, grades neuropathy, weighs tumor response against side effects, or advises on dosing. Without an API key, the app still works using built-in rules and templates, and labels them clearly as such.

## What's new (the recent technology)

- **Gemma 4** (released April 2, 2026, Apache 2.0): its native image understanding reads photos of printed radiology reports, and its small, efficient sizes make an open, low-cost explanation layer possible.
- The test design follows **NeuroDetect** (JMIR, 2025), a smartphone study in chemotherapy patients against a specialist's neurological exam. There, phone gait and balance tests detected foot neuropathy (AUC about 0.84), Romberg-style stance contributed most for feet, and finger tapping contributed most for hands (hand detection was not statistically significant).

## Run it

Requires Node 18 or newer. No packages to install.

```bash
export GEMINI_API_KEY=your_key_from_aistudio.google.com   # optional; without it, templates are used
node server.js
# open http://localhost:3000 and click "See a demo patient"
```

Phones only share motion sensors with **https** pages. To test on a phone, either deploy (below) or run a tunnel such as `npx localtunnel --port 3000` and open the https link on the phone.

### Deploy (Vercel, free)

1. Push this folder to a public GitHub repository.
2. Import the repository at vercel.com. No build command is needed; `vercel.json` serves `public/` and the functions in `api/`.
3. In the project's settings, add the environment variable `GEMINI_API_KEY`.
4. Open the deployed https link on your phone.

Never commit your API key. It is only read on the server.

## Tests

```bash
node test/gait.test.js     # step detection, variability, asymmetry, pauses, balance, rejection of bad recordings
node test/twin.test.js     # function twin: steady patient, sudden decline flagged, disagreement handling
node test/gemma.test.js    # Gemma request shape, JSON parsing, hallucination guard, fallbacks (simulated API)
```

### Validating step detection on real data

`test/validate.js` runs the step detector on any accelerometer CSV and compares it with a true step count or cadence:

```bash
node test/validate.js trial.csv --steps 52 --time t --ax accX --ay accY --az accZ --time-unit s --accel-unit g
```

- **Your own phone:** walk exactly 40 counted steps with the phone in your pocket and compare the step count the app reports.
- **WearGait-PD** (open dataset, Scientific Data, February 2026, CC BY 4.0): export a thigh or pocket-position IMU trial to CSV and pass the walkway reference cadence. Check the dataset documentation for sensor positions and column names. These are older adults with and without Parkinson's, not chemotherapy patients, so this validates the step detector only.

## Limitations (please read)

- **Not a medical device, and not clinically validated.** The twin's parameters (expected change per cycle, each signal's noise, scale conversions) are reasonable starting values chosen for this prototype. Calibrating them requires repeated measurements from real chemotherapy patients compared with a neurological exam.
- Phone measurements depend on pocket placement, shoes, floor, and phone model. They are only meaningful compared with the same person's earlier check-ins on the same phone.
- The symptom questions are simple 0–10 ratings. A real deployment should use a validated questionnaire such as the EORTC QLQ-CIPN20 (licensed) or the NCI's PRO-CTCAE items.
- The eyes-closed stance can be unsafe for people with severe neuropathy. It is optional, and the app tells people to do it next to support.
- Apple Watch and other wearables can't be read by a website. A native app using HealthKit would be the next step.
- Data stays in the browser's local storage on the device. Reports and scan text are sent to the server only when the patient asks for a report or an extraction, and from there to the Gemini API.
- Demo patient data is simulated, and demo scan reports are fictional.

## Project layout

```
public/         the website (no build step)
  gait.js         walking, balance, and tapping analysis
  nervetwin.js    the Kalman-filter function twin
  trends.js       rule-based change flags
  scans.js        report parsing, number verification, comparing two reads
  twin.js         SVG drawing: body map, walkers, charts
  app.js          screens and flow
lib/            server-side Gemma 4 calls
api/            Vercel serverless functions
server.js       local server
test/           tests and the validation script
```

## License

MIT. See `LICENSE`.
