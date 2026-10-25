// The Research Atlas compass rose. Uses currentColor so it follows the theme.
export function CompassMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <circle cx="16" cy="16" r="14.5" stroke="currentColor" strokeOpacity="0.35" />
      <circle cx="16" cy="16" r="10" stroke="currentColor" strokeOpacity="0.2" strokeDasharray="1.5 2.5" />
      <path d="M16 2.5 L18.6 13.4 L16 16 L13.4 13.4 Z" fill="var(--brass)" />
      <path d="M16 29.5 L13.4 18.6 L16 16 L18.6 18.6 Z" fill="currentColor" fillOpacity="0.55" />
      <path d="M2.5 16 L13.4 13.4 L16 16 L13.4 18.6 Z" fill="currentColor" fillOpacity="0.35" />
      <path d="M29.5 16 L18.6 18.6 L16 16 L18.6 13.4 Z" fill="currentColor" fillOpacity="0.35" />
      <circle cx="16" cy="16" r="1.6" fill="var(--background)" stroke="currentColor" />
    </svg>
  );
}
