"use client";

// global-error replaces the root layout when an error is thrown there, so it
// must render its own <html>/<body> and cannot rely on app styles.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#666", marginTop: "0.5rem" }}>
            An unexpected error occurred. Please try again.
          </p>
          {error.digest && (
            <p style={{ color: "#999", fontSize: "0.75rem", marginTop: "0.5rem" }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            style={{
              marginTop: "1.25rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #ccc",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
