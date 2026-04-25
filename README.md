# Technical News Hub

Technical News Hub is a React and Node.js application for aggregating, classifying, searching, and managing domain-specific technical news.

## Features

- Animated responsive newsroom interface
- Category-based technical news feed
- Search, filtering, and newest/oldest sorting
- Saved article reading list
- Article detail modal with source links
- Admin login, dashboard metrics, sync action, and system logs
- Rule-based article classification by domain
- Weighted article classification with exact keyword matching
- Local application cache with optional NewsAPI integration

## Tech Stack

- Frontend: React.js and JavaScript
- Backend: Node.js REST API
- Database layer: Local JSON cache for immediate execution, with MongoDB-ready configuration messaging
- API integration: NewsAPI-compatible sync through `NEWS_API_KEY`

## Run

```powershell
cd "C:\Users\matis\OneDrive\Desktop\Coding\Technical-New-Hub"
npm start
```

Open `http://localhost:3000`.

On Windows, you can also double-click `START_TECHNICAL_NEWS_HUB.bat` from the extracted folder. Do not run it from inside the ZIP preview; extract the ZIP first.

## Admin

- Username: `admin`
- Password: `admin123`

## Optional Live News

To connect live NewsAPI data, create a `.env` file in the project folder:

```text
NEWS_API_KEY=your_newsapi_key_here
AUTO_SYNC_ENABLED=true
AUTO_SYNC_SOURCE=all-technology
AUTO_SYNC_HOURS=0,8,16
```

Then restart the server.

Automatic sync runs three times per day by default at local time `00:00`, `08:00`, and `16:00`.

- `AUTO_SYNC_ENABLED`: set to `false` to disable automation.
- `AUTO_SYNC_SOURCE`: choose any source id from the app (for example `all-technology`, `bbc-news`, `techcrunch`, `the-verge`, `ars-technica`).
- `AUTO_SYNC_HOURS`: comma-separated local hours (0-23). Keep exactly three values for 3 runs/day.

You can still trigger a manual import from the Admin dashboard at any time.

## MongoDB Storage

By default, the app uses the local JSON cache at `data/db.json`.

To store data in MongoDB, add these values to `.env`:

```text
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=technical_news_hub
MONGODB_COLLECTION=app_state
```

Then restart the server.

- If MongoDB connects successfully, all app state is read/written to MongoDB.
- If MongoDB is unavailable, the app automatically falls back to local JSON storage.
- On first MongoDB run, existing local data from `data/db.json` is migrated to MongoDB automatically when available.

## Personal Profiles

Each browser session starts with a local guest profile, so saved articles and feed preferences stay tied to that person.

- Use the Profile view to change display name and default feed settings.
- Create a named account to keep saved articles and preferences separate from other users.
- Signing out creates a fresh local profile on the device.

Imported articles are filtered for technology relevance, then classified into AI, Software Development, Cybersecurity, Data Science, Cloud Computing, or General Technology.

Supported source imports include:

- All Technology Sources
- BBC News
- TechCrunch
- The Verge
- Ars Technica

## Troubleshooting

- If `localhost:3000` does not open, keep the server window open and check whether it shows an error.
- If Node.js is missing, install it from `https://nodejs.org/`.
- If the app says the port is already in use, close the older server window or press `Ctrl+C` in it.
