// Yearly plans: early-cancellation refunds.
//
// The rule (shown at checkout, in the Terms and the Refund Policy):
// cancel within the first 3 months of a paid year → pay the monthly price for
// each month used (a partial month counts as a full month) and get the rest
// back; access ends when the last counted month ends. After 3 months → no
// refund; access continues to the end of the paid year.

export const EARLY_CANCEL_MONTHS = 3;

export const addMonths = (d: Date, n: number) => {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + n);
  return out;
};

export interface EarlyCancelQuote {
  /** True while the member is inside the first 3 months of the paid year. */
  eligible: boolean;
  monthsUsed: number;
  chargedCents: number;
  refundCents: number;
  /** When access ends if they cancel now. */
  accessUntil: Date;
}

/** What cancelling at `now` means for a yearly plan that started at `periodStart`. */
export function earlyCancelQuote(opts: {
  periodStart: Date;
  periodEnd: Date;
  paidCents: number;
  monthlyCents: number;
  now?: Date;
}): EarlyCancelQuote {
  const now = opts.now ?? new Date();
  let months = 1;
  while (addMonths(opts.periodStart, months) <= now) months++;
  if (months > EARLY_CANCEL_MONTHS) {
    return { eligible: false, monthsUsed: months, chargedCents: opts.paidCents, refundCents: 0, accessUntil: opts.periodEnd };
  }
  const charged = Math.min(opts.paidCents, months * opts.monthlyCents);
  return {
    eligible: true,
    monthsUsed: months,
    chargedCents: charged,
    refundCents: opts.paidCents - charged,
    accessUntil: addMonths(opts.periodStart, months),
  };
}
