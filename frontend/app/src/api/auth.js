/**
 * api/auth.js — Các hàm gọi API xác thực & tài khoản: đăng nhập/đăng ký,
 * pipeline quên mật khẩu (gửi OTP → verify → reset), đổi mật khẩu, thống kê
 * cá nhân, upload avatar, ghi lượt xem và yêu cầu tóm tắt AI.
 * Mỗi hàm trả về Promise resolve thẳng `response.data`.
 */
import client from './client';

export const login         = (data)  => client.post('/api/users/login', data).then(r => r.data);
export const register      = (data)  => client.post('/api/users/register', data).then(r => r.data);
export const forgotPassword= (email) => client.post('/api/auth/forgot-password', { email }).then(r => r.data);
export const verifyOtp     = (data)  => client.post('/api/auth/verify-otp', data).then(r => r.data);
export const resetPassword = (data)  => client.post('/api/auth/reset-password', data).then(r => r.data);
export const changePassword= (data)  => client.post('/api/auth/change-password', data).then(r => r.data);
export const getUserStats  = ()      => client.get('/api/users/stats').then(r => r.data);
export const uploadAvatar  = (formData) =>
  client.post('/api/users/upload-avatar', formData).then(r => r.data);
export const recordView    = (storyId) => client.post(`/api/stories/${storyId}/view`).then(r => r.data);
export const summarize     = (storyId) => client.post('/api/ai/summarize', { story_id: storyId }).then(r => r.data);
