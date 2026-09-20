export function AppIconArtwork() {
  return (
    <svg
      width="512"
      height="512"
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
        <linearGradient id="heart" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dbeafe" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#background)" />
      <path
        d="M256 403C238 387 112 300 112 202c0-45 34-78 77-78 29 0 53 16 67 40 14-24 38-40 67-40 43 0 77 33 77 78 0 98-126 185-144 201Z"
        fill="url(#heart)"
      />
      <path
        d="M74 257h83l24-50 38 105 39-162 35 107h56"
        fill="none"
        stroke="#2563eb"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="19"
      />
    </svg>
  );
}
