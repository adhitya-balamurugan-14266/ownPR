'use strict';
const catalyst = require('zcatalyst-sdk-node');

// Verified Catalyst Mail sender; reminders go to each app user's own email
const SENDER_EMAIL = 'adhitya.balamurugan@zohocorp.com';

function dateStr(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function consecutiveRestDays(logDates) {
  let count = 0;
  const check = new Date();
  check.setDate(check.getDate() - 1);
  for (let i = 0; i < 60; i++) {
    if (logDates.has(dateStr(check))) break;
    count++;
    check.setDate(check.getDate() - 1);
  }
  return count;
}

module.exports = async (jobData, context) => {
  try {
    const app  = catalyst.initialize(context, { scope: 'admin' });
    const zcql = app.zcql();
    const users = await app.userManagement().getAllUsers();

    for (const user of users) {
      const uid = String(user.user_id);
      if (!/^\d+$/.test(uid) || !user.email_id) continue;

      const result = await zcql.executeZCQLQuery(
        `SELECT log_date FROM WorkoutLog WHERE owner_id = '${uid}' ORDER BY log_date DESC LIMIT 0, 300`
      );
      const logDates = new Set(result.map(r => r.WorkoutLog?.log_date).filter(Boolean));
      if (logDates.size === 0) {
        console.log(`[rest_day_checker] ${user.email_id}: no logs, skipping.`);
        continue;
      }

      const rest = consecutiveRestDays(logDates);
      console.log(`[rest_day_checker] ${user.email_id}: ${rest} consecutive REST days`);

      if (rest >= 3) {
        await app.email().sendMail({
          from_email: SENDER_EMAIL,
          to_email:   [user.email_id],
          subject:    'Move your Ass',
          content:    "Hit your PRs don't lose out on the progress just cause you're lazy....",
        });
        console.log(`[rest_day_checker] Reminder sent to ${user.email_id}.`);
      }
    }

    context.closeWithSuccess();
  } catch (err) {
    console.error('[rest_day_checker] Error:', err.message);
    context.closeWithFailure();
  }
};
