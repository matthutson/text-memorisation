import { callLalal, guard, readJsonBody, sendJson } from './_client.js';

// Starts a stem separation. Splitting for 'vocals' with multivocal set to
// 'lead_back' returns the lead vocal and the backing vocals as separate stems
// alongside the instrumental, which is what a singer wants to practise against.
export default async function handler(request, response) {
  const key = guard(request, response);
  if (!key) return;

  try {
    const {
      source_id: sourceId,
      stem = 'vocals',
      splitter,
      multivocal,
      extraction_level: extraction,
      encoder_format: format
    } = await readJsonBody(request);
    if (!sourceId) return sendJson(response, 400, { error: 'source_id is required' });

    const presets = { stem };
    if (splitter) presets.splitter = splitter;
    if (multivocal) presets.multivocal = multivocal;
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
