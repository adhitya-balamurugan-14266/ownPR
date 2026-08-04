import { useEffect } from 'react';

const METRIC_LABELS = {
  weight: 'Weight increased',
  reps:   'Reps increased',
  sets:   'More sets completed',
};

export default function PRBanner({ exerciseName, prMetric, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="pr-banner" role="status" onClick={onDismiss}>
      <span className="pr-icon">⚡</span>
      <span className="pr-text">
        New PR on <strong>{exerciseName}</strong>! {METRIC_LABELS[prMetric] ?? 'New record'}.
      </span>
      <span className="pr-dismiss" aria-label="Dismiss">✕</span>
    </div>
  );
}
