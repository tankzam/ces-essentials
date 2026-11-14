import 'server-only';
import { getSetting } from '@/lib/settings';

/**
 * Business-only mode: the public site sells only company plans. Individual
 * plans stay in the database (existing members keep them) but can't be bought.
 * Turned on and off in Admin (settings.individual_sales = 'off' | 'on').
 */
export async function businessOnly(): Promise<boolean> {
  return (await getSetting('individual_sales')) === 'off';
}
