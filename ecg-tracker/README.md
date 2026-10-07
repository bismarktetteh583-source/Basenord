# ECG Usage Tracker

A simple, offline-friendly web app for tracking Electricity Company of Ghana (ECG) usage.

- Log meter readings → daily/monthly kWh and estimated cost
- Log prepaid top-ups (GH₵ paid vs units received, effective rate)
- 30-day usage chart, projected monthly bill, optional monthly budget
- Prepaid remaining balance (top-ups − usage, with calibration to your meter's displayed units) and days left
- History of all past records, filterable by type and month
- JSON backup/restore and CSV export; all data stays in your browser (localStorage)

## Run
Open `index.html` in a browser, or `python3 -m http.server` in this folder.

## Notes
The default tariff (GH₵ 1.90/kWh) is a placeholder — set the current PURC/ECG rate for your customer class under **Settings**. Costs are estimates and ignore tiered rates, levies and taxes.
