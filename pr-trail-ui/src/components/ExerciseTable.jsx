import { useState, useEffect } from 'react';
import { addEntry, fetchEntries, updateEntry, deleteEntry, fetchExercises } from '../api.js';

// Exercises where LESS weight means MORE strength (assisted machines)
const INVERTED_WEIGHT_EXERCISES = new Set(['Assisted Dips', 'Assisted Pullups']);

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
  const maxSets = order.length === 0 ? 0 : Math.max(
    ...order.map(n => Math.max(...groups[n].map(e => parseInt(e.set_number) || 0)))
  );
  return { groups, order, maxSets };
}

export default function ExerciseTable({ logId, onPR }) {
  const [entries,         setEntries]         = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');

  const [currentExercise, setCurrentExercise] = useState('');
  const [exerciseInput,   setExerciseInput]   = useState('');
  const [weight,          setWeight]          = useState('');
  const [reps,            setReps]            = useState('');
  const [submitting,      setSubmitting]      = useState(false);

  // Inline cell edit state
  const [editId,     setEditId]     = useState(null);
  const [editWeight, setEditWeight] = useState('');
  const [editReps,   setEditReps]   = useState('');

  // Exercise rename state
  const [renamingExercise, setRenamingExercise] = useState(null);
  const [renameValue,      setRenameValue]      = useState('');

  const [savedExercises, setSavedExercises] = useState([]);
  // PR records hit this session: { [exercise_name]: [{ metric, new_best }, ...] }
  const [sessionPRs, setSessionPRs] = useState({});

  useEffect(() => {
    Promise.all([fetchEntries(logId), fetchExercises()])
      .then(([entries, names]) => {
        setEntries(entries);
        setSavedExercises(names);
      })
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
    if (!exercise || !weight || !reps) return;
    setError('');
    setSubmitting(true);
    try {
      const setNum = nextSetFor(exercise);
      const result = await addEntry(logId, exercise, setNum, parseInt(reps), parseFloat(weight));
      setEntries(prev => [...prev, result.entry]);
      if (result.pr_hit) {
        onPR(exercise, result.pr_metric);
        setSessionPRs(prev => {
          const existing = prev[exercise] || [];
          return { ...prev, [exercise]: [...existing, { metric: result.pr_metric, new_best: result.new_best }] };
        });
      }
      if (!currentExercise) {
        setCurrentExercise(exercise);
        // Backend auto-inserts the new name; update local list optimistically
        setSavedExercises(prev => [...new Set([...prev, exercise])].sort());
      }
      setWeight('');
      setReps('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleNextExercise() {
    setCurrentExercise('');
    setExerciseInput('');
    setWeight('');
    setReps('');
  }

  // ── Cell blur: commit or delete ───────────────────────────────────────────
  function startEdit(entry) {
    setEditId(entry.ROWID);
    setEditWeight(String(entry.weight));
    setEditReps(String(entry.reps));
  }

  async function handleCellBlur(entry, e) {
    if (e.currentTarget.contains(e.relatedTarget)) return; // focus still inside cell

    const w = editWeight.trim();
    const r = editReps.trim();

    setEditId(null);
    setEditWeight('');
    setEditReps('');

    if (!w && !r) {
      // Both cleared → delete
      try {
        await deleteEntry(entry.ROWID);
        setEntries(prev => prev.filter(en => en.ROWID !== entry.ROWID));
      } catch (err) {
        setError(err.message);
      }
    } else {
      // Save with provided values; fall back to original if a field was left blank
      const newWeight = w !== '' ? parseFloat(w) : parseFloat(entry.weight);
      const newReps   = r !== '' ? parseInt(r)   : parseInt(entry.reps);
      if (newWeight === parseFloat(entry.weight) && newReps === parseInt(entry.reps)) return;
      try {
        const updated = await updateEntry(entry.ROWID, entry.exercise_name, entry.set_number, newReps, newWeight);
        setEntries(prev => prev.map(en => en.ROWID === entry.ROWID ? { ...en, ...updated } : en));
      } catch (err) {
        setError(err.message);
      }
    }
  }

  // ── Exercise rename ───────────────────────────────────────────────────────
  function startRename(name) {
    setRenamingExercise(name);
    setRenameValue(name);
  }

  async function handleRenameBlur(oldName) {
    const newName = renameValue.trim();
    setRenamingExercise(null);
    if (!newName || newName === oldName) return;

    const toRename = entries.filter(e => e.exercise_name === oldName);
    try {
      await Promise.all(
        toRename.map(e => updateEntry(e.ROWID, newName, e.set_number, parseInt(e.reps), parseFloat(e.weight)))
      );
      setEntries(prev => prev.map(e => e.exercise_name === oldName ? { ...e, exercise_name: newName } : e));
      if (currentExercise === oldName) setCurrentExercise(newName);
      // Backend auto-inserts the renamed name; update local list optimistically
      setSavedExercises(prev => [...new Set([...prev, newName])].sort());
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <div className="loading">Loading entries…</div>;

  const { groups, order, maxSets } = buildPivot(entries);
  const knownExercises = order;
  const allExercises = [...new Set([...savedExercises, ...knownExercises])].sort();

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
                    <td className="exercise-name">
                      {renamingExercise === name ? (
                        <input
                          className="rename-input"
                          type="text"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => handleRenameBlur(name)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') e.target.blur();
                            if (e.key === 'Escape') setRenamingExercise(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="exercise-name-text"
                          onDoubleClick={() => startRename(name)}
                          title="Double-click to rename"
                        >
                          {name}
                        </span>
                      )}
                    </td>
                    {Array.from({ length: maxSets }, (_, i) => {
                      const s = sets.find(e => parseInt(e.set_number) === i + 1);
                      if (!s) return <td key={i} className="set-cell">—</td>;

                      const prsForEx = sessionPRs[name] || [];
                      const weightPR = prsForEx.find(p => p.metric === 'weight');
                      const repsPR   = prsForEx.find(p => p.metric === 'reps');
                      const setsPR   = prsForEx.find(p => p.metric === 'sets');
                      const isWPR = weightPR && (INVERTED_WEIGHT_EXERCISES.has(name)
                        ? parseFloat(s.weight) <= parseFloat(weightPR.new_best)
                        : parseFloat(s.weight) >= parseFloat(weightPR.new_best));
                      const isRPR = repsPR   && parseInt(s.reps)     >= parseInt(repsPR.new_best);
                      const isSPR = setsPR   && s === sets[sets.length - 1] && sets.length >= parseInt(setsPR.new_best);
                      const isPR  = isWPR || isRPR || isSPR;

                      if (editId === s.ROWID) {
                        return (
                          <td
                            key={i}
                            className="set-cell set-cell-editing"
                            onBlur={e => handleCellBlur(s, e)}
                          >
                            <input
                              type="number"
                              value={editWeight}
                              onChange={e => setEditWeight(e.target.value)}
                              placeholder="kg"
                              min="0"
                              step="0.5"
                              autoFocus
                            />
                            <span className="set-sep">×</span>
                            <input
                              type="number"
                              value={editReps}
                              onChange={e => setEditReps(e.target.value)}
                              placeholder="reps"
                              min="1"
                              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                            />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={i}
                          className={`set-cell set-cell-editable${isPR ? ' pr-cell' : ''}`}
                          onDoubleClick={() => startEdit(s)}
                          title="Double-click to edit · clear both fields to delete"
                        >
                          <span className="set-val">{parseFloat(s.weight)}kg × {s.reps}</span>
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
      )}

      <form className="add-entry-form" onSubmit={handleAddSet}>
        {currentExercise ? (
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
          {allExercises.map(n => <option key={n} value={n} />)}
        </datalist>
        <input
          type="number"
          placeholder="kg"
          value={weight}
          onChange={e => setWeight(e.target.value)}
          min="0"
          step="0.5"
          required
        />
        <input
          type="number"
          placeholder="Reps"
          value={reps}
          onChange={e => setReps(e.target.value)}
          min="1"
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
