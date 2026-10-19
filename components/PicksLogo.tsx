// App logo (football + checkmark). Regenerate the image with: node scripts/make-icons.mjs
export default function PicksLogo({ className = "h-12 w-12" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/logo.png" alt="NFL Picks" className={`${className} rounded-2xl shadow-lg shadow-black/30`} />
  );
}
