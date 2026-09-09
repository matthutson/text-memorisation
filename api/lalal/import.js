import { guard, readJsonBody, sendJson } from './_client.js';

// LALAL.AI's result files expire, so a finished stem is copied into the app's
// own storage bucket and the durable public URL is handed back.
export const config = { maxDuration: 60 };

const storageConfig = () => ({
  url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  key: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
});

export default async function handler(request, response) {
  const key = guard(request, response);
  if (!key) return;

  const storage = storageConfig();
  if (!storage.url || !storage.key) {
    return sendJson(response, 501, {
      error: 'Storage is not configured for the API. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the Vercel environment.'
    });
  }

  try {
    const { url, path, bucket = 'stems' } = await readJsonBody(request);
    if (!url || !path) return sendJson(response, 400, { error: 'url and path are required' });

    const source = await fetch(url);
    if (!source.ok) {
      return sendJson(response, 502, { error: `Could not download the finished stem (${source.status})` });
    }
    const audio = Buffer.from(await source.arrayBuffer());

    const upload = await fetch(`${storage.url}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${storage.key}`,
        apikey: storage.key,
        'Content-Type': source.headers.get('content-type') || 'audio/mpeg',
        'x-upsert': 'true'
      },
      body: audio
    });

    if (!upload.ok) {
      const detail = await upload.text();
      return sendJson(response, 502, { error: `Could not save the stem: ${detail.slice(0, 300)}` });
    }

    sendJson(response, 200, {
      publicUrl: `${storage.url}/storage/v1/object/public/${bucket}/${path}`,
      storagePath: path,
      size: audio.length
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}
