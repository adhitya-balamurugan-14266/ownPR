'use strict';
const catalyst = require('zcatalyst-sdk-node');

const OWNER_EMAIL = 'adhitya.balamurugan@zohocorp.com';

function dateStr(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

module.exports = async (jobData, context) => {
  try {
    const app  = catalyst.initialize(context, { scope: 'admin' });
    const zcql = app.zcql();

    const result = await zcql.executeZCQLQuery(
      'SELECT log_date FROM WorkoutLog ORDER BY log_date DESC LIMIT 0, 300'
    );
    const logDates = new Set(
      result.map(r => r.WorkoutLog?.log_date).filter(Boolean)
    );

    if (logDates.size === 0) {
      console.log('[rest_day_checker] No logs found — skipping.');
      context.closeWithSuccess();
      return;
    }

    // Count consecutive REST days going backwards from yesterday
    let consecutiveRest = 0;
    const check = new Date();
    check.setDate(check.getDate() - 1);

    for (let i = 0; i < 60; i++) {
      if (logDates.has(dateStr(check))) break;
      consecutiveRest++;
      check.setDate(check.getDate() - 1);
    }

    console.log(`[rest_day_checker] Consecutive REST days: ${consecutiveRest}`);

    if (consecutiveRest >= 2) {
      const email = app.email();
      await email.sendMail({
        from_email: OWNER_EMAIL,
        to_email:   [OWNER_EMAIL],
        subject:    'Move your Ass',
        content:    "Hit your PRs don't lose out on the progress just cause you're lazy....",
      });
      console.log('[rest_day_checker] Reminder email sent.');
    } else {
      console.log('[rest_day_checker] No reminder needed.');
    }

    context.closeWithSuccess();
  } catch (err) {
    console.error('[rest_day_checker] Error:', err.message);
    context.closeWithFailure();
  }
};
