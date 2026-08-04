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

async function checkPR(zcql, exerciseName, logId) {
  const safeName = exerciseName.replace(/'/g, "''");

  // Fetch closed log IDs and all entries for this exercise separately (no JOIN)
  const closedResult = await zcql.executeZCQLQuery(
    `SELECT ROWID FROM WorkoutLog WHERE is_closed = 'true' LIMIT 0, 300`
  );
  const closedIds = new Set(
    closedResult.map(r => r.WorkoutLog).filter(Boolean).map(r => String(r.ROWID))
  );

  if (closedIds.size === 0) {
    return { pr_hit: false, pr_metric: null };
  }

  const allEntryResult = await zcql.executeZCQLQuery(
    `SELECT * FROM ExerciseEntry WHERE exercise_name = '${safeName}' LIMIT 0, 300`
  );
  const pastEntries = allEntryResult
    .map(r => r.ExerciseEntry)
    .filter(Boolean)
    .filter(e => String(e.log_id) !== String(logId) && closedIds.has(String(e.log_id)));

  if (pastEntries.length === 0) {
    return { pr_hit: false, pr_metric: null };
  }

  const pastBySession = {};
  for (const e of pastEntries) {
    const lid = String(e.log_id);
    if (!pastBySession[lid]) pastBySession[lid] = [];
    pastBySession[lid].push(e);
  }

  let histBestWeight = 0, histBestReps = 0, histBestSets = 0;
  for (const entries of Object.values(pastBySession)) {
    const maxW = Math.max(...entries.map(e => parseFloat(e.weight) || 0));
    const maxR = Math.max(...entries.map(e => parseInt(e.reps) || 0));
    const setCount = entries.length;
    if (maxW > histBestWeight) histBestWeight = maxW;
    if (maxR > histBestReps)   histBestReps   = maxR;
    if (setCount > histBestSets) histBestSets  = setCount;
  }

  const currRows = await zcql.executeZCQLQuery(
    `SELECT * FROM ExerciseEntry WHERE log_id = '${logId}' AND exercise_name = '${safeName}' LIMIT 0, 300`
  );
  const currEntries = currRows.map(r => r.ExerciseEntry).filter(Boolean);

  if (currEntries.length === 0) return { pr_hit: false, pr_metric: null };

  const currWeight = Math.max(...currEntries.map(e => parseFloat(e.weight) || 0));
  const currReps   = Math.max(...currEntries.map(e => parseInt(e.reps) || 0));
  const currSets   = currEntries.length;

  if (currWeight > histBestWeight) return { pr_hit: true, pr_metric: 'weight' };
  if (currReps   > histBestReps)   return { pr_hit: true, pr_metric: 'reps' };
  if (currSets   > histBestSets)   return { pr_hit: true, pr_metric: 'sets' };

  return { pr_hit: false, pr_metric: null };
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
      const { pr_hit, pr_metric } = await checkPR(zcql, exercise_name, log_id);
      return sendJson(res, 201, { entry, pr_hit, pr_metric });
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
        `SELECT * FROM ExerciseEntry WHERE log_id = '${logId}' ORDER BY set_number ASC LIMIT 0, 300`
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
      return sendJson(res, 200, flatRow(updated, 'ExerciseEntry'));
    }

    // DELETE /entry/:id  (delete a single set)
    const deleteEntryMatch = path.match(/\/entry\/(\d+)$/);
    if (method === 'DELETE' && deleteEntryMatch) {
      const entryId = deleteEntryMatch[1];
      await datastore.table('ExerciseEntry').deleteRow(entryId);
      return sendJson(res, 200, { deleted: true });
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
      await datastore.table('WorkoutLog').deleteRow(logId);
      return sendJson(res, 200, { deleted: true });
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('pr_trail_api error:', err.message);
    sendJson(res, 500, { error: err.message });
  }
};
