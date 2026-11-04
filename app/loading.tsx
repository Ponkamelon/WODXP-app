// Shown immediately while the home page fetches its data on the server
// (several Supabase queries), instead of a blank dark screen for 2-5 seconds.
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading WODXP"
      style={{ minHeight: '100vh', backgroundColor: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* mix-blend-mode: lighten hides the logo's slightly darker background square */}
      <img
        src="/icon-512.png"
        alt="WODXP"
        width={288}
        height={288}
        className="wodxp-splash-logo"
        style={{ width: 'min(72vw, 288px)', height: 'auto', mixBlendMode: 'lighten' }}
      />
      <style>{`
        @keyframes wodxp-splash-pulse { 0%, 100% { opacity: 0.85; transform: scale(1); } 50% { opacity: 1; transform: scale(1.03); } }
        .wodxp-splash-logo { animation: wodxp-splash-pulse 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .wodxp-splash-logo { animation: none; } }
      `}</style>
    </div>
  );
}
