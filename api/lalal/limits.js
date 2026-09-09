import { callLalal, guard, sendJson } from './_client.js';

// How many processing minutes are left on the licence
export default async function handler(request, response) {
  const key = guard(request, response);
  if (!key) return;

  try {
    const result = await callLalal('/limits/minutes_left/', { key });
    sendJson(response, result.ok ? 200 : result.status, result.body);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}
