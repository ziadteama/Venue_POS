/** Only this dashboard username may view revenue, profit/loss, and related financial KPIs. */
export const FINANCIAL_OWNER_USERNAME = 'owner';

export function canSeeFinancials(user) {
  const username = typeof user === 'string' ? user : user?.username;
  return username === FINANCIAL_OWNER_USERNAME;
}
