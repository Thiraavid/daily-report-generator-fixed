# Daily Report Generator

A simple React + Vite project to create your daily report in the same format as your Excel screenshot.

## Features

- Add multiple tasks for one day
- Click **Add This Day To File** to save that date into the same report
- Add the next day and continue
- Download the full report as:
  - Excel file
  - Screenshot image
- Data is stored in browser localStorage, so refresh will not remove saved days

## Tech Stack

- React
- Vite
- xlsx
- html2canvas
- lucide-react

## How to run

### 1) Extract the zip
Unzip the project folder.

### 2) Open terminal inside the project folder
Example:
```bash
cd daily-report-generator
```

### 3) Install dependencies
```bash
npm install
```

### 4) Start the project
```bash
npm run dev
```

### 5) Open in browser
Vite will show a local URL like:
```bash
http://localhost:5173
```

## How to use

1. Enter your name
2. Fill task details for one date
3. Click **Add Task** to add more rows for the same day
4. After finishing that day, click **Add This Day To File**
5. Then enter the next day's report
6. Click **Download Excel** to get the full combined file
7. Click **Download Screenshot** to save the preview as image

## Build for production

```bash
npm run build
```

## Notes

- **Clear All** removes saved data from the browser
- Time formats supported:
  - `3 hrs`
  - `1 hr`
  - `30 mins`
  - `2 hr 30 min`

## Folder structure

```text
daily-report-generator/
├── index.html
├── package.json
├── vite.config.js
├── README.md
└── src/
    ├── App.jsx
    ├── main.jsx
    └── styles.css
```


## Fixed issues in this build
- Empty rows no longer appear after clicking Add This Day To File
- Screenshot now captures only the report table area
- Same report UI is used for preview and screenshot
- Daily entries continue in the same combined file during the session
