import axios from 'axios';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Get the current IP address
const getLocalIP = () => {
  // For development, you can hardcode your IP here
  return '192.168.137.1'; // Your computer's actual IP address
};

// Replace this with your computer's local IP address
const API_BASE_URL = process.env.API_URL || `http://${getLocalIP()}:3000/api`;

console.log('Using API URL:', API_BASE_URL);
console.log('Make sure your mobile device is on the same network as your computer (192.168.137.x)');

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds timeout
});

// Add request interceptor for better error handling
apiClient.interceptors.request.use(
  config => {
    console.log('Making request to:', config.url);
    console.log('Full URL:', API_BASE_URL + config.url);
    console.log('Request config:', {
      method: config.method,
      headers: config.headers,
      data: config.data instanceof FormData ? 'FormData' : config.data
    });
    return config;
  },
  error => {
    console.error('Request error:', {
      message: error.message,
      code: error.code,
      config: error.config
    });
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
apiClient.interceptors.response.use(
  response => {
    console.log('Response received:', {
      status: response.status,
      url: response.config.url,
      data: response.data
    });
    return response;
  },
  error => {
    console.error('Response error:', {
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : 'No response',
      config: error.config,
      fullError: JSON.stringify(error, null, 2)
    });

    // More specific error messages
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('Request timeout. Please check your network connection.'));
    }
    if (!error.response) {
      if (error.code === 'ERR_NETWORK') {
        return Promise.reject(new Error(`Cannot connect to server at ${API_BASE_URL}. Please check:
        1. The server is running
        2. Your device is on the same network as the server
        3. The IP address is correct
        4. No firewall is blocking the connection
        5. Try accessing ${API_BASE_URL} in your browser`));
      }
      return Promise.reject(new Error('Network error. Please check your internet connection and ensure the server is running.'));
    }
    if (error.response.status === 404) {
      return Promise.reject(new Error('Resource not found. Please try again.'));
    }
    if (error.response.status === 500) {
      return Promise.reject(new Error('Server error. Please try again later.'));
    }
    return Promise.reject(error);
  }
);

export const createReport = async (formData) => {
  try {
    const response = await apiClient.post('/reports', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Accept': 'application/json',
      },
      transformRequest: (data, headers) => data,
    });
    return response.data;
  } catch (error) {
    console.error('Error in createReport:', error);
    throw error;
  }
};

export const addVoiceNote = async (reportId, formData) => {
  try {
    console.log('Sending voice note to server...');
    const response = await apiClient.post(`/reports/${reportId}/voice`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      transformRequest: (data, headers) => {
        // Don't transform the FormData
        return data;
      }
    });
    console.log('Voice note sent successfully');
    return response.data;
  } catch (error) {
    console.error('Error sending voice note:', error);
    throw error;
  }
};

export const generatePDF = async (reportId) => {
  try {
    console.log('Generating PDF for report:', reportId);
    const response = await apiClient.get(`/reports/${reportId}/pdf`, {
      responseType: 'blob',
      headers: {
        'Accept': 'application/pdf'
      }
    });
    
    // Convert blob to base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(response.data);
    });

    // Save the PDF file
    const fileUri = `${FileSystem.cacheDirectory}report-${reportId}.pdf`;
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Share the PDF file
    if (Platform.OS === 'android') {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share PDF Report',
      });
    } else {
      // For iOS, we can use the share dialog
      await Sharing.shareAsync(fileUri);
    }

    return fileUri;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

export const emailReport = async (reportId, email) => {
  const response = await apiClient.post(`/reports/${reportId}/email`, { email });
  return response.data;
};

export const getReports = async () => {
  const response = await apiClient.get('/reports');
  return response.data;
};

export const getReport = async (reportId) => {
  const response = await apiClient.get(`/reports/${reportId}`);
  return response.data;
};

export const updateReport = async (reportId, data) => {
  const response = await apiClient.patch(`/reports/${reportId}`, data);
  return response.data;
}; 