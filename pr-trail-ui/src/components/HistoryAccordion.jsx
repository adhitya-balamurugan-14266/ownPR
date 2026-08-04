import { useState, useEffect } from 'react';
import { fetchLogs, fetchEntries, deleteLog } from '../api.js';
import ConfirmModal from './ConfirmModal.jsx';

function groupByMonth(logs) {
  const map = {};
  const keyOrder = [];
  for (const log of logs) {
    const [year, month] = log.log_date.split('-');
    const key = `${year}-${month}`;
    if (!map[key]) {
      const label = new Date(parseInt(year), parseInt(month) - 1, 1)
        .toLocaleString('default', { month: 'long', year: 'numeric' });
      map[key] = { label, logs: [] };
      keyOrder.push(key);
    }
    map[key].logs.push(log);
  }
  return keyOrder.map(k => map[k]);
}

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
          </tr>
        </thead>
        <tbody>
          {order.map(name => {
            const sets = [...groups[name]].sort((a, b) => a.set_number - b.set_number);
            return (
              <tr key={name}>
                <td className="exercise-name">{name}</td>
                {Array.from({ length: maxSets }, (_, i) => {
                  const s = sets[i];
                  return <td key={i} className="set-cell">{s ? `${parseFloat(s.weight)}kg × ${s.reps}` : '—'}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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

function LogRow({ log, onDelete }) {
  const [open, setOpen]           = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting]   = useState(false);

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
          {log.is_closed && <span className="log-status">✓</span>}
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
            <ExercisePivot logId={log.ROWID} />
          </>
        )}
      </div>
    </>
  );
}

function MonthSection({ month, onDelete }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="month-section">
      <button className="month-header" onClick={() => setOpen(!open)}>
        <span>{month.label}</span>
        <span className="month-count">{month.logs.length} session{month.logs.length !== 1 ? 's' : ''}</span>
        <span className="month-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="month-logs">
          {month.logs.map(log => <LogRow key={log.ROWID} log={log} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}

export default function HistoryAccordion() {
  const [logs, setLogs]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs()
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  function handleDelete(rowid) {
    setLogs(prev => prev.filter(l => l.ROWID !== rowid));
  }

  if (loading) return <div className="loading">Loading history…</div>;
  if (logs.length === 0) return <p className="empty">No workout history yet.</p>;

  const months = groupByMonth(logs);

  return (
    <div className="history">
      {months.map(m => <MonthSection key={m.label} month={m} onDelete={handleDelete} />)}
    </div>
  );
}
