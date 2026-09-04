import {monei} from '../../lib/monei.js';
import {CURRENCY} from '../../lib/config.js';
import {createPayment, resolveAmount} from '../../lib/payment.js';

export const prerender = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

export const POST = async ({request}) => {
  if (!monei) return json({error: 'MONEI_API_KEY is not configured'}, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({error: 'Invalid JSON'}, 400);
  }

  const {paymentToken, quote, sig, optionId, walletAmount, customer, address} = body ?? {};
  if (!paymentToken) return json({error: 'Missing paymentToken'}, 400);

  let resolved;
  try {
    resolved = resolveAmount({quote, sig, optionId});
  } catch (error) {
    return json({error: error.message}, 400);
  }

  // A wallet-reported total that disagrees with the recomputed one means the sheet
  // and the server priced the order differently; refusing is the only safe answer.
  if (walletAmount != null && Number(walletAmount) !== resolved.amount) {
    console.warn(`Amount mismatch: wallet reported ${walletAmount}, server computed ${resolved.amount}`);
    return json({error: 'Amount mismatch', expected: resolved.amount}, 422);
  }

  const details = address ? {name: customer?.name, address} : undefined;

  try {
    const payment = await createPayment({
      monei,
      amount: resolved.amount,
      currency: CURRENCY,
      paymentToken,
      sessionId: resolved.seed,
      customer,
      billingDetails: details,
      shippingDetails: details
    });

    return json({
      id: payment.id,
      status: payment.status,
      nextAction: payment.nextAction ?? null
    });
  } catch (error) {
    console.error('payments.create failed', error);
    return json({error: error.message ?? 'Payment could not be created'}, 502);
  }
};
