import client from './client';

export const getChatHistory = (storyId) => {
  const params = {};
  if (storyId) params.story_id = storyId;
  return client.get('/api/chat/history', { params }).then(r => r.data);
};

export const deleteChatHistory = (storyId) => {
  const params = {};
  if (storyId) params.story_id = storyId;
  return client.delete('/api/chat/history', { params }).then(r => r.data);
};
