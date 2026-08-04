import { useState, useEffect } from 'react';
import { addEntry, fetchEntries, updateEntry, deleteEntry } from '../api.js';

function buildPivot(entries) {
  const groups = {};
  const order  = [];
  for (const e of entries) {
    if (!groups[e.exercise_name]) {
      groups[e.exercise_name] = [];
      order.push(e.exercise_name);
    }
    groups[e.exercise_name].push(e);
  }
  const maxSets = order.length === 0 ? 0 : Math.max(...order.map(n => groups[n].length));
  return { groups, order, maxSets };
}

export default function ExerciseTable({ logId, onPR }) {
  const [entries,         setEntries]         = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');

  // Current locked exercise
  const [currentExercise, setCurrentExercise] = useState('');
  const [exerciseInput,   setExerciseInput]   = useState('');
  const [reps,            setReps]            = useState('');
  const [weight,          setWeight]          = useState('');
  const [submitting,      setSubmitting]      = useState(false);

  // Inline edit state
  const [editId,     setEditId]     = useState(null);
  const [editReps,   setEditReps]   = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    fetchEntries(logId)
      .then(setEntries)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [logId]);

  function nextSetFor(name) {
    const existing = entries.filter(e => e.exercise_name === name);
    if (existing.length === 0) return 1;
    return Math.max(...existing.map(e => parseInt(e.set_number) || 0)) + 1;
  }

  async function handleAddSet(e) {
    e.preventDefault();
    const exercise = currentExercise || exerciseInput.trim();
    if (!exercise || !reps || !weight) return;
    setError('');
    setSubmitting(true);
    try {
      const setNum = nextSetFor(exercise);
      const result = await addEntry(logId, exercise, setNum, parseInt(reps), parseFloat(weight));
      setEntries(prev => [...prev, result.entry]);
      if (result.pr_hit) onPR(exercise, result.pr_metric);
      // Lock exercise name after first add, clear only reps + weight
      if (!currentExercise) setCurrentExercise(exercise);
      setReps('');
      setWeight('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleNextExercise() {
    setCurrentExercise('');
    setExerciseInput('');
    setReps('');
    setWeight('');
  }

  function startEdit(entry) {
    setEditId(entry.ROWID);
    setEditReps(String(entry.reps));
    setEditWeight(String(entry.weight));
  }

  function cancelEdit() {
    setEditId(null);
    setEditReps('');
    setEditWeight('');
  }

  async function handleSaveEdit(entry) {
    setSaving(true);
    try {
      const updated = await updateEntry(
        entry.ROWID,
        entry.exercise_name,
        entry.set_number,
        parseInt(editReps),
        parseFloat(editWeight)
      );
      setEntries(prev => prev.map(e => e.ROWID === entry.ROWID ? { ...e, ...updated } : e));
      cancelEdit();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entryId) {
    try {
      await deleteEntry(entryId);
      setEntries(prev => prev.filter(e => e.ROWID !== entryId));
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <div className="loading">Loading entries…</div>;

  const { groups, order, maxSets } = buildPivot(entries);
  const knownExercises = order;
  const isLocked = !!currentExercise;

  return (
    <div className="exercise-table-wrap">
      {order.length > 0 && (
        <div className="table-scroll">
          <table className="exercise-table">
            <thead>
              <tr>
                <th>Exercise</th>
                {Array.from({ length: maxSets }, (_, i) => (
                  <th key={i}>Set {i + 1}</th>
                ))}
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
                      if (!s) return <td key={i} className="set-cell">—</td>;

                      if (editId === s.ROWID) {
                        return (
                          <td key={i} className="set-cell set-cell-editing">
                            <input
                              type="number"
                              value={editWeight}
                              onChange={e => setEditWeight(e.target.value)}
                              placeholder="kg"
                              min="0"
                              step="0.5"
                            />
                            <span>×</span>
                            <input
                              type="number"
                              value={editReps}
                              onChange={e => setEditReps(e.target.value)}
                              placeholder="reps"
                              min="1"
                            />
                            <div className="row-actions">
                              <button className="btn-icon btn-save" onClick={() => handleSaveEdit(s)} disabled={saving} title="Save">✓</button>
                              <button className="btn-icon btn-cancel" onClick={cancelEdit} title="Cancel">✕</button>
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td key={i} className="set-cell set-cell-hover">
                          <span className="set-val">{parseFloat(s.weight)}kg × {s.reps}</span>
                          <div className="row-actions">
                            <button className="btn-icon btn-edit" onClick={() => startEdit(s)} title="Edit">✏</button>
                            <button className="btn-icon btn-del"  onClick={() => handleDelete(s.ROWID)} title="Delete">✕</button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add-set form */}
      <form className="add-entry-form" onSubmit={handleAddSet}>
        {isLocked ? (
          <div className="exercise-locked">
            <span className="locked-name">{currentExercise}</span>
            <button type="button" className="btn-next-exercise" onClick={handleNextExercise}>
              + Next Exercise
            </button>
          </div>
        ) : (
          <input
            type="text"
            placeholder="Exercise name"
            value={exerciseInput}
            onChange={e => setExerciseInput(e.target.value)}
            list="exercise-datalist"
            required
          />
        )}
        <datalist id="exercise-datalist">
          {knownExercises.map(n => <option key={n} value={n} />)}
        </datalist>
        <input
          type="number"
          placeholder="Reps"
          value={reps}
          onChange={e => setReps(e.target.value)}
          min="1"
          required
        />
        <input
          type="number"
          placeholder="kg"
          value={weight}
          onChange={e => setWeight(e.target.value)}
          min="0"
          step="0.5"
          required
        />
        <button type="submit" disabled={submitting}>
          {submitting ? '…' : 'Add Set'}
        </button>
      </form>

      {error && <p className="empty" style={{ color: '#ff6b6b' }}>{error}</p>}
    </div>
  );
}
