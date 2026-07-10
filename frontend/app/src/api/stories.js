/**
 * api/stories.js — Các hàm gọi API truyện phía người đọc: danh sách + tìm kiếm
 * (getStories nhận params search/genres/sort/length/page), chi tiết, danh sách
 * chương, autocomplete, thể loại, rating, truyện hot tuần, crawl chương (admin).
 */
import client from './client';

export const getStories   = (params) => client.get('/api/stories', { params }).then(r => r.data);
export const getStory     = (id)     => client.get(`/api/stories/${id}`).then(r => r.data);
export const getChapters  = (id)     => client.get(`/api/stories/${id}/chapters`).then(r => r.data);
export const searchStories= (q)      => client.get('/api/stories/search', { params: { q } }).then(r => r.data);
export const getGenres    = ()       => client.get('/api/stories/genres').then(r => r.data);
export const getRating    = (id)     => client.get('/api/rating', { params: { story_id: id } }).then(r => r.data);
export const getPopularWeek = ()     => client.get('/api/stat/popular-week').then(r => r.data);
export const crawlChapters= (id)     => client.post(`/api/stories/${id}/crawl-chapters`).then(r => r.data);
