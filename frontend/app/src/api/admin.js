/**
 * api/admin.js — Toàn bộ lời gọi API cho khu quản trị (mọi endpoint đều yêu cầu
 * role admin): thống kê dashboard, quản lý user (CRUD + khóa tài khoản),
 * quản lý truyện (sync crawl, sửa/xóa), xử lý báo lỗi và giám sát log chatbot.
 */
import client from './client';

// Dashboard
export const getPendingCount = () => client.get('/api/admin/reports/pending-count').then(r => r.data);

// Stats
export const getAdminStats = () => client.get('/api/stat').then(r => r.data);
export const getAdminPopularWeek = () => client.get('/api/stat/popular-week').then(r => r.data);

// Users
export const getUsers   = (params)     => client.get('/api/usercontroll', { params }).then(r => r.data);
export const createUser = (data)       => client.post('/api/usercontroll', data).then(r => r.data);
export const updateUser = (id, data)   => client.put(`/api/usercontroll/${id}`, data).then(r => r.data);
export const deleteUser = (id)         => client.delete(`/api/usercontroll/${id}`).then(r => r.data);
export const lockUser   = (id, hours)  => client.patch(`/api/usercontroll/${id}/lock`, { duration_hours: hours }).then(r => r.data);

// Stories admin
export const getStatusCounts = ()      => client.get('/api/stories/status-counts').then(r => r.data);
export const syncStories     = ()      => client.post('/api/stories/sync').then(r => r.data);
export const syncChapters    = (id)    => client.post(`/api/stories/${id}/crawl-chapters`).then(r => r.data);
export const updateStory     = (id, d) => client.put(`/api/stories/${id}`, d).then(r => r.data);
export const deleteStory     = (id)    => client.delete(`/api/stories/${id}`).then(r => r.data);
export const getStoryDetail  = (id)    => client.get(`/api/stories/${id}`).then(r => r.data);

// Reports
export const getAdminReports = ()         => client.get('/api/admin/reports').then(r => r.data);
export const respondReport   = (id, data) => client.post(`/api/admin/reports/${id}/respond`, data).then(r => r.data);

// Chat admin
export const getChatStats      = ()      => client.get('/api/admin/chat/stats').then(r => r.data);
export const getChatLogs       = (params)=> client.get('/api/admin/chat/logs', { params }).then(r => r.data);
export const deleteChatMessage = (id)    => client.delete(`/api/admin/chat/messages/${id}`).then(r => r.data);
