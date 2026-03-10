import axios from 'axios';

const API_BASE = import.meta.env.DEV ? '/api' : ''; // '/api' for Dev proxy, '' (root) for Prod/Python serving

export const uploadPDF = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_BASE}/upload`, formData);
    return response.data;
};

export const getVoices = async () => {
    const response = await axios.get(`${API_BASE}/voices`);
    return response.data;
};

export const getLibrary = async () => {
    const response = await axios.get(`${API_BASE}/library`);
    return response.data;
};

export const deleteBook = async (docId) => {
    const response = await axios.delete(`${API_BASE}/library/${docId}`);
    return response.data;
};

export const getAudioUrl = (docId, pageNum, voice = "es-AR-TomasNeural", translate = false) => {
    return `${API_BASE}/audio/${docId}/${pageNum}?voice=${voice}&translate=${translate}`;
};

export const getPageImageUrl = (docId, pageNum) => {
    return `${API_BASE}/document/${docId}/image/${pageNum}`;
};

export const getPageContent = async (docId, pageNum) => {
    // Not strictly needed if we just play audio, but good for validity
    // Added for extensibility
    return null;
};

export const getDocStatus = async (docId) => {
    const response = await axios.get(`${API_BASE}/document/${docId}/status`);
    return response.data;
};

export const updateProgress = async (docId, page) => {
    const response = await axios.post(`${API_BASE}/document/${docId}/progress`, { page });
    return response.data;
};

export const getSummary = async (docId) => {
    const response = await axios.post(`${API_BASE}/document/${docId}/summary`);
    return response.data;
};
