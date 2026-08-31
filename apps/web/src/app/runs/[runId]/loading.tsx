export default function RunLoading() {
  return (
    <div className="run-page">
      <div className="loading-state" role="status" aria-live="polite">
        <span className="loading-state__marker" aria-hidden="true" />
        <div>
          <strong>Loading persisted run state</strong>
          <p>No stage activity is simulated while evidence is being read.</p>
        </div>
      </div>
    </div>
  );
}
