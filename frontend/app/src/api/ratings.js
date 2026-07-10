/**
 * api/ratings.js — Đánh giá truyện: lấy điểm trung bình + tổng lượt (public),
 * gửi điểm 1-5 sao (đánh giá lại sẽ ghi đè điểm cũ của chính mình).
 */
import client from './client';

export const getRating  = (storyId) => client.get('/api/rating', { params: { story_id: storyId } }).then(r => r.data);
export const postRating = (storyId, rating) =>
  client.post('/api/rating', { story_id: storyId, rating }).then(r => r.data);
