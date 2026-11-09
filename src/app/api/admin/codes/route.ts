import { NextResponse } from 'next/server';
import { adminOrNull, logActivity } from '@/lib/accounts';
import { admin } from '@/lib/supabase/admin';
import { readSheet, withoutHeader } from '@/lib/sheet';
import { deliverWaitingCodes } from '@/lib/fulfillment';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Upload the provider's code spreadsheet. Duplicates are skipped; used codes are never touched. */
export async function POST(req: Request) {
  const me = await adminOrNull();
  if (!me) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file.' }, { status: 400 });

  let rows: string[][];
  try {
    rows = await readSheet(file);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read that file.' }, { status: 400 });
  }
  // Use the column headed "code" if there is one, otherwise the first column.
  const header = rows[0]?.map((c) => c.toLowerCase()) ?? [];
  const col = Math.max(0, header.findIndex((c) => c.includes('code')));
  const codes = [...new Set(withoutHeader(rows, 'code').map((r) => (r[col] ?? '').trim()).filter((c) => c.length >= 4 && c.length <= 200))];
  if (codes.length === 0) return NextResponse.json({ error: 'No codes found in that file.' }, { status: 400 });

  const db = admin();
  const batch = `${file.name} · ${new Date().toISOString().slice(0, 10)}`;
  let added = 0;
  for (let i = 0; i < codes.length; i += 500) {
    const chunk = codes.slice(i, i + 500).map((code) => ({ code, service_id: 'credit_vpn', batch }));
    const { data, error } = await db.from('activation_codes').upsert(chunk, { onConflict: 'code', ignoreDuplicates: true }).select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    added += data?.length ?? 0;
  }
  await logActivity(me, `uploaded ${added} codes`, undefined, { file: file.name, inFile: codes.length, skipped: codes.length - added });
  try {
    await deliverWaitingCodes(); // members who were waiting get their code now
  } catch (e) {
    console.error('deliver waiting codes failed', e);
  }
  return NextResponse.json({ ok: true, message: `${added} codes added${codes.length - added ? `, ${codes.length - added} duplicates skipped` : ''}.` });
}
