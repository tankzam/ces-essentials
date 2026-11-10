import 'server-only';
import { Resend } from 'resend';
import { env } from '@/lib/env';
import { admin } from '@/lib/supabase/admin';
import { money, formatDate } from '@/lib/money';

let resend: Resend | null = null;
function client() {
  if (!resend) resend = new Resend(env.resendApiKey());
  return resend;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Sends once per idempotency key. The email_log row is written first, so a
 * webhook retry never sends a duplicate; if the send fails the row is removed
 * so the next retry can try again.
 */
async function send(opts: {
  key: string;
  template: string;
  to: string;
  memberId: string | null;
  subject: string;
  html: string;
}) {
  const { error: logError } = await admin().from('email_log').insert({
    idempotency_key: opts.key,
    template: opts.template,
    to_email: opts.to,
    member_id: opts.memberId,
  });
  if (logError) {
    if (logError.code === '23505') return; // already sent
    throw logError;
  }
  try {
    const { data, error } = await client().emails.send(
      { from: env.emailFrom(), to: opts.to, subject: opts.subject, html: opts.html },
      { idempotencyKey: opts.key.slice(0, 256) },
    );
    if (error) throw new Error(error.message);
    await admin().from('email_log').update({ provider_message_id: data?.id ?? null }).eq('idempotency_key', opts.key);
  } catch (e) {
    await admin().from('email_log').delete().eq('idempotency_key', opts.key);
    throw e;
  }
}

// ───────────────────────────── Layout ─────────────────────────────

function registerNotice(email: string) {
  return `<div style="margin:0 0 24px;padding:16px 18px;border-radius:10px;background:#FDF1DC;border:2px solid #F0A83C;color:#3B2A0A;font-size:15px;line-height:1.5">
<strong>Use this email to register every service: ${esc(email)}</strong><br>
Each provider matches your membership by this email. Registering with a different email means the service won't recognize you.
</div>`;
}

function button(href: string, label: string) {
  return `<a href="${esc(href)}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#F0A83C;color:#0B0C1B;font-weight:700;text-decoration:none">${esc(label)}</a>`;
}

function layout(body: string) {
  const site = env.siteUrl();
  return `<!doctype html><html><body style="margin:0;background:#F6F5F1;font-family:Inter,Arial,sans-serif;color:#0B0C1B">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<div style="background:#0B0C1B;color:#fff;padding:18px 24px;border-radius:14px 14px 0 0;font-weight:800;font-size:18px">
<span style="display:inline-block;background:#F0A83C;color:#0B0C1B;border-radius:7px;padding:4px 7px;font-size:13px;margin-right:8px">CES</span>Essentials</div>
<div style="background:#fff;padding:28px 24px;border-radius:0 0 14px 14px;font-size:16px;line-height:1.55">${body}</div>
<p style="text-align:center;font-size:12px;color:#5A5C6E;margin:18px 0 0">
<a href="${site}/member" style="color:#5A5C6E">Member area</a> · <a href="${site}/refund-policy" style="color:#5A5C6E">Refund Policy</a> · <a href="${site}/contact" style="color:#5A5C6E">Contact</a><br>
© Creating Empowerment Solutions LLC</p>
</div></body></html>`;
}

const steps = (list: string[]) =>
  `<ol style="padding-left:20px;margin:12px 0 20px">${list.map((s) => `<li style="margin:6px 0">${s}</li>`).join('')}</ol>`;

const codeBox = (label: string, code: string) =>
  `<p style="margin:16px 0 4px;font-size:14px;color:#5A5C6E">${esc(label)}</p>
<p style="margin:0 0 20px;font-size:20px;font-weight:800;letter-spacing:0.06em;padding:12px 14px;background:#F6F5F1;border:1px dashed #C8C7BF;border-radius:8px">${esc(code)}</p>`;

// ───────────────────────────── Templates ─────────────────────────────

export async function sendWelcome(m: { id: string; email: string; name: string }, planName: string, keySuffix = '') {
  const site = env.siteUrl();
  await send({
    key: keySuffix ? `welcome:${m.id}:${keySuffix}` : `welcome:${m.id}`,
    template: 'welcome',
    to: m.email,
    memberId: m.id,
    subject: 'Welcome to CES Essentials',
    html: layout(`<h1 style="margin:0 0 12px;font-size:24px">Welcome, ${esc(m.name.split(' ')[0] || m.name)}!</h1>
${registerNotice(m.email)}
<p>Your ${esc(planName)} membership is active. Log in to your member area to see every service you bought, your setup steps, and your activation codes.</p>
<p style="margin:0 0 6px"><strong>Your login:</strong> ${esc(m.email)}</p>
<p style="margin:0 0 20px">Use the password you created at checkout. Forgot it? Use “Forgot password” on the login page.</p>
${button(`${site}/login`, 'Log in to your member area')}
<p style="margin-top:24px;font-size:14px;color:#5A5C6E">You'll get a separate setup email for each service.</p>`),
  });
}

export interface SetupInfo {
  serviceId: string;
  serviceName: string;
  steps: string[];
  code?: string | null;
  codeLabel?: string;
  links?: { href: string; label: string }[];
  extraHtml?: string;
}

export async function sendServiceSetup(m: { id: string; email: string }, info: SetupInfo, keySuffix: string) {
  const links = (info.links ?? []).map((l) => `<p style="margin:8px 0">${button(l.href, l.label)}</p>`).join('');
  await send({
    key: `setup:${m.id}:${info.serviceId}:${keySuffix}`,
    template: `setup_${info.serviceId}`,
    to: m.email,
    memberId: m.id,
    subject: `Set up your ${info.serviceName}`,
    html: layout(`<h1 style="margin:0 0 12px;font-size:22px">Set up your ${esc(info.serviceName)}</h1>
${registerNotice(m.email)}
${info.extraHtml ?? ''}
${steps(info.steps.map(esc))}
${info.code ? codeBox(info.codeLabel ?? 'Your code', info.code) : ''}
${links}
<p style="margin-top:20px">Register with: <strong>${esc(m.email)}</strong></p>`),
  });
}

export async function sendReceipt(
  m: { id: string; email: string },
  inv: { id: string; amountCents: number; paidAt: string | null; description: string; hostedUrl: string | null },
) {
  await send({
    key: `receipt:${inv.id}`,
    template: 'receipt',
    to: m.email,
    memberId: m.id,
    subject: `Your CES Essentials receipt — ${money(inv.amountCents)}`,
    html: layout(`<h1 style="margin:0 0 12px;font-size:22px">Payment received</h1>
<table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:15px">
<tr><td style="padding:8px 0;color:#5A5C6E">Date</td><td style="padding:8px 0;text-align:right">${esc(formatDate(inv.paidAt))}</td></tr>
<tr><td style="padding:8px 0;color:#5A5C6E">Description</td><td style="padding:8px 0;text-align:right">${esc(inv.description)}</td></tr>
<tr><td style="padding:8px 0;color:#5A5C6E;border-top:1px solid #E2E1DA"><strong>Amount paid</strong></td><td style="padding:8px 0;text-align:right;border-top:1px solid #E2E1DA"><strong>${money(inv.amountCents)}</strong></td></tr>
</table>
${inv.hostedUrl ? button(inv.hostedUrl, 'View receipt') : ''}
<p style="margin-top:20px;font-size:14px;color:#5A5C6E">There are no refunds once a billing month has started. You can cancel anytime in your member area to stop future charges.</p>`),
  });
}

export async function sendPaymentFailed(m: { id: string; email: string }, invoiceId: string, attempt: number) {
  const site = env.siteUrl();
  await send({
    key: `payment_failed:${invoiceId}:${attempt}`,
    template: 'payment_failed',
    to: m.email,
    memberId: m.id,
    subject: 'Your CES Essentials payment didn’t go through',
    html: layout(`<h1 style="margin:0 0 12px;font-size:22px">Your payment didn’t go through</h1>
<p>We couldn't charge your card for your CES Essentials membership. Your services stay on for 2 days while we try again.</p>
<p>To keep your access, please update your card.</p>
${button(`${site}/member/billing`, 'Update your card')}
<p style="margin-top:20px;font-size:14px;color:#5A5C6E">If the payment still can't be completed after 2 days, your access pauses until it goes through.</p>`),
  });
}

export async function sendAccessPaused(m: { id: string; email: string }, pastDueSince: string) {
  const site = env.siteUrl();
  await send({
    key: `access_paused:${m.id}:${pastDueSince}`,
    template: 'access_paused',
    to: m.email,
    memberId: m.id,
    subject: 'Your CES Essentials access is paused',
    html: layout(`<h1 style="margin:0 0 12px;font-size:22px">Your access is paused</h1>
<p>We still haven't been able to charge your card, so your services are paused. Update your card and your access comes back as soon as the payment goes through.</p>
${button(`${site}/member/billing`, 'Update your card')}`),
  });
}

export async function sendCancellation(m: { id: string; email: string }, subscriptionId: string, accessEndsAt: string | null) {
  const site = env.siteUrl();
  await send({
    key: `cancel:${subscriptionId}:${accessEndsAt ?? ''}`,
    template: 'cancellation',
    to: m.email,
    memberId: m.id,
    subject: 'Your CES Essentials plan is canceled',
    html: layout(`<h1 style="margin:0 0 12px;font-size:22px">Your plan is canceled</h1>
<p>You won't be charged again. You keep access to everything through <strong>${esc(formatDate(accessEndsAt))}</strong>.</p>
<p>Changed your mind? You can keep your plan from your member area any time before then.</p>
${button(`${site}/member/plan`, 'Keep my plan')}`),
  });
}

export async function sendCodePoolAlert(to: string, remaining: number, threshold: number) {
  const day = new Date().toISOString().slice(0, 10);
  await send({
    key: `code_pool:${day}:${remaining === 0 ? 'empty' : 'low'}`,
    template: 'code_pool_alert',
    to,
    memberId: null,
    subject: remaining === 0 ? 'CES Essentials: Credit Monitoring codes are OUT' : `CES Essentials: only ${remaining} Credit Monitoring codes left`,
    html: layout(`<h1 style="margin:0 0 12px;font-size:22px">Upload more Credit Monitoring + VPN codes</h1>
<p>There ${remaining === 1 ? 'is' : 'are'} <strong>${remaining}</strong> unused code${remaining === 1 ? '' : 's'} left (alert level: ${threshold}).</p>
${remaining === 0 ? '<p><strong>New members are waiting for a code.</strong> They will get it by email automatically once codes are uploaded.</p>' : ''}
<p>Add codes to the <code>activation_codes</code> table in Supabase (one code per row, column <code>code</code>).</p>`),
  });
}

// ───────────────────────── Accounts, companies, admin ─────────────────────────

/** Email with a link to set a password (employees and admin-activated members). */
export async function sendAccountInvite(
  m: { id: string; email: string; name: string },
  setPasswordUrl: string,
  context: { companyName?: string; planName?: string },
  keySuffix: string,
) {
  const intro = context.companyName
    ? `${esc(context.companyName)} added you to CES Essentials${context.planName ? ` (${esc(context.planName)})` : ''}. Your membership is paid for by your company.`
    : `Your CES Essentials membership${context.planName ? ` (${esc(context.planName)})` : ''} is active.`;
  await send({
    key: `invite:${m.id}:${keySuffix}`,
    template: 'account_invite',
    to: m.email,
    memberId: m.id,
    subject: context.companyName ? `${context.companyName} gave you CES Essentials` : 'Your CES Essentials membership is ready',
    html: layout(`<h1 style="margin:0 0 12px;font-size:24px">Welcome${m.name ? `, ${esc(m.name.split(' ')[0])}` : ''}!</h1>
${registerNotice(m.email)}
<p>${intro}</p>
<p>Create your password to open your member area, where you'll find every service, your setup steps, and your activation codes.</p>
${button(setPasswordUrl, 'Create your password')}
<p style="margin-top:20px;font-size:14px;color:#5A5C6E">Your login is ${esc(m.email)}. This link expires in 24 hours; if it does, use “Forgot password” on the login page.</p>`),
  });
}

export async function sendCompanyWelcome(m: { id: string; email: string; name: string }, planName: string, seats: number) {
  const site = env.siteUrl();
  await send({
    key: `company_welcome:${m.id}`,
    template: 'company_welcome',
    to: m.email,
    memberId: m.id,
    subject: 'Your CES Essentials company plan is active',
    html: layout(`<h1 style="margin:0 0 12px;font-size:24px">Your company plan is active</h1>
<p>${esc(planName)} for ${seats} people. Next step: upload your employees. Each one gets a welcome email with their own login.</p>
${button(`${site}/hr/upload`, 'Go to your HR dashboard')}
<p style="margin-top:20px;font-size:14px;color:#5A5C6E">Your HR login is ${esc(m.email)}.</p>`),
  });
}

export async function sendBusinessRequestAlert(to: string, r: { id: string; company: string; contact_name: string; email: string; phone: string; people_range: string; interest: string; notes: string | null }) {
  const site = env.siteUrl();
  await send({
    key: `business_request:${r.id}`,
    template: 'business_request_alert',
    to,
    memberId: null,
    subject: `New company pricing request: ${r.company}`,
    html: layout(`<h1 style="margin:0 0 12px;font-size:22px">New company pricing request</h1>
<p><strong>${esc(r.company)}</strong> · ${esc(r.people_range)} people · interested in ${esc(r.interest)}</p>
<p>${esc(r.contact_name)} · ${esc(r.email)} · ${esc(r.phone)}</p>
${r.notes ? `<p style="background:#F6F5F1;padding:12px;border-radius:8px">${esc(r.notes)}</p>` : ''}
${button(`${site}/admin/business`, 'Review in Admin')}`),
  });
}

export async function sendCompanySignupLink(r: { id: string; company: string; contact_name: string; email: string }, url: string) {
  await send({
    key: `company_link:${r.id}`,
    template: 'company_signup_link',
    to: r.email,
    memberId: null,
    subject: `Your CES Essentials company pricing, ${r.company}`,
    html: layout(`<h1 style="margin:0 0 12px;font-size:22px">Your company pricing is ready</h1>
<p>Hi ${esc(r.contact_name.split(' ')[0] || r.contact_name)}, thanks for your interest in CES Essentials for ${esc(r.company)}.</p>
<p>Company pricing: <strong>Starter $15.99</strong> or <strong>All-in-One $39.99</strong> per person per month, with a 10-person minimum. Pick a plan, set up your HR login, and you can start adding employees right away.</p>
${button(url, 'Open your private signup page')}
<p style="margin-top:20px;font-size:14px;color:#5A5C6E">This link is private to your company. Please don't share it outside your team.</p>`),
  });
}

export async function sendAdminInvite(m: { id: string; email: string; name: string }, setPasswordUrl: string) {
  await send({
    key: `admin_invite:${m.id}:${Date.now()}`,
    template: 'admin_invite',
    to: m.email,
    memberId: m.id,
    subject: 'Your CES Essentials admin access',
    html: layout(`<h1 style="margin:0 0 12px;font-size:22px">You're a CES Essentials admin</h1>
<p>You now have access to the CES Essentials admin area: members, activation codes, orders and revenue, business requests, and the policy and activity logs.</p>
<p>Create your password to sign in. Your login is ${esc(m.email)}.</p>
${button(setPasswordUrl, 'Create your password')}
<p style="margin-top:20px;font-size:14px;color:#5A5C6E">This link expires in 24 hours. If it does, use “Forgot password” on the login page. After you sign in, you'll go straight to the admin area.</p>`),
  });
}

// ───────────────────────────── Sign-in ─────────────────────────────

export async function sendSignInCode(m: { id: string; email: string }, code: string, link: string, bucket: string) {
  await send({
    key: `signin_code:${m.id}:${bucket}`,
    template: 'signin_code',
    to: m.email,
    memberId: m.id,
    subject: `Your CES Essentials sign-in code: ${code}`,
    html: layout(`<h1 style="margin:0 0 12px;font-size:22px">Your sign-in code</h1>
<p>Enter this code on the login page:</p>
<p style="margin:16px 0 20px;font-size:34px;font-weight:800;letter-spacing:0.25em;padding:14px 18px;background:#F6F5F1;border:1px dashed #C8C7BF;border-radius:10px;text-align:center">${esc(code)}</p>
<p>Or sign in with one tap:</p>
${button(link, 'Sign in to CES Essentials')}
<p style="margin-top:20px;font-size:14px;color:#5A5C6E">The code and link expire in 1 hour and work once. If you didn't ask to sign in, you can ignore this email.</p>`),
  });
}

export async function sendPasswordReset(m: { id: string; email: string }, link: string, bucket: string) {
  await send({
    key: `password_reset:${m.id}:${bucket}`,
    template: 'password_reset',
    to: m.email,
    memberId: m.id,
    subject: 'Reset your CES Essentials password',
    html: layout(`<h1 style="margin:0 0 12px;font-size:22px">Reset your password</h1>
<p>Click below to choose a new password for ${esc(m.email)}.</p>
${button(link, 'Choose a new password')}
<p style="margin-top:20px;font-size:14px;color:#5A5C6E">This link expires in 24 hours and works once. If you didn't ask to reset your password, you can ignore this email.</p>`),
  });
}
