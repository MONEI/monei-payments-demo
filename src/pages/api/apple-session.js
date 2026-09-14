import {accountId} from '../../lib/monei.js';

export const prerender = false;

const env = import.meta.env ?? process.env;

/**
 * Signs an Apple Pay merchant session, which is the one step a browser cannot do
 * itself. Exists for /apple-test, a page that drives Apple Pay without the MONEI
 * components, to tell an SDK fault apart from a configuration one.
 */
export const POST = async ({request}) => {
  const {validationUrl, domainName} = await request.json();

  const response = await fetch('https://api.monei.com/v1/apple-pay/sessions', {
    method: 'POST',
    headers: {authorization: env.MONEI_API_KEY, 'content-type': 'application/json'},
    body: JSON.stringify({
      accountId,
      validationUrl,
      domainName,
      displayName: 'MONEI Payments Demo'
    })
  });

  const body = await response.text();
  return new Response(body, {status: response.status, headers: {'content-type': 'application/json'}});
};
