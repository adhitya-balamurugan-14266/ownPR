import { useState, useEffect } from 'react';
import { fetchLogs, fetchEntries, fetchPRs, backfillPRs, deleteLog, createLog, closeLog, exportAllData } from '../api.js';
import ExerciseTable from './ExerciseTable.jsx';
import ConfirmModal from './ConfirmModal.jsx';

const BODY_PARTS = [
  'Chest', 'Shoulders', 'Back', 'Arms', 'Legs', 'Cardio',
  'Chest and Triceps', 'Shoulders and Legs', 'Back and Biceps', 'Arms and Legs',
  'Push Day', 'Pull Day', 'Custom'
];

const WHEY_CUTOFF_DATE = '2026-10-03'; // supplement renamed BCAA -> Whey for sessions logged from this date on

// Exercises where LESS weight means MORE strength (assisted machines)
const INVERTED_WEIGHT_EXERCISES = new Set(['Assisted Dips', 'Assisted Pullups']);

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

function ExercisePivot({ logId, exercisePRs = {} }) {
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
  const maxSets = Math.max(...order.map(n => Math.max(...groups[n].map(e => parseInt(e.set_number) || 0))));

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
            const prsForEx  = exercisePRs[name] || [];
            const weightPR  = prsForEx.find(p => p.metric === 'weight');
            const repsPR    = prsForEx.find(p => p.metric === 'reps');
            const setsPR    = prsForEx.find(p => p.metric === 'sets');
            return (
              <tr key={name}>
                <td className="exercise-name">{name}</td>
                {Array.from({ length: maxSets }, (_, i) => {
                  const s = sets.find(e => parseInt(e.set_number) === i + 1);
                  const isWPR = s && weightPR && (INVERTED_WEIGHT_EXERCISES.has(name)
                    ? parseFloat(s.weight) <= parseFloat(weightPR.new_best)
                    : parseFloat(s.weight) >= parseFloat(weightPR.new_best));
                  const isRPR = s && repsPR   && parseInt(s.reps)     >= parseInt(repsPR.new_best);
                  const isSPR = s && setsPR   && s === sets[sets.length - 1] && sets.length >= parseInt(setsPR.new_best);
                  const isPR  = isWPR || isRPR || isSPR;
                  return (
                    <td key={i} className={`set-cell${isPR ? ' pr-cell' : ''}`}>
                      {s ? `${parseFloat(s.weight)}kg × ${s.reps}` : '—'}
                    </td>
                  );
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
  const supplementLabel = log.log_date >= WHEY_CUTOFF_DATE ? 'Whey' : 'BCAA';
  return (
    <div className="supplement-row">
      <span className={`supp-badge ${pw ? 'supp-taken' : 'supp-skip'}`}>
        {pw ? `Preworkout ✓${scoopLabel(log.preworkout_qty)}` : 'No Preworkout'}
      </span>
      <span className={`supp-badge ${bc ? 'supp-taken' : 'supp-skip'}`}>
        {bc ? `${supplementLabel} ✓${scoopLabel(log.bcaa_qty)}` : `No ${supplementLabel}`}
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

// ── PR detail strip (always visible below the row header) ────────────────────

function PRDetailRow({ prs }) {
  const byExercise = {};
  const order = [];
  for (const pr of prs) {
    if (!byExercise[pr.exercise_name]) { byExercise[pr.exercise_name] = []; order.push(pr.exercise_name); }
    byExercise[pr.exercise_name].push(pr);
  }
  return (
    <div className="pr-detail-row">
      <span className="pr-detail-icon">🏆</span>
      {order.map((name, i) => {
        const parts = byExercise[name].map(r => {
          const prev = parseFloat(r.previous_best);
          const next = parseFloat(r.new_best);
          if (r.metric === 'weight') return prev === 0 ? `First — ${next}kg` : `${prev}kg → ${next}kg`;
          if (r.metric === 'reps')   return prev === 0 ? `First — ${next} reps` : `${prev} reps → ${next} reps`;
          return prev === 0 ? `First — ${next} sets` : `${prev} sets → ${next} sets`;
        });
        return (
          <span key={name} className="pr-detail-item">
            {i > 0 && <span className="pr-detail-dot">·</span>}
            <span className="pr-detail-name">{name}</span>
            <span className="pr-detail-vals">{parts.join(' / ')}</span>
          </span>
        );
      })}
    </div>
  );
}

// ── Log row (real workout session) ────────────────────────────────────────────

function LogRow({ log: initialLog, onDelete, prs = [] }) {
  const [log, setLog]           = useState(initialLog);
  const [open, setOpen]         = useState(!initialLog.is_closed);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  // Inline close-session form (for unclosed sessions)
  const [bcaaTaken, setBcaaTaken] = useState(false);
  const [bcaaQty, setBcaaQty]     = useState('');
  const [closing, setClosing]     = useState(false);
  const [closeError, setCloseError] = useState('');

  async function handleClose(e) {
    e.preventDefault();
    setClosing(true);
    setCloseError('');
    try {
      const updated = await closeLog(log.ROWID, bcaaTaken, bcaaTaken ? parseFloat(bcaaQty) || 0 : 0);
      setLog(prev => ({ ...prev, ...updated, is_closed: true }));
    } catch (err) {
      setCloseError(err.message);
      setClosing(false);
    }
  }

  async function handleConfirmDelete() {
    setConfirming(false);
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteLog(log.ROWID);
      onDelete(log.ROWID);
    } catch (err) {
      setDeleteError(err.message);
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
          {prs.length > 0 && <span className="pr-badge">🏆 PR</span>}
          <button
            className="btn-icon btn-del log-delete-btn"
            onClick={e => { e.stopPropagation(); setConfirming(true); }}
            disabled={deleting}
            title="Delete session"
          >{deleting ? '…' : '🗑'}</button>
          <span className="log-chevron">{open ? '▲' : '▼'}</span>
        </button>

        {deleteError && <p className="activate-error" style={{ margin: '4px 12px' }}>{deleteError}</p>}
        {prs.length > 0 && <PRDetailRow prs={prs} />}

        {open && (
          <>
            <SupplementRow log={log} />
            {log.is_closed
              ? <ExercisePivot logId={log.ROWID} exercisePRs={(() => {
                  const m = {};
                  for (const pr of prs) {
                    if (!m[pr.exercise_name]) m[pr.exercise_name] = [];
                    m[pr.exercise_name].push(pr);
                  }
                  return m;
                })()} />
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
                      Whey taken?
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
                    {closeError && <p className="activate-error" style={{ margin: '4px 0 0' }}>{closeError}</p>}
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

// ── Body Part Breakdown ───────────────────────────────────────────────────────

function BodyPartBreakdown({ sessions, onClose }) {
  const counts = {};
  for (const s of sessions) {
    const bp = s.body_part || 'Other';
    counts[bp] = (counts[bp] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;

  return (
    <div className="body-part-panel">
      <div className="body-part-panel-header">
        <span>Body Part Breakdown</span>
        <button className="body-part-close" onClick={onClose}>✕</button>
      </div>
      <div className="body-part-bars">
        {sorted.map(([bp, count]) => (
          <div key={bp} className="bp-row">
            <span className="bp-label">{bp}</span>
            <div className="bp-bar-track">
              <div className="bp-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="bp-count">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Month Progress Chart ──────────────────────────────────────────────────────

function MonthProgressChart({ activeCount, restCount, prCount, isGoodMonth, sessions }) {
  const [showBodyParts, setShowBodyParts] = useState(false);

  const bars = [
    { label: 'Active Days', value: activeCount, color: '#4caf50', clickable: true },
    { label: 'PRs',         value: prCount,     color: '#ffd700', clickable: false },
    { label: 'Rest Days',   value: restCount,   color: '#E32929', clickable: false },
  ];
  const maxVal  = Math.max(...bars.map(b => b.value), 1);
  const padX    = 28, padY = 28, baseH = 28;
  const barW    = 58, barGap = 26;
  const availH  = 140;
  const totalW  = bars.length * barW + (bars.length - 1) * barGap + padX * 2;
  const totalH  = padY + availH + baseH + 8;
  const verdictColor = isGoodMonth ? '#4caf50' : activeCount === restCount ? '#818cf8' : '#E32929';

  return (
    <>
      <div className="month-progress-panel">
        <div className="month-progress-verdict" style={{ color: verdictColor }}>
          {isGoodMonth
            ? `Great month — Active (${activeCount}) beat Rest (${restCount})`
            : activeCount === restCount
              ? `Balanced — ${activeCount} active, ${restCount} rest`
              : `Push harder — Rest (${restCount}) outnumbered Active (${activeCount})`
          }
        </div>
        <svg
          width={totalW}
          height={totalH}
          viewBox={`0 0 ${totalW} ${totalH}`}
          style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}
        >
          <line
            x1={padX} y1={padY + availH}
            x2={totalW - padX} y2={padY + availH}
            stroke="#2A2A2A" strokeWidth="1"
          />
          {bars.map((bar, i) => {
            const x = padX + i * (barW + barGap);
            const h = (bar.value / maxVal) * availH;
            const y = padY + availH - h;
            const isActive = bar.clickable;
            return (
              <g
                key={bar.label}
                onClick={isActive ? () => setShowBodyParts(o => !o) : undefined}
                style={isActive ? { cursor: 'pointer' } : undefined}
              >
                {h > 0
                  ? <rect x={x} y={y} width={barW} height={h} fill={bar.color} rx="4"
                      opacity={isActive && showBodyParts ? 1 : 0.82} />
                  : <rect x={x} y={padY + availH - 2} width={barW} height={2} fill={bar.color} rx="1" opacity="0.35" />
                }
                <text
                  x={x + barW / 2}
                  y={h > 2 ? y - 5 : padY + availH - 8}
                  textAnchor="middle" fontSize="13" fontWeight="600" fill={bar.color}
                >{bar.value}</text>
                <text
                  x={x + barW / 2}
                  y={padY + availH + 16}
                  textAnchor="middle" fontSize="11" fill="#808080"
                >{bar.label}</text>
                {isActive && (
                  <text
                    x={x + barW / 2}
                    y={padY + availH + 28}
                    textAnchor="middle" fontSize="9" fill="#4caf5088"
                  >{showBodyParts ? '▲ hide' : '▼ tap'}</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {showBodyParts && (
        <BodyPartBreakdown
          sessions={sessions}
          onClose={() => setShowBodyParts(false)}
        />
      )}
    </>
  );
}

// ── Month section ─────────────────────────────────────────────────────────────

function MonthSection({ month, onDelete, onActivated, prsByLogId }) {
  const [year, monthNum] = month.key.split('-').map(Number);
  const isMonthEnded = new Date() > new Date(year, monthNum, 0);

  const [open, setOpen]             = useState(!isMonthEnded);
  const [progressOpen, setProgress] = useState(false);

  const activeCount = month.logs.filter(l => !l.isRestDay).length;
  const restCount   = month.logs.filter(l => l.isRestDay).length;
  const totalDaysInMonth = new Date(year, monthNum, 0).getDate();

  const monthPRCount = month.logs
    .filter(l => !l.isRestDay)
    .reduce((sum, l) => sum + (prsByLogId[l.log_date]?.length || 0), 0);

  const isGoodMonth = activeCount > restCount;

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
        {isMonthEnded && (
          <button
            className="btn-your-progress"
            onClick={e => { e.stopPropagation(); setProgress(o => !o); }}
          >
            {progressOpen ? 'Hide Progress' : 'Your Progress'}
          </button>
        )}
        <span className="month-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {isMonthEnded && progressOpen && (
        <MonthProgressChart
          activeCount={activeCount}
          restCount={restCount}
          prCount={monthPRCount}
          isGoodMonth={isGoodMonth}
          sessions={month.logs.filter(l => !l.isRestDay)}
        />
      )}

      {open && (
        <div className="month-logs">
          {month.logs.map(log =>
            log.isRestDay
              ? <RestDayRow key={log.log_date} date={log.log_date} onActivated={onActivated} />
              : <LogRow key={log.ROWID} log={log} onDelete={onDelete} prs={prsByLogId[log.log_date] || []} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Key PRs by log_date — avoids any ROWID type/precision mismatch
function loadPRMap(prsData) {
  const map = {};
  for (const pr of prsData) {
    if (!pr.log_date) continue;
    if (!map[pr.log_date]) map[pr.log_date] = [];
    map[pr.log_date].push(pr);
  }
  return map;
}

export default function HistoryAccordion() {
  const [logs, setLogs]             = useState([]);
  const [prsByLogId, setPrsByLogId] = useState({});
  const [prCount, setPrCount]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState('');
  const [syncing, setSyncing]       = useState(false);
  const [syncMsg, setSyncMsg]       = useState('');
  const [exporting, setExporting]   = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    Promise.all([fetchLogs(), fetchPRs()])
      .then(([logsData, prsData]) => {
        setLogs(logsData);
        setPrsByLogId(loadPRMap(prsData));
        setPrCount(prsData.length);
      })
      .catch(err => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleBackfill() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const result = await backfillPRs();
      const fresh = await fetchPRs();
      setPrsByLogId(loadPRMap(fresh));
      setPrCount(fresh.length);
      setSyncMsg(`Done — ${result.backfilled} PR${result.backfilled !== 1 ? 's' : ''} found across all sessions.`);
    } catch (err) {
      setSyncMsg(`Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleDownloadJSON() {
    setExporting(true);
    setExportError('');
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ownpr-export-${todayLocalStr()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  }

  function handleDelete(rowid) {
    setLogs(prev => prev.filter(l => l.ROWID !== rowid));
  }

  function handleActivated(newLog) {
    setLogs(prev => [...prev, newLog]);
  }

  if (loading) return <div className="loading">Loading history…</div>;
  if (loadError) return <p className="empty" style={{ color: '#ff6b6b' }}>Failed to load history: {loadError}</p>;
  if (logs.length === 0) return <p className="empty">No workout history yet.</p>;

  const months = groupByMonth(withRestDays(logs));

  return (
    <div className="history">
      <div className="pr-sync-row">
        <button className="pr-sync-btn" onClick={handleBackfill} disabled={syncing}>
          {syncing ? 'Calculating…' : '🏆 Sync PR History'}
        </button>
        <button className="pr-sync-btn" onClick={handleDownloadJSON} disabled={exporting}>
          {exporting ? 'Preparing…' : '⬇ Download JSON'}
        </button>
        {prCount !== null && !syncMsg && <span className="pr-sync-msg">{prCount} PR record{prCount !== 1 ? 's' : ''} loaded</span>}
        {syncMsg && <span className="pr-sync-msg">{syncMsg}</span>}
        {exportError && <span className="pr-sync-msg" style={{ color: '#ff6b6b' }}>Error: {exportError}</span>}
      </div>
      {months.map(m => (
        <MonthSection
          key={m.label}
          month={m}
          onDelete={handleDelete}
          onActivated={handleActivated}
          prsByLogId={prsByLogId}
        />
      ))}
    </div>
  );
}
