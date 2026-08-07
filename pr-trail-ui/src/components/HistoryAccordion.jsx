import { useState, useEffect } from 'react';
import { fetchLogs, fetchEntries, deleteLog, createLog, closeLog } from '../api.js';
import ExerciseTable from './ExerciseTable.jsx';
import ConfirmModal from './ConfirmModal.jsx';

const BODY_PARTS = [
  'Chest', 'Shoulders', 'Back', 'Arms', 'Legs', 'Cardio',
  'Chest and Triceps', 'Shoulders and Legs', 'Back and Biceps',
  'Push Day', 'Pull Day', 'Custom'
];

function todayLocalStr() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function withRestDays(logs) {
  if (logs.length === 0) return [];
  const logDates = new Set(logs.map(l => l.log_date));
  const minDate = logs.reduce((min, l) => (l.log_date < min ? l.log_date : min), logs[0].log_date);
  const today = todayLocalStr();
  const all = [...logs];
  const cur = new Date(minDate + 'T12:00:00');
  const end = new Date(today + 'T12:00:00');
  while (cur <= end) {
    const d = [cur.getFullYear(), String(cur.getMonth() + 1).padStart(2, '0'), String(cur.getDate()).padStart(2, '0')].join('-');
    if (!logDates.has(d)) all.push({ log_date: d, isRestDay: true });
    cur.setDate(cur.getDate() + 1);
  }
  return all.sort((a, b) => b.log_date.localeCompare(a.log_date));
}

function groupByMonth(logs) {
  const map = {};
  const keyOrder = [];
  for (const log of logs) {
    const [year, month] = log.log_date.split('-');
    const key = `${year}-${month}`;
    if (!map[key]) {
      const label = new Date(parseInt(year), parseInt(month) - 1, 1)
        .toLocaleString('default', { month: 'long', year: 'numeric' });
      map[key] = { label, key, logs: [] };
      keyOrder.push(key);
    }
    map[key].logs.push(log);
  }
  return keyOrder.map(k => map[k]);
}

// ── Exercise pivot (read-only, for closed sessions) ──────────────────────────

