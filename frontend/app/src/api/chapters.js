import client from './client';

export const getChapterContent = (id) =>
  client.get(`/api/chapters/${id}/content`).then(r => r.data);
