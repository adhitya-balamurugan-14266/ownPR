import { useState } from 'react';
import { closeLog } from '../api.js';

export default function CloseLog({ logId, onClose, onCancel }) {
  const [bcaaTaken, setBcaaTaken]   = useState(false);
  const [bcaaQty, setBcaaQty]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const updated = await closeLog(logId, bcaaTaken, bcaaTaken ? parseFloat(bcaaQty) || 0 : 0);
      onClose(updated);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="close-log">
      <h2>Close Session</h2>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={bcaaTaken}
              onChange={e => setBcaaTaken(e.target.checked)}
            />
            BCAA taken?
          </label>
        </div>

        {bcaaTaken && (
          <div className="field">
            <label>Scoops</label>
            <input
              type="number"
              placeholder="1"
              value={bcaaQty}
              onChange={e => setBcaaQty(e.target.value)}
              min="0.5"
              step="0.5"
            />
          </div>
        )}

        {error && <p className="empty" style={{ color: '#ff6b6b', padding: 0 }}>{error}</p>}

        <div className="close-log-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Closing…' : 'Close Log'}
          </button>
        </div>
      </form>
    </div>
  );
}
