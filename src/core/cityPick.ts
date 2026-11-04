/** City labels for the one city field (UI audit step 4). Pure. */
const COUNTRY: Record<string, string> = { IN: 'India', AE: 'UAE', QA: 'Qatar', GB: 'UK', SG: 'Singapore', MY: 'Malaysia', AU: 'Australia', US: 'USA' };
/** "Hyderabad, Telangana, India" */
export const cityLabel = (c: { name: string; region?: string | null; country: string }): string =>
  [c.name, c.region, COUNTRY[c.country] ?? c.country].filter(Boolean).join(', ');
