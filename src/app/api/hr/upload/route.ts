import { NextResponse } from 'next/server';
import { hrOrNull } from '@/lib/accounts';
import { reviewPeople } from '@/lib/hr';
import { readSheet, withoutHeader } from '@/lib/sheet';

export const runtime = 'nodejs';

/** Step 1 of an upload: read the file and say what would happen. Nothing is added yet. */
export async function POST(req: Request) {
  const ctx = await hrOrNull();
  if (!ctx) return NextResponse.json({ error: 'Please log in to your HR dashboard.' }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'That file is too big (5 MB max).' }, { status: 400 });

  let rows: string[][];
  try {
    rows = withoutHeader(await readSheet(file), 'email');
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'We could not read that file.' }, { status: 400 });
  }
  if (rows.length === 0) return NextResponse.json({ error: 'That file has no people in it.' }, { status: 400 });
  if (rows.length > 2000) return NextResponse.json({ error: 'Please upload 2,000 people or fewer at a time.' }, { status: 400 });

  const people = rows.map((r) => ({ firstName: r[0] ?? '', lastName: r[1] ?? '', email: r[2] ?? '' }));
  const review = await reviewPeople(ctx.org.id, people);
  return NextResponse.json({ fileName: file.name, ...review });
}

/** The template: first name, last name, email. */
export async function GET() {
  return new NextResponse('first name,last name,email\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ces-essentials-employees-template.csv"',
    },
  });
}
