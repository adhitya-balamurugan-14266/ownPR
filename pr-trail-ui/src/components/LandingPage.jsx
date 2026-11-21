import { useState } from 'react';
import CurrentPRsModal from './CurrentPRsModal.jsx';
import { signOut } from '../api.js';

export default function LandingPage({ onStart, user }) {
  const [showCurrentPRs, setShowCurrentPRs] = useState(false);

  return (
    <div className="landing">
      <div className="landing-logo-wrap">
        <img src="/hypertrophymax-logo.png" alt="HypertrophyMAX" className="landing-logo" />
      </div>
      <div className="landing-actions">
        <button className="landing-cta" onClick={onStart}>
          Power Through Now
        </button>
        <button className="landing-secondary" onClick={() => setShowCurrentPRs(true)}>
          Current PRs
        </button>
      </div>
      {user && (
        <p className="landing-user">
          Signed in as {user.email_id || 'you'} · <button className="link-btn" onClick={signOut}>Log out</button>
        </p>
      )}
      {showCurrentPRs && <CurrentPRsModal onClose={() => setShowCurrentPRs(false)} />}
    </div>
  );
}
