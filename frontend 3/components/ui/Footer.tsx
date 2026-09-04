// Small persistent attribution, tucked in a corner on every page — sits
// below Sheet (z-50) and SelectionTray (z-40) so it never competes with
// interactive UI, and ignores pointer events so it can't intercept taps
// meant for whatever's underneath it.
export default function Footer() {
  return (
    <div className="pointer-events-none fixed bottom-2 right-3 z-30 select-none text-[10px] text-slate-600">
      Made by C. Kirthika
    </div>
  );
}
