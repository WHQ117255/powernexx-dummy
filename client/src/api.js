const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, options);
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data && data.error) msg = data.error;
    } catch (_) {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export const getItems = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/items${qs ? '?' + qs : ''}`);
};
export const getStats = () => request('/stats');
export const getMeta = () => request('/meta');
export const parseMessage = (text) =>
  request('/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
export const updateItems = (items) =>
  request('/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
export const getTransactions = (page = 1, pageSize = 50) =>
  request(`/transactions?page=${page}&pageSize=${pageSize}`);

export async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(BASE + '/upload', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '上传失败');
  return data;
}

export const exportUrl = (type = 'snapshot', format = 'xlsx') =>
  `${BASE}/export?type=${type}&format=${format}`;
