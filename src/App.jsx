import React, { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Plus, Trash2, Clock3, Save, FileSpreadsheet, ImageDown, RotateCcw, Upload } from "lucide-react";

const emptyRow = {
  date: "",
  task: "",
  project: "",
  status: "Completed",
  timeTaken: "",
};

const statusOptions = ["Completed", "Pending", "In Progress"];

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
  if (!value) return "";
  const [yyyy, mm, dd] = value.split("-");
  if (!yyyy || !mm || !dd) return value;
  return `${dd}-${mm}-${yyyy}`;
}

function hasMeaningfulRowData(row) {
  return Boolean(
    String(row?.date || "").trim() ||
    String(row?.task || "").trim() ||
    String(row?.project || "").trim() ||
    String(row?.timeTaken || "").trim()
  );
}

export default function App() {
  const [employeeName, setEmployeeName] = useState(
    () => localStorage.getItem("daily-report-employee-name") || ""
  );
  const [savedDays, setSavedDays] = useState([]);
  const [rows, setRows] = useState([{ ...emptyRow }]);
  const [status, setStatus] = useState("");
  const reportRef = useRef(null);

  // Load existing data from Excel via API on mount
  useEffect(() => {
    // Clear old localStorage data
    localStorage.removeItem("daily-report-saved-days");
    localStorage.removeItem("daily-report-current-rows");

    fetch("/api/report")
      .then((r) => r.json())
      .then((data) => setSavedDays(data.sections || []))
      .catch(() => setStatus("⚠️ Server not running. Start with: npm run server"));
  }, []);

  useEffect(() => {
    localStorage.setItem("daily-report-employee-name", employeeName);
  }, [employeeName]);

  const liveRows = useMemo(() => rows.filter(hasMeaningfulRowData), [rows]);

  const currentDayTotal = useMemo(() => {
    const total = liveRows.reduce((sum, row) => sum + parseHours(row.timeTaken), 0);
    return total > 0 ? formatHours(total) : "0 mins";
  }, [liveRows]);

  const groupedReportData = useMemo(() => {
    if (liveRows.length === 0) return [];
    const liveTotal = liveRows.reduce((sum, row) => sum + parseHours(row.timeTaken), 0);
    return [{
      id: "live-preview",
      date: liveRows[0]?.date || "",
      rows: liveRows.map((row) => ({ ...row, timeTaken: formatHours(row.timeTaken) })),
      totalHours: liveTotal > 0 ? formatHours(liveTotal) : "0 mins",
    }];
  }, [liveRows]);

  function addRow() {
    setRows((prev) => [...prev, { ...emptyRow }]);
  }

  function deleteRow(index) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index, field, value) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  const uploadRef = useRef(null);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    const formData = new FormData();
    formData.append("file", file);
    setStatus("Uploading...");
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "INVALID_FORMAT")
          setStatus("❌ Invalid file. Upload only the Excel downloaded from this app.");
        else
          setStatus(`❌ Upload failed: ${JSON.stringify(data)}`);
        setTimeout(() => setStatus(""), 5000);
        return;
      }
      const report = await fetch("/api/report").then((r) => r.json());
      setSavedDays(report.sections || []);
      const msg = data.merged === 0
        ? "✅ File uploaded. No new sections to add (all already exist or file was empty)."
        : `✅ Uploaded! ${data.merged} section(s) merged.${data.skipped ? ` ${data.skipped} duplicate(s) skipped.` : ""}`;
      setStatus(msg);
      setTimeout(() => setStatus(""), 4000);
    } catch (err) {
      setStatus(`❌ Upload error: ${err.message}`);
      setTimeout(() => setStatus(""), 5000);
    }
  }

  async function saveCurrentDay() {
    const validRows = rows
      .filter(hasMeaningfulRowData)
      .map((row) => ({
        ...row,
        status: row.status || "Completed",
        timeTaken: formatHours(row.timeTaken),
      }));

    if (validRows.length === 0) {
      alert("Please enter at least one task before saving.");
      return;
    }

    const currentDate = validRows[0]?.date || "";
    const total = validRows.reduce((sum, row) => sum + parseHours(row.timeTaken), 0);
    const totalHours = total > 0 ? formatHours(total) : "0 mins";

    setStatus("Saving...");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: currentDate, rows: validRows, totalHours }),
      });

      if (!res.ok) {
        const err = await res.json();
        if (err.error === "FILE_OPEN") {
          setStatus("❌ Close daily-report-dashboard.xlsx in Excel first, then try again.");
        } else {
          setStatus(`❌ Server error: ${JSON.stringify(err)}`);
        }
        setTimeout(() => setStatus(""), 6000);
        return;
      }

      // Reload from server
      const data = await fetch("/api/report").then((r) => r.json());
      setSavedDays(data.sections || []);
      setStatus(`✅ Saved! ${validRows.length} task(s) added to daily-report-dashboard.xlsx`);
      setTimeout(() => setStatus(""), 3000);
    } catch (err) {
      setStatus(`❌ Failed to save: ${err.message}. Make sure server is running: npm run server`);
    }
  }

  async function clearAllData() {
    const ok = window.confirm("Clear all data including uploaded sections?");
    if (!ok) return;
    setRows([{ ...emptyRow }]);
    setSavedDays([]);
    setStatus("");
    await fetch("/api/report", { method: "DELETE" }).catch(() => {});
  }

  async function downloadScreenshot() {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: -window.scrollY,
    });
    const link = document.createElement("a");
    link.download = "daily_report.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    setSavedDays([]);
    setRows([{ ...emptyRow }]);
  }

  return (
    <div className="app-shell">
      <div className="page">
        <div className="hero">
          <div>
            <p className="eyebrow">Daily Report Generator</p>
            <h1>Fill tasks. Save. Done. Auto-writes to your Excel file.</h1>
            <p className="hero-text">
              Data is saved directly into <strong>daily-report-dashboard.xlsx</strong> on your computer.
            </p>
          </div>
          <div className="hero-stat">
            <Clock3 size={18} />
            <span>Current Day Total: {currentDayTotal}</span>
          </div>
        </div>

        {status && (
          <div className="toast" style={{ background: status.startsWith("❌") ? "#b91c1c" : "#166534" }}>
            {status}
          </div>
        )}

        <div className="layout">
          <section className="card">
            <div className="card-header">
              <h2>Daily Report Input</h2>
              <p>Fill tasks and click Save to write directly into your Excel file.</p>
            </div>

            <div className="field-group">
              <label>Employee Name</label>
              <input
                className="text-input"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>

            <div className="rows-stack">
              {rows.map((row, index) => (
                <div key={index} className="task-card">
                  <div className="task-card-top">
                    <h3>Task {index + 1}</h3>
                    {rows.length > 1 && (
                      <button className="ghost-btn" onClick={() => deleteRow(index)}>
                        <Trash2 size={16} /> Delete
                      </button>
                    )}
                  </div>
                  <div className="task-grid">
                    <div className="field-group">
                      <label>Task Assigned Date</label>
                      <input
                        type="date"
                        className="text-input"
                        value={row.date}
                        onChange={(e) => updateRow(index, "date", e.target.value)}
                      />
                    </div>
                    <div className="field-group">
                      <label>Project</label>
                      <input
                        className="text-input"
                        value={row.project}
                        onChange={(e) => updateRow(index, "project", e.target.value)}
                        placeholder="Enter project name"
                      />
                    </div>
                    <div className="field-group full-width">
                      <label>Task</label>
                      <input
                        className="text-input"
                        value={row.task}
                        onChange={(e) => updateRow(index, "task", e.target.value)}
                        placeholder="Enter task details"
                      />
                    </div>
                    <div className="field-group">
                      <label>Status</label>
                      <select
                        className="text-input"
                        value={row.status}
                        onChange={(e) => updateRow(index, "status", e.target.value)}
                      >
                        {statusOptions.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field-group">
                      <label>Time Taken</label>
                      <input
                        className="text-input"
                        value={row.timeTaken}
                        onChange={(e) => updateRow(index, "timeTaken", e.target.value)}
                        placeholder="3 hrs, 30 mins, 2 hr 30 min"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="button-row">
              <button className="primary-btn" onClick={addRow}>
                <Plus size={16} /> Add Task
              </button>
              <button className="secondary-btn" onClick={saveCurrentDay}>
                <Save size={16} /> Save to Excel
              </button>
              <button className="outline-btn" onClick={() => uploadRef.current.click()}>
                <Upload size={16} /> Upload Excel
              </button>
              <input ref={uploadRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleUpload} />
              <button className="outline-btn" onClick={() => window.open('/api/download', '_blank')}>
                <FileSpreadsheet size={16} /> Download & Open Excel
              </button>
              <button className="outline-btn" onClick={downloadScreenshot}>
                <ImageDown size={16} /> Download Screenshot
              </button>
              <button className="danger-btn" onClick={clearAllData}>
                <RotateCcw size={16} /> Clear
              </button>
            </div>
          </section>

          <section className="right-column">
            <div className="card">
              <div className="card-header">
                <h2>Report Preview</h2>
                <p>Shows all saved days from your Excel file + current input.</p>
              </div>
              <div className="report-shot-wrapper">
                <div ref={reportRef} className="report-shot">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th style={{ width: "13%" }}>Task Assigned Date</th>
                        <th style={{ width: "43%" }}>Task</th>
                        <th style={{ width: "11%" }}>Project</th>
                        <th style={{ width: "11%" }}>Status</th>
                        <th style={{ width: "10%" }}>Timetaken</th>
                        <th style={{ width: "12%" }}>Total Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedReportData.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="empty-cell">No tasks added yet.</td>
                        </tr>
                      ) : (
                        groupedReportData.map((section) => (
                          <React.Fragment key={section.id}>
                            {section.rows.map((row, index) => (
                              <tr key={`${section.id}-${index}`}>
                                <td>{toDisplayDate(row.date)}</td>
                                <td>{row.task}</td>
                                <td>{row.project}</td>
                                <td>{row.status}</td>
                                <td>{formatHours(row.timeTaken)}</td>
                                {index === 0 && (
                                  <td rowSpan={section.rows.length} className="merged-hours">
                                    {section.totalHours}
                                  </td>
                                )}
                              </tr>
                            ))}
                            <tr className="gap-row"><td colSpan="6"></td></tr>
                          </React.Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
