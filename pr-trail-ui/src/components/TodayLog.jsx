import { useState, useEffect } from 'react';
import { createLog, fetchLogs, deleteLog } from '../api.js';
import ConfirmModal from './ConfirmModal.jsx';
import ExerciseTable from './ExerciseTable.jsx';
import PRBanner from './PRBanner.jsx';
import CloseLog from './CloseLog.jsx';

const BODY_PARTS = [
  'Chest', 'Shoulders', 'Back', 'Arms', 'Legs', 'Cardio',
  'Chest and Triceps', 'Shoulders and Legs', 'Back and Biceps',
  'Push Day', 'Pull Day', 'Custom'
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TodayLog() {
  const today = todayStr();

  const [todayLog, setTodayLog]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [prInfo, setPrInfo]           = useState(null);   // { exerciseName, prMetric }
  const [showClose, setShowClose]     = useState(false);
  const [closed, setClosed]           = useState(false);
  const [error, setError]             = useState('');
  const [deleting, setDeleting]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // New-log form
  const [bodyPart, setBodyPart]               = useState('');
  const [preworkoutTaken, setPreworkoutTaken] = useState(false);
  const [preworkoutQty, setPreworkoutQty]     = useState('');
  const [creating, setCreating]               = useState(false);

  useEffect(() => {
    fetchLogs()
      .then(logs => {
        const open = logs.find(l => l.log_date === today && !l.is_closed);
        setTodayLog(open || null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [today]);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const log = await createLog(today, bodyPart, preworkoutTaken, preworkoutTaken ? parseFloat(preworkoutQty) || 0 : 0);
      setTodayLog(log);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function handlePR(exerciseName, prMetric) {
    setPrInfo({ exerciseName, prMetric });
  }

  function handleClosed(updatedLog) {
    setClosed(true);
    setTodayLog(updatedLog);
    setShowClose(false);
  }

  async function handleDeleteLog() {
    setDeleting(true);
    try {
      await deleteLog(todayLog.ROWID);
      setTodayLog(null);
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  if (loading) return <div className="loading">Loading…</div>;

  if (error) return <p className="empty" style={{ color: '#ff6b6b' }}>{error}</p>;

  if (closed) {
    return (
      <div className="summary">
        <h2>Session Closed ✓</h2>
        <p>Great workout! Log for {today} saved.</p>
        {todayLog && <p><strong>Body part:</strong> {todayLog.body_part}</p>}
      </div>
    );
  }

  if (!todayLog) {
    return (
      <div className="new-log">
        <h2>New Session</h2>
        <form onSubmit={handleCreate}>
          <div className="field">
            <label>What did you train today?</label>
            <select value={bodyPart} onChange={e => setBodyPart(e.target.value)} required>
              <option value="">Select body part…</option>
              {BODY_PARTS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={preworkoutTaken}
                onChange={e => setPreworkoutTaken(e.target.checked)}
              />
              Preworkout taken?
            </label>
          </div>

          {preworkoutTaken && (
            <div className="field">
              <label>Scoops</label>
              <input
                type="number"
                placeholder="1"
                value={preworkoutQty}
                onChange={e => setPreworkoutQty(e.target.value)}
                min="0.5"
                step="0.5"
              />
            </div>
          )}

          {error && <p className="empty" style={{ color: '#ff6b6b', padding: 0 }}>{error}</p>}

          <button type="submit" disabled={creating}>
            {creating ? 'Starting…' : 'Start Session'}
          </button>
        </form>
      </div>
    );
  }

  if (showClose) {
    return (
      <CloseLog
        logId={todayLog.ROWID}
        onClose={handleClosed}
        onCancel={() => setShowClose(false)}
      />
    );
  }

  return (
    <div className="today-session">
      {prInfo && (
        <PRBanner
          exerciseName={prInfo.exerciseName}
          prMetric={prInfo.prMetric}
          onDismiss={() => setPrInfo(null)}
        />
      )}

      <div className="session-header">
        <span className="session-date">{today}</span>
        <span className="session-body-part">{todayLog.body_part}</span>
      </div>

      <ExerciseTable logId={todayLog.ROWID} onPR={handlePR} />

      {confirmDelete && (
        <ConfirmModal
          title="Delete Session"
          message="Delete today's entire session? All sets will be permanently removed."
          onConfirm={() => { setConfirmDelete(false); handleDeleteLog(); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      <div className="log-action-row">
        <button className="close-log-btn" onClick={() => setShowClose(true)}>
          Close Today's Log
        </button>
        <button className="btn-icon btn-del delete-session-btn" onClick={() => setConfirmDelete(true)} disabled={deleting}>
          {deleting ? '…' : '🗑 Delete Session'}
        </button>
      </div>
    </div>
  );
}
