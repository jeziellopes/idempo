/**
 * Arena layout — escapes the root nav + max-w container.
 * Uses fixed inset-0 so the 3D canvas can fill the entire viewport.
 */
export default function ArenaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0f1117]">
      {children}
    </div>
  );
}
