// CAP Community Service Ribbon (the 60-hour volunteer ribbon), with bronze clasps
// stacked above it for each additional 60-hour tier earned.
//
// Stripe layout measured from the official ribbon image, left to right, as a
// percentage of total width. Symmetric about the wide navy center band.
const SILVER = '#E7E9EE';
const NAVY = '#162473';
const RED = '#C90E0D';
const STOPS = [
  [SILVER, 4.4],
  [NAVY, 4.0],
  [SILVER, 4.4],
  [RED, 4.2],
  [SILVER, 19.3],
  [NAVY, 27.4],
  [SILVER, 19.3],
  [RED, 4.2],
  [SILVER, 4.4],
  [NAVY, 4.0],
  [SILVER, 4.4],
];

let acc = 0;
const RIBBON_GRADIENT =
  'linear-gradient(to right, ' +
  STOPS.map(([color, pct]) => {
    const start = acc;
    acc += pct;
    return `${color} ${start}% ${acc}%`;
  }).join(', ') +
  ')';

// Faint horizontal weave so it reads as fabric, not a flat bar.
const WEAVE = 'repeating-linear-gradient(to bottom, rgba(0,0,0,0.07) 0 1px, rgba(255,255,255,0.05) 1px 2px, transparent 2px 3px)';

export default function RibbonBadge({ progress, size = 'md' }) {
  const { earned, clasps } = progress;
  const dims = size === 'lg' ? { w: 96, h: 28 } : { w: 60, h: 18 };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex flex-col-reverse items-center gap-0.5">
        {Array.from({ length: clasps }).map((_, i) => (
          <div
            key={i}
            className="bg-gradient-to-b from-yellow-700 via-yellow-400 to-yellow-700 rounded-sm shadow-sm"
            style={{ width: dims.w * 0.7, height: 4 }}
            title={`Bronze clasp #${i + 1}`}
          />
        ))}
      </div>
      <div
        className={`rounded-[2px] shadow border border-black/10 ${earned ? '' : 'grayscale opacity-40'}`}
        style={{
          width: dims.w,
          height: dims.h,
          backgroundImage: `${WEAVE}, ${RIBBON_GRADIENT}`,
        }}
        title={earned ? 'Community Service Ribbon earned' : 'Community Service Ribbon not yet earned'}
      />
    </div>
  );
}
