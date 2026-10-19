// Make Picks page logo. Placeholder until the final design is chosen.
export default function PicksLogo({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} role="img" aria-label="NFL Picks logo">
      <circle cx="48" cy="48" r="44" fill="#10b981" />
      <ellipse cx="48" cy="48" rx="30" ry="18" fill="#7c3a12" transform="rotate(-35 48 48)" />
      <path d="M38 48 H58 M42 43 V53 M48 43 V53 M54 43 V53" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" transform="rotate(-35 48 48)" />
    </svg>
  );
}
