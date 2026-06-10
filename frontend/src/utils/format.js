const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const currencyFmtCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const numberFmt = new Intl.NumberFormat('en-US');

export const money = (v, { cents = false } = {}) =>
  (cents ? currencyFmtCents : currencyFmt).format(Number.isFinite(v) ? v : 0);

export const hours = (v) => `${numberFmt.format(Math.round(Number.isFinite(v) ? v : 0))} h`;

export const percent = (v, digits = 0) =>
  `${(Number.isFinite(v) ? v : 0).toFixed(digits)}%`;

export const clampPercent = (v) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
