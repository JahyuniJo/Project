/**
 * api/chapters.js — Lấy nội dung (danh sách ảnh) của 1 chương.
 * Lần gọi đầu tiên với chương mới có thể chậm vài giây vì backend lazy-crawl
 * từ nguồn rồi mới cache vào DB.
 */
import client from './client';

export const getChapterContent = (id) =>
  client.get(`/api/chapters/${id}/content`).then(r => r.data);
