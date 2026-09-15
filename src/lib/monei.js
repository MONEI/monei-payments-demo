import {Monei} from '@monei-js/node-sdk';

const env = import.meta.env ?? process.env;

export const accountId = env.MONEI_ACCOUNT_ID;

export const monei = env.MONEI_API_KEY ? new Monei(env.MONEI_API_KEY) : null;

const METHODS_URL = 'https://api.monei.com/v1/client-payment-methods';

/**
 * Payment methods enabled on the account. The SDK's own `getPaymentMethods` ships
 * in the browser bundle and the node SDK has no equivalent, so this calls the same
 * public endpoint the Components call.
 *
 * Returns null on any failure, meaning "unknown — show every method and let each
 * Component's onLoad report support". The store must never be blocked by it.
 */
export const fetchAccountMethods = async () => {
  if (!accountId) return null;
  try {
    const res = await fetch(`${METHODS_URL}?accountId=${encodeURIComponent(accountId)}`, {
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.paymentMethods)) return null;
    return {
      methods: data.paymentMethods,
      livemode: Boolean(data.livemode),
      countryCode: data.countryCode ?? null,
      cardBrands: data.metadata?.card?.brands ?? []
    };
  } catch {
    return null;
  }
};
