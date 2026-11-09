import { NextResponse } from 'next/server';
import { z } from 'zod';
import { admin } from '@/lib/supabase/admin';
import { getSetting } from '@/lib/settings';
import { sendBusinessRequestAlert } from '@/lib/email';

export const runtime = 'nodejs';

const Body = z.object({
  company: z.string().trim().min(2).max(200),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().min(7).max(30),
  peopleRange: z.enum(['10–24', '25–49', '50–99', '100–249', '250+']),
  interest: z.enum(['Not sure yet', 'Starter', 'All-in-One']),
  notes: z.string().trim().max(2000).optional(),
  website: z.string().max(0).optional(), // honeypot: must stay empty
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Please fill in every field.' }, { status: 400 });
  const b = parsed.data;
  const { data, error } = await admin()
    .from('business_requests')
    .insert({
      company: b.company,
      contact_name: b.contactName,
      email: b.email,
      phone: b.phone,
      people_range: b.peopleRange,
      interest: b.interest,
      notes: b.notes || null,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });

  const to = await getSetting('business_request_alert_email');
  if (to) {
    try {
      await sendBusinessRequestAlert(to, data);
    } catch (e) {
      console.error('business request alert failed', e);
    }
  }
  return NextResponse.json({ ok: true });
}
