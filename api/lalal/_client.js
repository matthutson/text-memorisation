// Shared helpers for the LALAL.AI proxy functions.
//
// The licence key stays on the server: a key shipped to the browser could be
// read by anyone loading the site and spent against the account's minutes.

const API_BASE = 'https://www.lalal.ai/api/v1';

export const licenceKey = () => process.env.LALAL_LICENSE_KEY;

export const sendJson = (response, status, body) => {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
};

/** Rejects the request unless it is a POST from a configured deployment */
export const guard = (request, response) => {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Use POST' });
    return null;
  }
  const key = licenceKey();
  if (!key) {
    sendJson(response, 501, {
      error: 'Stem splitting is not configured. Set LALAL_LICENSE_KEY in the Vercel project environment variables.'
    });
    return null;
  }
  return key;
};

/** Call a LALAL.AI endpoint with the licence key attached */
export const callLalal = async (path, { key, body, headers = {} }) => {
  const upstream = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'X-License-Key': key, ...headers },
    body
  });

  const text = await upstream.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { error: text.slice(0, 500) };
  }
  return { ok: upstream.ok, status: upstream.status, body: parsed };
};

/** Read a JSON request body (Vercel parses it, but be tolerant of raw streams) */
export const readJsonBody = async (request) => {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}');
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};
