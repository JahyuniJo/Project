import client from './client';

export const getFavLists    = ()           => client.get('/api/favlists', { withCredentials: true }).then(r => r.data);
export const createFavList  = (name)       => client.post('/api/favlists', { name }).then(r => r.data);
export const renameFavList  = (id, name)   => client.put(`/api/favlists/${id}`, { name }).then(r => r.data);
export const deleteFavList  = (id)         => client.delete(`/api/favlists/${id}`).then(r => r.data);
export const getListStories = (id)         => client.get(`/api/favlists/${id}/stories`).then(r => r.data);
export const addToList      = (id, storyId)=> client.post(`/api/favlists/${id}/stories`, { storyId }).then(r => r.data);
export const removeFromList = (listId, storyId) =>
  client.delete(`/api/favlists/${listId}/stories/${storyId}`).then(r => r.data);
