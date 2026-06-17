import client from './client';

export const submitReport  = (formData) =>
  client.post('/api/report', formData).then(r => r.data);

export const getMyReports  = () => client.get('/api/reports/my').then(r => r.data);
