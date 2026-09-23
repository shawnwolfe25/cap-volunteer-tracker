import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { LoadingBox, ErrorBox } from './Dashboard.jsx';

export default function Report() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .report(id)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <LoadingBox />;

  const { cadet, entries, summary, progress } = data;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="no-print mb-4 flex justify-end">
        <button className="cap-btn-primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <div className="cap-card p-8 print:shadow-none print:border-none">
        <div className="text-center border-b pb-4 mb-4">
          <img
            src="/squadron-patch.png"
            alt="Springfield Composite Squadron patch"
            className="w-20 h-20 object-contain mx-auto mb-2"
          />
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Civil Air Patrol</div>
          <h1 className="text-xl font-display font-semibold text-cap-blue">
            Volunteer Service Hours Report
          </h1>
          <div className="text-xs text-slate-500">Springfield Composite Squadron (IL-036)</div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <div className="text-slate-500">Cadet</div>
            <div className="font-semibold">
              {cadet.firstName} {cadet.lastName}
            </div>
          </div>
          <div>
            <div className="text-slate-500">CAPID</div>
            <div className="font-semibold">{cadet.capid}</div>
          </div>
          <div>
            <div className="text-slate-500">Total verified hours</div>
            <div className="font-semibold">{summary.totalVerified.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-slate-500">Ribbon status</div>
            <div className="font-semibold">
              {progress.earned
                ? `Earned — ${progress.clasps} bronze clasp${progress.clasps === 1 ? '' : 's'}`
                : `Not yet earned (${(60 - summary.totalVerified).toFixed(1)} hrs remaining)`}
            </div>
          </div>
        </div>

        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-1 pr-2">Date</th>
              <th className="py-1 pr-2">Activity</th>
              <th className="py-1 pr-2">Organization</th>
              <th className="py-1 pr-2 text-right">Hours</th>
              <th className="py-1 pr-2">Verified by</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="py-1 pr-2 whitespace-nowrap">{e.date}</td>
                <td className="py-1 pr-2">{e.activity}</td>
                <td className="py-1 pr-2">{e.organization}</td>
                <td className="py-1 pr-2 text-right">{e.hours}</td>
                <td className="py-1 pr-2">{e.verifiedByName}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs text-slate-400">
          Generated from the IL-036 Volunteer Hours Tracker. Only verified hours are shown. Use this summary to
          complete CAPF 2a for Volunteer Service Ribbon award/clasp submission through the chain of command.
        </p>
      </div>
    </div>
  );
}
