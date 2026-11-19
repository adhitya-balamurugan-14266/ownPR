import { useState, useEffect } from 'react';
import { fetchCurrentPRs } from '../api.js';

export default function CurrentPRsModal({ onClose }) {
  const [prs, setPrs]       = useState(null);
  const [error, setError]   = useState('');

  useEffect(() => {
    fetchCurrentPRs()
      .then(setPrs)
      .catch(err => setError(err.message));
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card current-prs-card" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Current PRs</h3>
        {error && <p className="modal-message" style={{ color: '#ff6b6b' }}>{error}</p>}
        {!error && prs === null && <p className="modal-message">Loading…</p>}
        {!error && prs !== null && prs.length === 0 && <p className="modal-message">No exercises logged yet.</p>}
        {!error && prs !== null && prs.length > 0 && (
          <div className="current-prs-scroll">
            <table className="current-prs-table">
              <thead>
                <tr>
                  <th>Exercise</th>
                  <th>Weight</th>
                  <th>Reps</th>
                  <th>Sets</th>
                </tr>
              </thead>
              <tbody>
                {prs.map(pr => (
                  <tr key={pr.exercise_name}>
                    <td className="exercise-name">{pr.exercise_name}</td>
                    <td>{pr.weight}kg</td>
                    <td>{pr.reps}</td>
                    <td>{pr.sets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
