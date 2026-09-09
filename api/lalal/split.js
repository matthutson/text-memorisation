import { callLalal, guard, readJsonBody, sendJson } from './_client.js';

// Starts a stem separation. Splitting for 'vocals' returns the vocal as the
// stem and the instrumental as the back track, which is the pair we want for
// singing along.
export default async function handler(request, response) {
  const key = guard(request, response);
  if (!key) return;

  try {
    const { source_id: sourceId, stem = 'vocals', splitter, extraction_level: extraction, encoder_format: format } = await readJsonBody(request);
    if (!sourceId) return sendJson(response, 400, { error: 'source_id is required' });

    const presets = { stem };
    if (splitter) presets.splitter = splitter;
    if (extraction) presets.extraction_level = extraction;
    if (format) presets.encoder_format = format;

    const result = await callLalal('/split/stem_separator/', {
      key,
      body: JSON.stringify({ source_id: sourceId, presets }),
      headers: { 'Content-Type': 'application/json' }
    });

    sendJson(response, result.ok ? 200 : result.status, result.body);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}
