'use strict';
const catalyst = require('zcatalyst-sdk-node');

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    if (req.body && typeof req.body === 'string') {
      try { return resolve(JSON.parse(req.body)); } catch { return resolve({}); }
    }
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function boolVal(val) {
  return val === 'true' || val === true;
}

function flatRow(row, tableName) {
  return row[tableName] || row;
}

// Exercises where LESS weight means MORE strength (assisted machines)
const INVERTED_WEIGHT_EXERCISES = new Set(['Assisted Dips', 'Assisted Pullups']);

function aggregateWeight(entries, inverted) {
  const weights = entries.map(e => parseFloat(e.weight)).filter(w => !isNaN(w));
  if (weights.length === 0) return inverted ? Infinity : 0;
  return inverted ? Math.min(...weights) : Math.max(...weights);
}

function isWeightImprovement(curr, hist, inverted) {
  return inverted ? curr < hist : curr > hist;
}

async function fetchAll(zcql, baseQuery, tableName) {
  const rows = [];
  let offset = 0;
  const pageSize = 200;
  while (true) {
    const result = await zcql.executeZCQLQuery(`${baseQuery} LIMIT ${offset}, ${pageSize}`);
    const page = result.map(r => r[tableName]).filter(Boolean);
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function checkPR(zcql, datastore, exerciseName, logId) {
  const safeName = exerciseName.replace(/'/g, "''");
  const inverted = INVERTED_WEIGHT_EXERCISES.has(exerciseName);

  const closedResult = await zcql.executeZCQLQuery(
    `SELECT ROWID FROM WorkoutLog WHERE is_closed = 'true' LIMIT 0, 300`
  );
  const closedIds = new Set(
    closedResult.map(r => r.WorkoutLog).filter(Boolean).map(r => String(r.ROWID))
  );

  if (closedIds.size === 0) return { pr_hit: false, pr_metric: null };

  const allEntryResult = await zcql.executeZCQLQuery(
    `SELECT * FROM ExerciseEntry WHERE exercise_name = '${safeName}' LIMIT 0, 300`
  );
  const pastEntries = allEntryResult
    .map(r => r.ExerciseEntry)
    .filter(Boolean)
    .filter(e => String(e.log_id) !== String(logId) && closedIds.has(String(e.log_id)));

  if (pastEntries.length === 0) return { pr_hit: false, pr_metric: null };

  const pastBySession = {};
  for (const e of pastEntries) {
    const lid = String(e.log_id);
    if (!pastBySession[lid]) pastBySession[lid] = [];
    pastBySession[lid].push(e);
  }

  let histBestWeight = inverted ? Infinity : 0, histBestReps = 0, histBestSets = 0;
  for (const entries of Object.values(pastBySession)) {
    const maxW = aggregateWeight(entries, inverted);
    const maxR = Math.max(...entries.map(e => parseInt(e.reps) || 0));
    const setCount = entries.length;
    if (isWeightImprovement(maxW, histBestWeight, inverted)) histBestWeight = maxW;
    if (maxR > histBestReps)   histBestReps   = maxR;
    if (setCount > histBestSets) histBestSets  = setCount;
  }

  const currRows = await zcql.executeZCQLQuery(
    `SELECT * FROM ExerciseEntry WHERE log_id = '${logId}' AND exercise_name = '${safeName}' LIMIT 0, 300`
  );
  const currEntries = currRows.map(r => r.ExerciseEntry).filter(Boolean);
  if (currEntries.length === 0) return { pr_hit: false, pr_metric: null };

  const currWeight = aggregateWeight(currEntries, inverted);
  const currReps   = Math.max(...currEntries.map(e => parseInt(e.reps) || 0));
  const currSets   = currEntries.length;

  // Collect ALL PRs hit in this set (can be multiple)
  const prs = [];
  if (isWeightImprovement(currWeight, histBestWeight, inverted)) prs.push({ metric: 'weight', previous_best: histBestWeight, new_best: currWeight });
  if (currReps   > histBestReps)   prs.push({ metric: 'reps',   previous_best: histBestReps,   new_best: currReps });
  if (currSets   > histBestSets)   prs.push({ metric: 'sets',   previous_best: histBestSets,   new_best: currSets });

  if (prs.length === 0) return { pr_hit: false, pr_metric: null };

  // Persist each PR to PRRecord table (deduplicate: skip if same log+exercise+metric exists)
  for (const pr of prs) {
    try {
      await datastore.table('PRRecord').insertRow({
        log_id:        logId,
        exercise_name: exerciseName,
        metric:        pr.metric,
        previous_best: pr.previous_best,
        new_best:      pr.new_best
      });
    } catch (e) {
      // Non-fatal: log but continue
      console.error('PRRecord insert error:', e.message);
    }
  }

  return { pr_hit: true, pr_metric: prs[0].metric, previous_best: prs[0].previous_best, new_best: prs[0].new_best };
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  }

  try {
    const adminApp = catalyst.initialize(req, { scope: 'admin' });
    const datastore = adminApp.datastore();
    const zcql = adminApp.zcql();

    const parsedUrl = new URL(req.url, `https://${req.headers.host}`);
    const path = parsedUrl.pathname;
    const method = req.method;

    // POST /log
    if (method === 'POST' && path.endsWith('/log')) {
      const body = await getBody(req);
      const { log_date, body_part, preworkout_taken, preworkout_qty } = body;
      const inserted = await datastore.table('WorkoutLog').insertRow({
        log_date,
        body_part,
        preworkout_taken: preworkout_taken ? 'true' : 'false',
        preworkout_qty:   preworkout_qty || 0,
        bcaa_taken:       'false',
        bcaa_qty:         0,
        is_closed:        'false'
      });
      const row = flatRow(inserted, 'WorkoutLog');
      return sendJson(res, 201, {
        ...row,
        preworkout_taken: boolVal(row.preworkout_taken),
        bcaa_taken:       boolVal(row.bcaa_taken),
        is_closed:        boolVal(row.is_closed)
      });
    }

    // POST /entry
    if (method === 'POST' && path.endsWith('/entry')) {
      const body = await getBody(req);
      const { log_id, exercise_name, set_number, reps, weight } = body;
      const inserted = await datastore.table('ExerciseEntry').insertRow({
        log_id,
        exercise_name,
        set_number,
        reps,
        weight
      });
      const entry = flatRow(inserted, 'ExerciseEntry');
      // Auto-register exercise name (unique constraint swallows duplicates)
      try { await datastore.table('ExerciseLibrary').insertRow({ name: exercise_name }); } catch { /* already exists */ }
      const { pr_hit, pr_metric, previous_best, new_best } = await checkPR(zcql, datastore, exercise_name, log_id);
      return sendJson(res, 201, { entry, pr_hit, pr_metric, previous_best, new_best });
    }

    // GET /logs
    if (method === 'GET' && path.endsWith('/logs')) {
      const result = await zcql.executeZCQLQuery(
        'SELECT * FROM WorkoutLog ORDER BY log_date DESC LIMIT 0, 300'
      );
      const rows = result.map(r => r.WorkoutLog).filter(Boolean).map(r => ({
        ...r,
        preworkout_taken: boolVal(r.preworkout_taken),
        bcaa_taken:       boolVal(r.bcaa_taken),
        is_closed:        boolVal(r.is_closed)
      }));
      return sendJson(res, 200, rows);
    }

    // GET /log/:id/entries
    const entriesMatch = path.match(/\/log\/(\d+)\/entries$/);
    if (method === 'GET' && entriesMatch) {
      const logId = entriesMatch[1];
      const result = await zcql.executeZCQLQuery(
        `SELECT * FROM ExerciseEntry WHERE log_id = '${logId}' ORDER BY ROWID ASC LIMIT 0, 300`
      );
      const entries = result.map(r => r.ExerciseEntry).filter(Boolean);
      return sendJson(res, 200, entries);
    }

    // PUT /log/:id/close
    const closeMatch = path.match(/\/log\/(\d+)\/close$/);
    if (method === 'PUT' && closeMatch) {
      const logId = closeMatch[1];
      const body = await getBody(req);
      const { bcaa_taken, bcaa_qty } = body;
      const updated = await datastore.table('WorkoutLog').updateRow({
        ROWID:      logId,
        bcaa_taken: bcaa_taken ? 'true' : 'false',
        bcaa_qty:   bcaa_qty || 0,
        is_closed:  'true'
      });
      const row = flatRow(updated, 'WorkoutLog');
      return sendJson(res, 200, {
        ...row,
        preworkout_taken: boolVal(row.preworkout_taken),
        bcaa_taken:       boolVal(row.bcaa_taken),
        is_closed:        boolVal(row.is_closed)
      });
    }

    // GET /exercises  (alphabetical list from ExerciseLibrary)
    if (method === 'GET' && path.endsWith('/exercises')) {
      const result = await zcql.executeZCQLQuery(
        'SELECT * FROM ExerciseLibrary ORDER BY name ASC LIMIT 0, 300'
      );
      const names = result.map(r => r.ExerciseLibrary?.name).filter(Boolean);
      return sendJson(res, 200, names);
    }

    // PUT /entry/:id  (edit a single set)
    const editEntryMatch = path.match(/\/entry\/(\d+)$/);
    if (method === 'PUT' && editEntryMatch) {
      const entryId = editEntryMatch[1];
      const body = await getBody(req);
      const { exercise_name, set_number, reps, weight } = body;
      const updated = await datastore.table('ExerciseEntry').updateRow({
        ROWID:         entryId,
        exercise_name,
        set_number,
        reps,
        weight
      });
      // Auto-register renamed exercise name
      if (exercise_name) {
        try { await datastore.table('ExerciseLibrary').insertRow({ name: exercise_name }); } catch { /* already exists */ }
      }
      return sendJson(res, 200, flatRow(updated, 'ExerciseEntry'));
    }

    // DELETE /entry/:id  (delete a single set)
    const deleteEntryMatch = path.match(/\/entry\/(\d+)$/);
    if (method === 'DELETE' && deleteEntryMatch) {
      const entryId = deleteEntryMatch[1];
      await datastore.table('ExerciseEntry').deleteRow(entryId);
      return sendJson(res, 200, { deleted: true });
    }

    // POST /backfill-prs  (one-time: compute PRs for all historical sessions)
    if (method === 'POST' && path.endsWith('/backfill-prs')) {
      // Fetch all closed logs in chronological order (paginated)
      const closedLogs = await fetchAll(
        zcql,
        `SELECT * FROM WorkoutLog WHERE is_closed = 'true' ORDER BY log_date ASC`,
        'WorkoutLog'
      );

      // Fetch all entries (paginated)
      const allEntries = await fetchAll(zcql, `SELECT * FROM ExerciseEntry`, 'ExerciseEntry');
      const entriesByLog = {};
      for (const e of allEntries) {
        const key = String(e.log_id);
        if (!entriesByLog[key]) entriesByLog[key] = [];
        entriesByLog[key].push(e);
      }

      // Clear existing PR records to avoid duplicates (paginated)
      const oldPrs = await fetchAll(zcql, `SELECT * FROM PRRecord`, 'PRRecord');
      for (const p of oldPrs) {
        await datastore.table('PRRecord').deleteRow(p.ROWID);
      }

      // Walk sessions chronologically, tracking running bests per exercise
      const runningBests = {};
      let prCount = 0;

      for (const log of closedLogs) {
        const logId = String(log.ROWID);
        const entries = entriesByLog[logId] || [];

        const byExercise = {};
        for (const e of entries) {
          if (!byExercise[e.exercise_name]) byExercise[e.exercise_name] = [];
          byExercise[e.exercise_name].push(e);
        }

        for (const [name, exEntries] of Object.entries(byExercise)) {
          const inverted = INVERTED_WEIGHT_EXERCISES.has(name);
          const maxW = aggregateWeight(exEntries, inverted);
          const maxR = Math.max(...exEntries.map(e => parseInt(e.reps) || 0));
          const sets = exEntries.length;
          const prev = runningBests[name];

          if (!prev) {
            // First-ever session for this exercise — no PR to record
            runningBests[name] = { weight: maxW, reps: maxR, sets };
            continue;
          }

          if (isWeightImprovement(maxW, prev.weight, inverted)) {
            await datastore.table('PRRecord').insertRow({ log_id: logId, exercise_name: name, metric: 'weight', previous_best: prev.weight, new_best: maxW });
            prev.weight = maxW;
            prCount++;
          }
          if (maxR > prev.reps) {
            await datastore.table('PRRecord').insertRow({ log_id: logId, exercise_name: name, metric: 'reps',   previous_best: prev.reps,   new_best: maxR });
            prev.reps = maxR;
            prCount++;
          }
          if (sets > prev.sets) {
            await datastore.table('PRRecord').insertRow({ log_id: logId, exercise_name: name, metric: 'sets',   previous_best: prev.sets,   new_best: sets });
            prev.sets = sets;
            prCount++;
          }
        }
      }

      return sendJson(res, 200, { backfilled: prCount });
    }

    // GET /prs  (all PR records, enriched with log_date for reliable client-side matching)
    if (method === 'GET' && path.endsWith('/prs')) {
      const prs  = await fetchAll(zcql, 'SELECT * FROM PRRecord', 'PRRecord');
      const logs = await fetchAll(zcql, 'SELECT * FROM WorkoutLog', 'WorkoutLog');
      const logDateById = {};
      for (const l of logs) {
        logDateById[String(l.ROWID)] = l.log_date;
      }
      const enriched = prs.map(pr => ({
        ...pr,
        log_date: logDateById[String(pr.log_id)] || null
      }));
      return sendJson(res, 200, enriched);
    }

    // GET /current-prs  (one row per exercise: current standing best weight/reps/sets)
    if (method === 'GET' && path.endsWith('/current-prs')) {
      const allEntries = await fetchAll(zcql, `SELECT * FROM ExerciseEntry`, 'ExerciseEntry');
      const entriesByLog = {};
      for (const e of allEntries) {
        const key = String(e.log_id);
        if (!entriesByLog[key]) entriesByLog[key] = [];
        entriesByLog[key].push(e);
      }

      const bestByExercise = {};
      for (const entries of Object.values(entriesByLog)) {
        const byExercise = {};
        for (const e of entries) {
          if (!byExercise[e.exercise_name]) byExercise[e.exercise_name] = [];
          byExercise[e.exercise_name].push(e);
        }
        for (const [name, exEntries] of Object.entries(byExercise)) {
          const inverted = INVERTED_WEIGHT_EXERCISES.has(name);
          const sessionWeight = aggregateWeight(exEntries, inverted);
          const sessionReps   = Math.max(...exEntries.map(e => parseInt(e.reps) || 0));
          const sessionSets   = exEntries.length;
          const prev = bestByExercise[name];
          if (!prev) {
            bestByExercise[name] = { exercise_name: name, weight: sessionWeight, reps: sessionReps, sets: sessionSets };
            continue;
          }
          if (isWeightImprovement(sessionWeight, prev.weight, inverted)) prev.weight = sessionWeight;
          if (sessionReps > prev.reps) prev.reps = sessionReps;
          if (sessionSets > prev.sets) prev.sets = sessionSets;
        }
      }

      const currentPRs = Object.values(bestByExercise).sort((a, b) => a.exercise_name.localeCompare(b.exercise_name));
      return sendJson(res, 200, currentPRs);
    }

    // GET /export  (full data export: all logs with nested entries, plus all PR records)
    if (method === 'GET' && path.endsWith('/export')) {
      const [logs, entries, prs] = await Promise.all([
        fetchAll(zcql, 'SELECT * FROM WorkoutLog', 'WorkoutLog'),
        fetchAll(zcql, 'SELECT * FROM ExerciseEntry', 'ExerciseEntry'),
        fetchAll(zcql, 'SELECT * FROM PRRecord', 'PRRecord')
      ]);

      const entriesByLog = {};
      for (const e of entries) {
        const key = String(e.log_id);
        if (!entriesByLog[key]) entriesByLog[key] = [];
        entriesByLog[key].push(e);
      }

      const logDateById = {};
      const exportedLogs = logs.map(l => {
        logDateById[String(l.ROWID)] = l.log_date;
        return {
          ...l,
          preworkout_taken: boolVal(l.preworkout_taken),
          bcaa_taken:       boolVal(l.bcaa_taken),
          is_closed:        boolVal(l.is_closed),
          entries:          entriesByLog[String(l.ROWID)] || []
        };
      });

      const exportedPrs = prs.map(pr => ({
        ...pr,
        log_date: logDateById[String(pr.log_id)] || null
      }));

      return sendJson(res, 200, {
        exported_at: new Date().toISOString(),
        logs: exportedLogs,
        prs: exportedPrs
      });
    }

    // DELETE /log/:id
    const deleteMatch = path.match(/\/log\/(\d+)$/);
    if (method === 'DELETE' && deleteMatch) {
      const logId = deleteMatch[1];
      const entryRows = await zcql.executeZCQLQuery(
        `SELECT * FROM ExerciseEntry WHERE log_id = '${logId}' LIMIT 0, 300`
      );
      const entries = entryRows.map(r => r.ExerciseEntry).filter(Boolean);
      for (const e of entries) {
        await datastore.table('ExerciseEntry').deleteRow(e.ROWID);
      }
      // Also delete PR records for this log (best-effort — never block the log deletion)
      try {
        const prRows = await zcql.executeZCQLQuery(
          `SELECT * FROM PRRecord WHERE log_id = '${logId}' LIMIT 0, 300`
        );
        const prs = prRows.map(r => r.PRRecord).filter(Boolean);
        for (const p of prs) {
          await datastore.table('PRRecord').deleteRow(p.ROWID);
        }
      } catch { /* PR records may not exist for this log — continue */ }
      await datastore.table('WorkoutLog').deleteRow(logId);
      return sendJson(res, 200, { deleted: true });
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('pr_trail_api error:', err.message);
    sendJson(res, 500, { error: err.message });
  }
};
