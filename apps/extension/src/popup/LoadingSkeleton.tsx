/**
 * Loading Skeleton Component
 *
 * Shows placeholder UI while data loads, better UX than spinner.
 */

export function LoadingSkeleton() {
  return (
    <div className="skeleton-container">
      {/* Header skeleton */}
      <div className="skeleton-item skeleton-header" />

      {/* Status items skeleton */}
      <div className="skeleton-section">
        <div className="skeleton-item skeleton-status" />
        <div className="skeleton-item skeleton-status" />
      </div>

      {/* Button skeletons */}
      <div className="skeleton-section">
        <div className="skeleton-item skeleton-button" />
        <div className="skeleton-item skeleton-button" />
      </div>
    </div>
  );
}
