/**
 * api/chat.js — Lịch sử chatbot qua HTTP (phần gửi/nhận tin realtime đi qua
 * Socket.io trong ChatWidget, không qua đây). Có storyId → lịch sử chat của
 * truyện đó; bỏ trống → lịch sử chat thư viện (library mode).
 */
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
