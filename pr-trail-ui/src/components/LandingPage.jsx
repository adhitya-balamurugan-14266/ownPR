import { useState } from 'react';
import CurrentPRsModal from './CurrentPRsModal.jsx';

export default function LandingPage({ onStart }) {
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
      {showCurrentPRs && <CurrentPRsModal onClose={() => setShowCurrentPRs(false)} />}
    </div>
  );
}
