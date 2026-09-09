import { callLalal, guard, readJsonBody, sendJson } from './_client.js';

// Progress for one or more split tasks
export default async function handler(request, response) {
  const key = guard(request, response);
  if (!key) return;

  try {
    const { task_ids: taskIds } = await readJsonBody(request);
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return sendJson(response, 400, { error: 'task_ids is required' });
    }

    const result = await callLalal('/check/', {
      key,
      body: JSON.stringify({ task_ids: taskIds }),
      headers: { 'Content-Type': 'application/json' }
    });

    sendJson(response, result.ok ? 200 : result.status, result.body);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}
