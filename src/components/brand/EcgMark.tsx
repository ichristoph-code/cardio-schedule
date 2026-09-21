/**
 * An ECG tracing as a small line pictogram, for places where a lucide-style
 * icon sits among other line icons (the "Today's Coverage" card). It is NOT the
 * logo: beside the wordmark and on the login card the logo is the full
 * calendar icon, `AppIconArtwork` - the bare tracing was tried there and read
 * as a generic pulse symbol, while the calendar reads as CardioSchedule.
 *
 * Drawn to lucide's conventions (24x24 box, `currentColor`, round caps) so it
 * takes its colour and size from `className`.
 */
export function EcgMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="CardioSchedule"
    >
      <path d="M1 12h4.5l1.5-2.5 1.5 2.5h1l2.5-8 2.5 13 2-5h5.5" />
    </svg>
  );
}
