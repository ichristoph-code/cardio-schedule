/**
 * The CardioSchedule mark: an ECG tracing, the same motif the app icon carries
 * across its calendar. It replaced a generic heart so there is one brand shape,
 * not two.
 *
 * Drawn to lucide's conventions (24x24 box, `currentColor`, round caps) so it
 * drops in wherever a lucide icon went and still takes its colour and size from
 * `className`. The trace is deliberately simpler than the app icon's — at the
 * 16-24px this renders at, the icon's full waveform turns to mush.
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
