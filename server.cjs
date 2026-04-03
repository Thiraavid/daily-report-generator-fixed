const express = require("express");
const cors = require("cors");
const path = require("path");
const XLSX = require("xlsx-js-style");
const multer = require("multer");
const upload = multer();

const app = express();
app.use(cors());
app.use(express.json());

// Serve built frontend
app.use(express.static(path.join(__dirname, "dist")));

// In-memory store
let reportSections = [];

function parseHours(value) {
  if (!value) return 0;
  const cleaned = String(value).toLowerCase().trim();
  const hourMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(hr|hrs|hour|hours)/);
  const minuteMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes)/);
  let total = 0;
  if (hourMatch) total += parseFloat(hourMatch[1]);
  if (minuteMatch) total += parseFloat(minuteMatch[1]) / 60;
  if (!hourMatch && !minuteMatch) {
    const n = cleaned.match(/\d+(?:\.\d+)?/);
    if (n) total = parseFloat(n[0]);
  }
  return Number.isFinite(total) ? total : 0;
}

function formatHours(value) {
  const total = typeof value === "number" ? value : parseHours(value);
  if (!total) return "";
  const hours = Math.floor(total);
  const minutes = Math.round((total - hours) * 60);
  if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`;
  if (hours > 0) return hours === 1 ? "1 hr" : `${hours} hrs`;
  return `${minutes} mins`;
}

function toDisplayDate(value) {
  if (!value) return value;
  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) return value;
  const [yyyy, mm, dd] = value.split("-");
  if (yyyy && mm && dd) return `${dd}-${mm}-${yyyy}`;
  return value;
}

const EXPECTED_HEADERS = ["task assigned date", "task", "project", "status", "timetaken", "total hours"];

function parseExcelSections(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Find header row
  const headerRowIndex = raw.findIndex((row) =>
    EXPECTED_HEADERS.every((h) => row.some((cell) => String(cell).toLowerCase().trim() === h))
  );
  if (headerRowIndex === -1) return null; // invalid file

  const dataRows = raw.slice(headerRowIndex + 1);
  const sections = [];
  let current = [];
  let lastDate = null;

  dataRows.forEach((row) => {
    const hasData = row.some((cell) => String(cell).trim() !== "");
    const rowDate = String(row[0] || "").trim();
    if (hasData) {
      if (lastDate && rowDate && rowDate !== lastDate) {
        sections.push(current);
        current = [];
      }
      current.push(row);
      if (rowDate) lastDate = rowDate;
    } else if (current.length > 0) {
      sections.push(current);
      current = [];
      lastDate = null;
    }
  });
  if (current.length > 0) sections.push(current);

  return sections.map((group, gi) => {
    const rows = group.map((r) => ({
      date: toDisplayDate(String(r[0] || "")),
      task: String(r[1] || ""),
      project: String(r[2] || ""),
      status: String(r[3] || "Completed"),
      timeTaken: String(r[4] || ""),
    }));
    const total = rows.reduce((s, r) => s + parseHours(r.timeTaken), 0);
    return {
      id: `uploaded-${gi}-${Date.now()}`,
      date: rows[0]?.date || "",
      rows,
      totalHours: String(group[0]?.[5] || "") || (total > 0 ? formatHours(total) : "0 mins"),
    };
  });
}

// POST /api/upload — upload existing Excel and merge into memory
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const parsed = parseExcelSections(req.file.buffer);
  if (parsed === null) return res.status(422).json({ error: "INVALID_FORMAT" });

  if (parsed.length === 0) {
    // Empty valid file — just accept, no merge needed
    return res.json({ success: true, merged: 0, message: "Empty file accepted" });
  }

  // Merge: skip sections whose date already exists in memory
  const existingDates = new Set(reportSections.map((s) => s.date));
  const newSections = parsed.filter((s) => !existingDates.has(s.date));
  reportSections = [...reportSections, ...newSections];

  res.json({ success: true, merged: newSections.length, skipped: parsed.length - newSections.length });
});

// GET /api/report
app.get("/api/report", (req, res) => {
  res.json({ sections: reportSections });
});

// POST /api/report — append new day section
app.post("/api/report", (req, res) => {
  const { date, rows, totalHours } = req.body;
  if (!rows || rows.length === 0) return res.status(400).json({ error: "No rows provided" });

  const id = `section-${Date.now()}`;
  reportSections.push({
    id,
    date: toDisplayDate(date),
    rows: rows.map((r) => ({ ...r, date: toDisplayDate(r.date) })),
    totalHours,
  });

  res.json({ success: true });
});

// GET /api/download — generate and return Excel file
app.get("/api/download", (req, res) => {
  const allRows = [["Task Assigned Date", "Task", "Project", "Status", "Timetaken", "Total Hours"]];

  reportSections.forEach((section, si) => {
    if (si > 0) {
      allRows.push(["", "", "", "", "", ""]);
      allRows.push(["", "", "", "", "", ""]);
    }
    section.rows.forEach((row, i) => {
      allRows.push([
        toDisplayDate(row.date),
        row.task,
        row.project,
        row.status,
        formatHours(row.timeTaken),
        i === 0 ? section.totalHours : "",
      ]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(allRows);
  ws["!cols"] = [{ wch: 18 }, { wch: 65 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];

  const headerStyle = {
    fill: { fgColor: { rgb: "2F6E1A" } },
    font: { color: { rgb: "FFFFFF" }, bold: true },
    alignment: { horizontal: "center" },
    border: {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } },
    },
  };
  ["A1", "B1", "C1", "D1", "E1", "F1"].forEach((cell) => {
    if (!ws[cell]) ws[cell] = { t: "s", v: "" };
    ws[cell].s = headerStyle;
  });

  const dataStyle = {
    border: {
      top: { style: "thin", color: { rgb: "94A3B8" } },
      bottom: { style: "thin", color: { rgb: "94A3B8" } },
      left: { style: "thin", color: { rgb: "94A3B8" } },
      right: { style: "thin", color: { rgb: "94A3B8" } },
    },
    fill: { fgColor: { rgb: "F1F5F9" } },
  };
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let R = 1; R <= range.e.r; R++) {
    for (let C = 0; C <= 5; C++) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellRef]) ws[cellRef] = { t: "s", v: "" };
      if (String(ws[cellRef].v || "").trim() !== "") ws[cellRef].s = dataStyle;
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Timesheet");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=daily-report-dashboard.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
});

// DELETE /api/report — clear all in-memory data
app.delete("/api/report", (req, res) => {
  reportSections = [];
  res.json({ success: true });
});

// Fallback to React app
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
