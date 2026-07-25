/** The settings glyph shared by both panels' settings buttons — the reading-header
 * document-info trigger and the library-drawer invite trigger. A horizontal-sliders
 * "tune" mark, replacing the old ⚙. Colour comes from the button (currentColor);
 * the knob fill is set in CSS (.settings-icon circle) so a CSS var resolves. */
export function SettingsIcon() {
  return (
    <svg className="settings-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="M2 5h12M2 11h12" strokeLinecap="round" />
      <circle cx="6" cy="5" r="2" />
      <circle cx="10.5" cy="11" r="2" />
    </svg>
  );
}
