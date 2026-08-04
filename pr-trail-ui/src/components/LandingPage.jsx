export default function LandingPage({ onStart }) {
  return (
    <div className="landing">
      <div className="landing-logo-wrap">
        <img src="/ownpr-logo.png" alt="OwnPR" className="landing-logo" />
      </div>
      <button className="landing-cta" onClick={onStart}>
        Power Through Now
      </button>
    </div>
  );
}