function ExercisePivot({ logId }) {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    fetchEntries(logId).then(setEntries).catch(() => setEntries([]));
  }, [logId]);

  if (entries === null) return <div className="loading" style={{ padding: '16px' }}>Loading…</div>;
  if (entries.length === 0) return <p className="empty">No exercises logged.</p>;

  const groups = {};
  const order  = [];
  for (const e of entries) {
    if (!groups[e.exercise_name]) { groups[e.exercise_name] = []; order.push(e.exercise_name); }
    groups[e.exercise_name].push(e);
  }
  const maxSets = Math.max(...order.map(n => groups[n].length));

  return (
    <div className="table-scroll">
      <table className="exercise-table">
        <thead>
          <tr>
            <th>Exercise</th>
            {Array.from({ length: maxSets }, (_, i) => <th key={i}>Set {i + 1}</th>)}
            <th className="total-th">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.map(name => {
            const sets = [...groups[name]].sort((a, b) => a.set_number - b.set_number);
            const totalReps = sets.reduce((s, e) => s + parseInt(e.reps), 0);
            const totalVol  = sets.reduce((s, e) => s + parseFloat(e.weight) * parseInt(e.reps), 0);
            return (
              <tr key={name}>
                <td className="exercise-name">{name}</td>
                {Array.from({ length: maxSets }, (_, i) => {
                  const s = sets[i];
                  return <td key={i} className="set-cell">{s ? `${parseFloat(s.weight)}kg × ${s.reps}` : '—'}</td>;
                })}
                <td className="total-cell">
                  <div className="total-reps">{totalReps} reps</div>
                  <div className="total-vol">{totalVol % 1 === 0 ? totalVol : totalVol.toFixed(1)} kg vol</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Supplement row ────────────────────────────────────────────────────────────

function scoopLabel(qty) {
  const n = parseFloat(qty);
  if (!n) return '';
  return ` ${n} scoop${n !== 1 ? 's' : ''}`;
}

function SupplementRow({ log }) {
  const pw = log.preworkout_taken;
  const bc = log.bcaa_taken;
  return (
    <div className="supplement-row">
      <span className={`supp-badge ${pw ? 'supp-taken' : 'supp-skip'}`}>
        {pw ? `Preworkout ✓${scoopLabel(log.preworkout_qty)}` : 'No Preworkout'}
      </span>
      <span className={`supp-badge ${bc ? 'supp-taken' : 'supp-skip'}`}>
        {bc ? `BCAA ✓${scoopLabel(log.bcaa_qty)}` : 'No BCAA'}
      </span>
    </div>
  );
}

// ── REST day row ──────────────────────────────────────────────────────────────

function RestDayRow({ date, onActivated }) {
  const [open, setOpen]                       = useState(false);
  const [bodyPart, setBodyPart]               = useState('');
  const [preworkoutTaken, setPreworkoutTaken] = useState(false);
  const [preworkoutQty, setPreworkoutQty]     = useState('');
  const [submitting, setSubmitting]           = useState(false);
  const [error, setError]                     = useState('');

  async function handleActivate(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const log = await createLog(
        date, bodyPart, preworkoutTaken,
        preworkoutTaken ? parseFloat(preworkoutQty) || 0 : 0
      );
      onActivated(log);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className={`rest-day-row${open ? ' rest-day-row-open' : ''}`}>
      <div className="rest-day-header">
        <span className="log-date rest-day-date">{date}</span>
        <span className="rest-day-label">REST DAY</span>
        <button className="make-active-btn" onClick={() => setOpen(o => !o)}>
          {open ? 'Cancel' : 'Make Active'}
        </button>
      </div>

      {open && (
        <form className="activate-form" onSubmit={handleActivate}>
          <select value={bodyPart} onChange={e => setBodyPart(e.target.value)} required>
            <option value="">What did you train?</option>
            {BODY_PARTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preworkoutTaken}
              onChange={e => setPreworkoutTaken(e.target.checked)}
            />
            Preworkout taken?
          </label>
          {preworkoutTaken && (
            <input
              type="number"
              placeholder="Scoops"
              value={preworkoutQty}
              onChange={e => setPreworkoutQty(e.target.value)}
              min="0.5"
              step="0.5"
            />
          )}
          {error && <p className="activate-error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Starting…' : 'Start Session'}
          </button>
        </form>
      )}
    </div>
  );
}

// ── Log row (real workout session) ────────────────────────────────────────────

function LogRow({ log: initialLog, onDelete }) {
  const [log, setLog]           = useState(initialLog);
  const [open, setOpen]         = useState(!initialLog.is_closed);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Inline close-session form (for unclosed sessions)
  const [bcaaTaken, setBcaaTaken] = useState(false);
  const [bcaaQty, setBcaaQty]     = useState('');
  const [closing, setClosing]     = useState(false);

  async function handleClose(e) {
    e.preventDefault();
    setClosing(true);
    try {
      const updated = await closeLog(log.ROWID, bcaaTaken, bcaaTaken ? parseFloat(bcaaQty) || 0 : 0);
      setLog(prev => ({ ...prev, ...updated, is_closed: true }));
    } catch {
      setClosing(false);
    }
  }

  async function handleConfirmDelete() {
    setConfirming(false);
    setDeleting(true);
    try {
      await deleteLog(log.ROWID);
      onDelete(log.ROWID);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <>
      {confirming && (
        <ConfirmModal
          title="Delete Session"
          message={`Delete ${log.log_date} — ${log.body_part}? All sets will be permanently removed.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
      <div className="log-row">
        <button className="log-row-header" onClick={() => setOpen(!open)}>
          <span className="log-date">{log.log_date}</span>
          <span className="log-body-part">{log.body_part}</span>
          {log.is_closed
            ? <span className="log-status">✓</span>
            : <span className="log-status-open">● Active</span>
          }
          <button
            className="btn-icon btn-del log-delete-btn"
            onClick={e => { e.stopPropagation(); setConfirming(true); }}
            disabled={deleting}
            title="Delete session"
          >{deleting ? '…' : '🗑'}</button>
          <span className="log-chevron">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <>
            <SupplementRow log={log} />
            {log.is_closed
              ? <ExercisePivot logId={log.ROWID} />
              : (
                <>
                  <ExerciseTable logId={log.ROWID} onPR={() => {}} />
                  <form className="history-close-form" onSubmit={handleClose}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={bcaaTaken}
                        onChange={e => setBcaaTaken(e.target.checked)}
                      />
                      BCAA taken?
                    </label>
                    {bcaaTaken && (
                      <input
                        type="number"
                        placeholder="Scoops"
                        value={bcaaQty}
                        onChange={e => setBcaaQty(e.target.value)}
                        min="0.5"
                        step="0.5"
                        style={{ width: '80px' }}
                      />
                    )}
                    <button type="submit" disabled={closing}>
                      {closing ? 'Closing…' : 'Close Session ✓'}
                    </button>
                  </form>
                </>
              )
            }
          </>
        )}
      </div>
    </>
  );
}

// ── Month section ─────────────────────────────────────────────────────────────

function MonthSection({ month, onDelete, onActivated }) {
  const [open, setOpen] = useState(true);
  const activeCount = month.logs.filter(l => !l.isRestDay).length;
  const restCount   = month.logs.filter(l => l.isRestDay).length;
  const [year, monthNum] = month.key.split('-').map(Number);
  const totalDaysInMonth = new Date(year, monthNum, 0).getDate();

  return (
    <div className="month-section">
      <button className="month-header" onClick={() => setOpen(!open)}>
        <span>{month.label}</span>
        <span className="month-day-stats">
          <span className="day-stat day-stat-active">Active Days ({activeCount})</span>
          <span className="day-stat day-stat-rest">Rest Days ({restCount})</span>
          <span className="day-stat day-stat-total">Total Days ({totalDaysInMonth})</span>
        </span>
        <span className="month-count">{activeCount} session{activeCount !== 1 ? 's' : ''}</span>
        <span className="month-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="month-logs">
          {month.logs.map(log =>
            log.isRestDay
              ? <RestDayRow key={log.log_date} date={log.log_date} onActivated={onActivated} />
              : <LogRow key={log.ROWID} log={log} onDelete={onDelete} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function HistoryAccordion() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs()
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  function handleDelete(rowid) {
    setLogs(prev => prev.filter(l => l.ROWID !== rowid));
  }

  function handleActivated(newLog) {
    setLogs(prev => [...prev, newLog]);
  }

  if (loading) return <div className="loading">Loading history…</div>;
  if (logs.length === 0) return <p className="empty">No workout history yet.</p>;

  const months = groupByMonth(withRestDays(logs));

  return (
    <div className="history">
      {months.map(m => (
        <MonthSection
          key={m.label}
          month={m}
          onDelete={handleDelete}
          onActivated={handleActivated}
        />
      ))}
    </div>
  );
}
