import {monei} from '../../lib/monei.js';
import {CURRENCY, parseConfig, toQuery} from '../../lib/config.js';
import {createPayment, resolveAmount} from '../../lib/payment.js';

export const prerender = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

/**
 * The same `payments.create` as the Components flow, minus the `paymentToken`.
 * Without one there is nothing to confirm, so MONEI answers with a `nextAction`
 * carrying the hosted page's URL instead of a completed payment.
 */
export const POST = async ({request}) => {
  if (!monei) return json({error: 'MONEI_API_KEY is not configured'}, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({error: 'Invalid JSON'}, 400);
  }

  const {quote, sig, optionId, customer, address, search} = body ?? {};

  const config = toQuery(parseConfig(new URL(`http://x/?${String(search ?? '').replace(/^\?/, '')}`)));

  let resolved;
  try {
    resolved = resolveAmount({quote, sig, optionId});
  } catch (error) {
    return json({error: error.message}, 400);
  }

  const details = address ? {name: customer?.name, address} : undefined;

  try {
    const payment = await createPayment({
      monei,
      amount: resolved.amount,
      currency: CURRENCY,
      sessionId: resolved.seed,
      customer,
      billingDetails: details,
      shippingDetails: details,
      config
    });

    const redirectUrl = payment.nextAction?.redirectUrl;
    if (!redirectUrl) return json({error: 'No redirect URL was returned', id: payment.id}, 502);

    return json({id: payment.id, redirectUrl});
  } catch (error) {
    console.error('payments.create failed', error);
    return json({error: error.message ?? 'Payment could not be created'}, 502);
  }
};
