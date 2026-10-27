# BaseNord Membership Tracker

Offline-friendly PWA for tracking when BaseNord packages end and getting reminded.

- Add members/bookings with a package, start date and length; the end date is worked out for you (last included day)
- Packages are editable: add, edit or delete your own, with default length and price (defaults come from the BaseNord space guide)
- Status badges (active / ending within 7 days / expired), search and filters, one-tap Renew
- Reminders N days before the end (default 7, 3, 1 and on the day): in-app banner plus optional phone notifications when the app is opened
- Download a `.ics` calendar file with an alarm for every ending date, for reminders that arrive even when the app is closed
- JSON backup/restore; all data stays on the device (localStorage)

## Run
Open `index.html`, or `python3 -m http.server` in this folder. Host over https (e.g. GitHub Pages) and use *Add to Home screen* to install.
