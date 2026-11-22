'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { toast } from '@/components/Toaster';
import { Loading, PageTitle, Section, num, useBrand } from '@/components/admin/ui';
import type { Options } from '@/components/brand/ItemForm';
import { api } from '@/lib/api';
import { PHOTO_TYPES, uploadPhoto } from '@/lib/brandPhotos';
import { csvRecords, downloadCsv } from '@/lib/csv';

type Result = { created: number; errors: Array<{ row: number; message: string }> };

const isLink = (s: string) => /^https?:\/\//i.test(s);

/**
 * Many pieces at once: a spreadsheet (CSV), plus any photo files it names. Photos are uploaded first,
 * then the rows are sent in parts; rows with a problem come back with the reason, to fix and re-upload.
 */
export default function BrandUpload() {
  const { data: opts, error, loading } = useBrand<Options>('/brand/options');
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [fileName, setFileName] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [step, setStep] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState<Array<{ row: number; data: Record<string, string>; message: string }>>([]);
  const sheet = useRef<HTMLInputElement>(null);
  const pics = useRef<HTMLInputElement>(null);

  if (!opts) return <Loading error={error} loading={loading} />;
  const columns = opts.columns;

  function template() {
    downloadCsv('saleeqa-pieces-template.csv', [columns.map((c) => c.key), columns.map((c) => c.example)]);
  }

  async function readSheet(file: File | undefined) {
    setResult(null);
    setFailed([]);
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) {
      toast('Please save the spreadsheet as CSV first (Excel: File → Save as → CSV; Google Sheets: File → Download → CSV)', 'error');
      return;
    }
    const records = csvRecords(await file.text());
    if (!records.length) return toast('That file has no rows under the header row', 'error');
    if (records.length > 5000) return toast('Up to 5,000 rows per file: split it into smaller files', 'error');
    setRows(records);
    setFileName(file.name);
  }

  // Photo file names the sheet mentions, and which of them are not chosen yet.
  const named = [...new Set(rows.flatMap((r) => (r.photos ?? r.Photos ?? '').split('|').map((x) => x.trim()).filter((x) => x && !isLink(x))))];
  const byName = new Map(photos.map((f) => [f.name.toLowerCase(), f]));
  const missing = named.filter((n) => !byName.has(n.toLowerCase()));

  async function upload() {
    if (missing.length && !confirm(`${missing.length} photo file(s) named in the sheet are not chosen (for example “${missing[0]}”). Those rows will come back with an error. Upload anyway?`)) return;
    setResult(null);
    setFailed([]);
    try {
      // 1. The photo files the sheet names, uploaded once each.
      const urls = new Map<string, string>();
      const needed = named.filter((n) => byName.has(n.toLowerCase()));
      for (const [i, n] of needed.entries()) {
        setStep(`Uploading photos: ${i + 1} of ${needed.length}`);
        try {
          urls.set(n.toLowerCase(), await uploadPhoto(byName.get(n.toLowerCase())!));
        } catch (e) {
          toast((e as Error).message, 'error');
        }
      }
      // 2. The rows, with file names swapped for the uploaded photos' links, in parts.
      const ready = rows.map((r) => {
        const key = Object.keys(r).find((k) => k.trim().toLowerCase() === 'photos');
        if (!key) return r;
        const list = r[key].split('|').map((x) => x.trim()).filter(Boolean).map((x) => (isLink(x) ? x : (urls.get(x.toLowerCase()) ?? `missing file: ${x}`)));
        return { ...r, [key]: list.join('|') };
      });
      let created = 0;
      const errors: Result['errors'] = [];
      let batchId: string | undefined;
      for (let i = 0; i < ready.length; i += opts!.maxRows) {
        setStep(`Adding pieces: ${Math.min(i + opts!.maxRows, ready.length)} of ${ready.length}`);
        const part = ready.slice(i, i + opts!.maxRows);
        const r = await api<Result & { batchId: string }>('/brand/items/bulk', { body: { rows: part, batchId } });
        batchId = r.batchId;
        created += r.created;
        errors.push(...r.errors.map((e) => ({ row: e.row + i, message: e.message })));
      }
      setResult({ created, errors });
      setFailed(errors.map((e) => ({ row: e.row, data: rows[e.row], message: /missing file/.test(JSON.stringify(ready[e.row])) && /photo/i.test(e.message) ? 'A photo file it names was not chosen' : e.message })));
      if (created) toast(`${num(created)} piece${created === 1 ? '' : 's'} sent for approval`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setStep('');
    }
  }

  function downloadFailed() {
    const keys = Object.keys(failed[0].data);
    downloadCsv('pieces-to-fix.csv', [[...keys, 'problem'], ...failed.map((f) => [...keys.map((k) => f.data[k] ?? ''), f.message])]);
  }

  return (
    <>
      <PageTitle title="Upload a spreadsheet" intro="Add many pieces at once. Every piece is checked by our team before players see it." />

      <ol className="space-y-4">
        <li className="card">
          <h2 className="text-xl font-bold">1. Get the template</h2>
          <p className="mt-1 text-sm text-ink/75">Open it in Excel or Google Sheets, keep the first row as it is, and add one piece per row. Then save it as CSV.</p>
          <button className="btn btn-ghost mt-3" onClick={template}>
            Download the template (CSV)
          </button>
          <details className="mt-3 text-sm">
            <summary className="min-h-[32px] cursor-pointer font-semibold text-plum">What goes in each column</summary>
            <ul className="mt-2 space-y-1">
              {columns.map((c) => (
                <li key={c.key}>
                  <code className="rounded bg-sand px-1">{c.key}</code> {c.required ? <strong>(needed)</strong> : <span className="text-ink/70">(optional)</span>}: {c.help}
                </li>
              ))}
              <li className="text-ink/70">Colours: {opts.colours.map((c) => c.name).join(', ')}</li>
            </ul>
          </details>
        </li>

        <li className="card">
          <h2 className="text-xl font-bold">2. Choose your spreadsheet</h2>
          <button className="btn btn-ghost mt-3" onClick={() => sheet.current?.click()}>
            {fileName ? 'Choose another file' : 'Choose the CSV file'}
          </button>
          <input ref={sheet} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => readSheet(e.target.files?.[0])} />
          {fileName && (
            <p className="mt-2 text-sm">
              <strong>{fileName}</strong>: {num(rows.length)} piece{rows.length === 1 ? '' : 's'}
            </p>
          )}
        </li>

        <li className="card">
          <h2 className="text-xl font-bold">3. Add photo files (only if the sheet names files)</h2>
          <p className="mt-1 text-sm text-ink/75">
            In the <code className="rounded bg-sand px-1">photos</code> column you can write photo links (https://…) or file names like <code className="rounded bg-sand px-1">suit-front.jpg</code>. Choose those files here.
          </p>
          <button className="btn btn-ghost mt-3" onClick={() => pics.current?.click()}>
            Choose photo files
          </button>
          <input ref={pics} type="file" accept={PHOTO_TYPES} multiple className="hidden" onChange={(e) => setPhotos((p) => [...p, ...(e.target.files ? [...e.target.files] : [])])} />
          {photos.length > 0 && (
            <p className="mt-2 text-sm">
              {photos.length} file{photos.length === 1 ? '' : 's'} chosen.{' '}
              <button className="min-h-[32px] font-semibold text-plum" onClick={() => setPhotos([])}>
                Clear
              </button>
            </p>
          )}
          {named.length > 0 && (
            <p className={`mt-2 text-sm ${missing.length ? 'text-amber-900' : 'text-emerald-800'}`}>
              The sheet names {named.length} photo file{named.length === 1 ? '' : 's'}.{' '}
              {missing.length ? `${missing.length} not chosen yet: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}` : 'All chosen.'}
            </p>
          )}
        </li>

        <li className="card">
          <h2 className="text-xl font-bold">4. Upload</h2>
          <button className="btn btn-primary mt-3" disabled={!rows.length || Boolean(step)} onClick={upload}>
            {step || (rows.length ? `Send ${num(rows.length)} piece${rows.length === 1 ? '' : 's'} for approval` : 'Choose a spreadsheet first')}
          </button>
          {step && (
            <p role="status" className="mt-2 text-sm text-ink/75">
              Please keep this page open…
            </p>
          )}
        </li>
      </ol>

      {result && (
        <Section title="Result">
          <div className="card text-sm">
            <p>
              <strong>{num(result.created)}</strong> piece{result.created === 1 ? '' : 's'} sent for approval.{' '}
              {result.created > 0 && (
                <Link className="font-semibold text-plum" href="/brand/items?filter=pending">
                  See them
                </Link>
              )}
            </p>
            {failed.length > 0 && (
              <>
                <p className="mt-2 text-red-800">
                  {failed.length} row{failed.length === 1 ? '' : 's'} could not be added. Fix them and upload just those rows again.
                </p>
                <button className="btn btn-ghost mt-3" onClick={downloadFailed}>
                  Download the rows to fix (CSV)
                </button>
                <ul className="mt-3 divide-y divide-line">
                  {failed.slice(0, 100).map((f) => (
                    <li key={f.row} className="py-2">
                      Row {f.row + 2}
                      {f.data.title ? ` (${f.data.title})` : ''}: <span className="text-red-800">{f.message}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Section>
      )}
    </>
  );
}
