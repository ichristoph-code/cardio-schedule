export function AppIconArtwork({ size = 512 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="CardioSchedule"
    >
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#164eaa" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#background)" />
      <rect x="72" y="98" width="368" height="318" rx="42" fill="#ffffff" />
      <path
        d="M114 98h284a42 42 0 0 1 42 42v48H72v-48a42 42 0 0 1 42-42Z"
        fill="#dbeafe"
      />
      <rect x="142" y="78" width="32" height="54" rx="16" fill="#ffffff" />
      <rect x="338" y="78" width="32" height="54" rx="16" fill="#ffffff" />
      <path
        d="M92 188h328"
        fill="none"
        stroke="#93c5fd"
        strokeLinecap="round"
        strokeWidth="10"
      />
      <path
        d="M94 300h18c6 0 11-18 20-18s15 18 25 18h18l10 12 10-12 13-70 16 122 15-52h38c14 0 22-34 36-34s22 34 39 34h54"
        fill="none"
        stroke="#f43f5e"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="16"
      />
    </svg>
  );
}
