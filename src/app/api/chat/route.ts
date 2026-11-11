import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { assistantSystemPrompt, scrubPartnerNames } from '@/lib/assistant';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 20;
const MAX_CHARS = 1500;

const body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(MAX_TURNS * 2),
});

// Best effort per-instance limit: 20 questions per IP every 10 minutes.
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 20;
}

const plain = (text: string, status: number) => new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return plain('Chat is not available right now. Please email us from the Contact page.', 503);

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return plain('You have asked a lot of questions in a short time. Please wait a few minutes and try again.', 429);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return plain('Please type a question.', 400);
  const messages = parsed.data.messages.slice(-MAX_TURNS * 2);
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const last = messages.at(-1);
  if (!last || last.role !== 'user') return plain('Please type a question.', 400);
  if (last.content.length > MAX_CHARS) return plain(`Please keep your question under ${MAX_CHARS} characters.`, 400);

  const system = await assistantSystemPrompt();
  const client = new Anthropic();

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages,
  });

  const encoder = new TextEncoder();
  const HOLD = 20; // longer than any partner name, so a name split across chunks is caught
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let raw = '';
      let sent = 0;
      const flush = (final: boolean) => {
        const clean = scrubPartnerNames(raw);
        const upTo = final ? clean.length : Math.max(sent, clean.length - HOLD);
        if (upTo > sent) {
          controller.enqueue(encoder.encode(clean.slice(sent, upTo)));
          sent = upTo;
        }
      };
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            raw += event.delta.text;
            flush(false);
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal' && !raw.trim()) raw = 'Sorry, I can only help with questions about CES Essentials plans and prices.';
        flush(true);
      } catch (err) {
        console.error('chat error', err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
        if (!raw.trim()) controller.enqueue(encoder.encode('Sorry, the chat is having trouble right now. Please try again in a minute, or email us from the Contact page.'));
        else flush(true);
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(readable, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
