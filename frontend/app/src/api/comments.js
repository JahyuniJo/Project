import client from './client';

export const getComments = (storyId) =>
  client.get('/api/comments', { params: { story_id: storyId } }).then(r => r.data);

export const addComment = (data) =>
  client.post('/api/comments', data).then(r => r.data);

export const editComment = (data) =>
  client.put('/api/comments', data).then(r => r.data);

export const deleteComment = (data) =>
  client.delete('/api/comments', { data }).then(r => r.data);

export const likeComment = (data) =>
  client.post('/api/comments/like', data).then(r => r.data);

export const replyComment = (data) =>
  client.post('/api/comments/reply', data).then(r => r.data);
