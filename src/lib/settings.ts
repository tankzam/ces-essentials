import 'server-only';
import { admin } from '@/lib/supabase/admin';

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const { data, error } = await admin().from('settings').select('key, value').in('key', keys);
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.key, r.value]));
}

export async function getSetting(key: string): Promise<string> {
  return (await getSettings([key]))[key] ?? '';
}
