"use client";

// Replaces the root layout when it fails itself: no app styles or fonts are guaranteed.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, padding: 16, textAlign: "center" }}>
        <div role="alert">
          <h1 style={{ fontSize: 24, margin: 0 }}>Une erreur est survenue</h1>
          <p style={{ color: "#555", marginTop: 12 }}>L&apos;application n&apos;a pas pu être chargée. Réessayez dans un instant.</p>
          {error.digest ? <p style={{ color: "#777", fontSize: 12 }}>Référence : {error.digest}</p> : null}
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}>
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
