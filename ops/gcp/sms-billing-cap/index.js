/**
 * SMS spend cap — the hard stop (docs/ops/sms-spend-cap.md).
 *
 * A Cloud Billing budget on the Firebase project posts its spend to a Pub/Sub
 * topic every few hours. When the month's cost passes the budget, this
 * function detaches billing from the project. The project drops to the free
 * Spark plan: phone-number SMS sign-in pauses; email sign-in, push
 * notifications (FCM is free) and everything on Supabase keep working.
 * Re-attach billing in the console to turn SMS back on.
 */
const functions = require('@google-cloud/functions-framework');
const { CloudBillingClient } = require('@google-cloud/billing');

const PROJECT_ID = process.env.PROJECT_ID; // e.g. sportnnote-5c5e7
const billing = new CloudBillingClient();

functions.cloudEvent('stopBilling', async (event) => {
  const msg = event?.data?.message?.data;
  if (!msg || !PROJECT_ID) { console.log('No budget message or PROJECT_ID — nothing to do'); return; }
  const data = JSON.parse(Buffer.from(msg, 'base64').toString());
  if (!(data.costAmount > data.budgetAmount)) {
    console.log(`Under budget: ${data.costAmount} of ${data.budgetAmount} ${data.currencyCode ?? ''}`);
    return;
  }
  const name = `projects/${PROJECT_ID}`;
  const [info] = await billing.getProjectBillingInfo({ name });
  if (!info.billingEnabled) { console.log(`Billing is already off for ${PROJECT_ID}`); return; }
  await billing.updateProjectBillingInfo({ name, projectBillingInfo: { billingAccountName: '' } });
  console.log(`Billing detached from ${PROJECT_ID}: ${data.costAmount} > ${data.budgetAmount} ${data.currencyCode ?? ''}`);
});
