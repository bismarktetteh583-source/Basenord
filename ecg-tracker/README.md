# ECG Usage Tracker

A simple, offline-friendly web app for tracking Electricity Company of Ghana (ECG) usage.

- Log meter readings (cumulative kWh) **or** remaining-balance checks from a prepaid meter → daily/monthly kWh and estimated cost
- Log prepaid top-ups (GH₵ paid vs units received, effective rate)
- 30-day usage chart, projected monthly bill, optional monthly budget
- Prepaid remaining balance (top-ups − usage, with calibration to your meter's displayed units) and days left
- History of all past records, filterable by type and month
- JSON backup/restore and CSV export; all data stays in your browser (localStorage)

- Works offline and installs to your phone's home screen (PWA)
- Low-balance alerts (days or kWh left), in-app banner plus optional notification

## Run
Open `index.html` in a browser, or `python3 -m http.server` in this folder.

## Notes
The default tariff (GH₵ 1.90/kWh) is a placeholder — set the current PURC/ECG rate for your customer class under **Settings**. Costs are estimates and ignore tiered rates, levies and taxes.

## Offline / install
The service worker needs `https://` or `localhost` (it won't register from `file://`). Host the folder (e.g. GitHub Pages), open it once online, then use *Add to Home screen*. Notifications only fire while the app is open; there is no server to push alerts when it is closed.
