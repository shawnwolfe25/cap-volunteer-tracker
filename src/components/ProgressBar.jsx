export default function ProgressBar({ percent, label }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div>
      {label && <div className="text-xs text-slate-500 mb-1">{label}</div>}
      <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cap-blue2 to-cap-skyblue transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
