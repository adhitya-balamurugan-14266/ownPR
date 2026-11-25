import { useState, useEffect, useRef } from 'react';
import { exportAllData } from '../api.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function todayLocalStr() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function prettyDay(day) {
  const [y, m, d] = day.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

function prettyMonth(month) {
  const [y, m] = month.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

// scope: { type: 'today' | 'day' | 'month' | 'legacy', value }
export function filterExport(data, scope) {
  const match = scope.type === 'legacy'
    ? () => true
    : scope.type === 'month'
      ? date => typeof date === 'string' && date.startsWith(`${scope.value}-`)
      : date => date === scope.value;

  const logs = (data.logs || [])
    .filter(l => match(l.log_date))
    .sort((a, b) => (b.log_date || '').localeCompare(a.log_date || '') || String(b.ROWID).localeCompare(String(a.ROWID)));
  const prs = (data.prs || [])
    .filter(p => match(p.log_date))
    .sort((a, b) => (b.log_date || '').localeCompare(a.log_date || ''));

  return { exported_at: data.exported_at, scope, logs, prs };
}

function saveJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function DayPicker({ onCancel, onPick }) {
  const today = todayLocalStr();
  const [day, setDay] = useState(today);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Download Any Day</h3>
        <p className="modal-message">Pick the day to export.</p>
        <input
          type="date"
          className="dl-date-input"
          value={day}
          max={today}
          onChange={e => setDay(e.target.value)}
        />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="modal-confirm-btn" disabled={!day || day > today} onClick={() => onPick(day)}>Download</button>
        </div>
      </div>
    </div>
  );
}

function MonthPicker({ firstYear, onCancel, onPick }) {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth(); // 0-based
  const minYear = Math.min(firstYear || curYear, curYear);
  const [year, setYear] = useState(curYear);
  const [month, setMonth] = useState(curMonth);

  function changeYear(delta) {
    const next = Math.min(curYear, Math.max(minYear, year + delta));
    setYear(next);
    if (next === curYear && month > curMonth) setMonth(curMonth);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Download Any Month</h3>
        <div className="mp-year">
          <button className="mp-arrow" aria-label="Previous year" disabled={year <= minYear} onClick={() => changeYear(-1)}>‹</button>
          <span className="mp-year-label">{year}</span>
          <button className="mp-arrow" aria-label="Next year" disabled={year >= curYear} onClick={() => changeYear(1)}>›</button>
        </div>
        <div className="mp-grid">
          {MONTHS.map((name, i) => {
            const future = year === curYear && i > curMonth;
            return (
              <button
                key={name}
                className={`mp-month${i === month ? ' selected' : ''}`}
                disabled={future}
                onClick={() => setMonth(i)}
              >
                {name}
              </button>
            );
          })}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="modal-confirm-btn" onClick={() => onPick(`${year}-${String(month + 1).padStart(2, '0')}`)}>Download</button>
        </div>
      </div>
    </div>
  );
}

export default function DownloadMenu({ firstYear }) {
  const [open, setOpen]       = useState(false);
  const [picker, setPicker]   = useState(null); // 'day' | 'month' | null
  const [busy, setBusy]       = useState(false);
  const [message, setMessage] = useState(null); // { text, error }
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function run(scope) {
    setPicker(null);
    setOpen(false);
    setBusy(true);
    setMessage(null);
    try {
      const filtered = filterExport(await exportAllData(), scope);
      if (scope.type !== 'legacy' && filtered.logs.length === 0) {
        const when = scope.type === 'month' ? `in ${prettyMonth(scope.value)}` : `on ${prettyDay(scope.value)}`;
        setMessage({ text: `No sessions logged ${when} — nothing to download.` });
        return;
      }
      const stamp = scope.type === 'legacy' ? todayLocalStr() : scope.value;
      saveJson(filtered, `hypertrophymax-${scope.type}-${stamp}.json`);
      const n = filtered.logs.length;
      setMessage({ text: `Downloaded ${n} session${n !== 1 ? 's' : ''}.` });
    } catch (err) {
      setMessage({ text: `Error: ${err.message}`, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="dl-wrap" ref={wrapRef}>
        <button className="pr-sync-btn" onClick={() => setOpen(o => !o)} disabled={busy} aria-haspopup="menu" aria-expanded={open}>
          {busy ? 'Preparing…' : '⬇ Download JSON ▾'}
        </button>
        {open && (
          <div className="dl-menu" role="menu">
            <button role="menuitem" onClick={() => run({ type: 'today', value: todayLocalStr() })}>Download Today</button>
            <button role="menuitem" onClick={() => { setOpen(false); setPicker('day'); }}>Download Any Day</button>
            <button role="menuitem" onClick={() => { setOpen(false); setPicker('month'); }}>Download Any Month</button>
            <button role="menuitem" onClick={() => run({ type: 'legacy', value: null })}>Download Legacy</button>
          </div>
        )}
      </div>
      {message && (
        <span className="pr-sync-msg" style={message.error ? { color: '#ff6b6b' } : undefined}>{message.text}</span>
      )}
      {picker === 'day' && (
        <DayPicker onCancel={() => setPicker(null)} onPick={day => run({ type: 'day', value: day })} />
      )}
      {picker === 'month' && (
        <MonthPicker firstYear={firstYear} onCancel={() => setPicker(null)} onPick={month => run({ type: 'month', value: month })} />
      )}
    </>
  );
}
