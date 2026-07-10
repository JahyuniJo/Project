/**
 * api/reports.js — Báo lỗi phía user: gửi báo lỗi mới (FormData vì có thể kèm
 * ảnh chụp màn hình) và xem lịch sử báo lỗi của mình kèm phản hồi admin.
 */
import client from './client';

export const submitReport  = (formData) =>
  client.post('/api/report', formData).then(r => r.data);

export const getMyReports  = () => client.get('/api/reports/my').then(r => r.data);
