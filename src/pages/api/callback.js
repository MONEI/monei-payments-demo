import {monei} from '../../lib/monei.js';

export const prerender = false;

/**
 * The signature covers the exact bytes sent, so the body is read as text and
 * verified before anything parses it. A `request.json()` upstream would consume
 * the stream and leave verification with an empty string, which fails identically
 * to a forged request.
 */
export const POST = async ({request}) => {
  if (!monei) return new Response('Not configured', {status: 500});

  const raw = await request.text();
  const signature = request.headers.get('monei-signature');

  if (!raw) {
    console.error('Callback body was empty — the request stream was already consumed');
    return new Response('Empty body', {status: 400});
  }

  try {
    // v3 returns an event envelope; v1 returned the payment itself.
    const event = monei.verifySignature(raw, signature);
    const payment = event.object ?? event;
    console.log(`Callback ${event.type ?? 'payment'} — ${payment.id} is ${payment.status}`);
  } catch (error) {
    console.error('Callback signature verification failed', error.message);
    return new Response('Invalid signature', {status: 401});
  }

  return new Response('OK', {status: 200});
};
