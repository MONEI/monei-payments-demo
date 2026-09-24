import dotenv from 'dotenv';
import {Monei} from '@monei-js/node-sdk';

// Read from `process.env` at runtime, so no secret is inlined into the build. In
// development the values come from `.env.local` or `.env`; a host sets them directly.
dotenv.config({path: ['.env.local', '.env'], quiet: true});

export const env = process.env;

export const accountId = env.MONEI_ACCOUNT_ID;

export const monei = env.MONEI_API_KEY ? new Monei(env.MONEI_API_KEY) : null;

const METHODS_TTL_MS = 5 * 60 * 1000;
let methodsCache = null;

/**
 * Payment methods enabled on the account, or null when unknown: then every method
 * shows and each Component's onLoad reports support.
 */
export const fetchAccountMethods = () => {
  if (!monei) return Promise.resolve(null);
  if (methodsCache && Date.now() - methodsCache.at < METHODS_TTL_MS) return methodsCache.promise;

  const promise = monei.paymentMethods
    .getAllowed(undefined, undefined, undefined, undefined, {timeout: 4000})
    .then((data) => (Array.isArray(data.paymentMethods) ? data.paymentMethods : null))
    .catch(() => null);
  methodsCache = {at: Date.now(), promise};
  return promise;
};
