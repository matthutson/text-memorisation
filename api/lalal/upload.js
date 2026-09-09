import { callLalal, guard, readJsonBody, sendJson } from './_client.js';

// Vercel caps request bodies at 4.5MB, which most songs exceed, so the browser
// sends us the storage URL of the file it already uploaded and we fetch it here.
export const config = { maxDuration: 60 };

export default async function handler(request, response) {
  const key = guard(request, response);
  if (!key) return;

  try {
    const { url, filename } = await readJsonBody(request);
    if (!url) return sendJson(response, 400, { error: 'A file url is required' });

    const source = await fetch(url);
    if (!source.ok) {
      return sendJson(response, 502, { error: `Could not read the uploaded file (${source.status})` });
    }
    const audio = Buffer.from(await source.arrayBuffer());

    const result = await callLalal('/upload/', {
      key,
      body: audio,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${(filename || 'song.mp3').replace(/"/g, '')}"`
      }
    });

    sendJson(response, result.ok ? 200 : result.status, result.body);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}
