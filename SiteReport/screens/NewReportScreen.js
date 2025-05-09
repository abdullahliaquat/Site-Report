import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { TextInput, Button, Text, ActivityIndicator } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { createReport } from '../api/client';
import { Image } from 'react-native';
import { Audio } from 'expo-av';

export default function NewReportScreen({ navigation }) {
  const [formData, setFormData] = useState({
    jobName: '',
    clientName: '',
    address: '',
    date: new Date().toISOString().split('T')[0],
  });
  // Each item: { photo, noteType: 'text'|'voice', note: string (text or audio uri), transcription: string }
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState(null);
  const [currentPhoto, setCurrentPhoto] = useState(null);
  const [currentText, setCurrentText] = useState('');
  const [aiReport, setAiReport] = useState(null);

  const handleInputChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });
    if (!result.canceled) {
      setCurrentPhoto(result.assets[0]);
    }
  };

  const takePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });
    if (!result.canceled) {
      setCurrentPhoto(result.assets[0]);
    }
  };

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      setError('Failed to start recording');
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      return uri;
    } catch (err) {
      setError('Failed to stop recording');
      return null;
    }
  };

  const addItem = async (noteType) => {
    if (!currentPhoto) return;
    let note = '';
    let transcription = '';
    if (noteType === 'voice') {
      note = await stopRecording();
      if (!note) {
        setError('No recording found');
        return;
      }
    } else {
      note = currentText;
      if (!note) {
        setError('Please enter a description');
        return;
      }
    }
    setItems(prev => [...prev, { photo: currentPhoto, noteType, note, transcription }]);
    setCurrentPhoto(null);
    setCurrentText('');
    setError('');
  };

  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError('');
      setAiReport(null);
      if (!formData.jobName || !formData.clientName || !formData.address) {
        throw new Error('Please fill in all required fields');
      }
      if (items.length < 1) {
        throw new Error('Add at least one photo and note');
      }
      // Build FormData with all fields and files
      const form = new FormData();
      const photoDescriptions = [];
      items.forEach((item, idx) => {
        // Always upload the image
        form.append('photos', {
          uri: item.photo.uri,
          type: item.photo.mimeType || 'image/jpeg',
          name: item.photo.fileName || `photo${idx + 1}.jpg`
        });
        // If voice, also upload the audio
        let voiceFile = '';
        if (item.noteType === 'voice') {
          const audioFileName = `voice${idx + 1}.m4a`;
          form.append('voices', {
            uri: item.note,
            type: 'audio/m4a',
            name: audioFileName
          });
          voiceFile = audioFileName;
        }
        photoDescriptions.push({
          type: item.noteType,
          description: item.noteType === 'text' ? item.note : '',
          transcription: '',
          voiceFile
        });
      });
      Object.keys(formData).forEach(key => {
        form.append(key, formData[key]);
      });
      form.append('photoDescriptions', JSON.stringify(photoDescriptions));
      // Send FormData directly
      const report = await createReport(form);
      // Call AI analysis endpoint
      await fetch(`${process.env.API_URL || 'http://192.168.137.1:3000/api'}/reports/${report.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      navigation.replace('PreviewReport', { reportId: report.id });
    } catch (err) {
      setError(err.message || 'Failed to create report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>New Report</Text>
      <TextInput label="Job Name" value={formData.jobName} onChangeText={text => handleInputChange('jobName', text)} style={styles.input} />
      <TextInput label="Client Name" value={formData.clientName} onChangeText={text => handleInputChange('clientName', text)} style={styles.input} />
      <TextInput label="Address" value={formData.address} onChangeText={text => handleInputChange('address', text)} style={styles.input} multiline />
      <TextInput label="Date" value={formData.date} onChangeText={text => handleInputChange('date', text)} style={styles.input} />
      <Button mode="outlined" onPress={pickImage} style={styles.button} disabled={items.length >= 20 || currentPhoto !== null}>Add Photo from Gallery</Button>
      <Button mode="outlined" onPress={takePhoto} style={styles.button} disabled={items.length >= 20 || currentPhoto !== null}>Take Photo with Camera</Button>
      {currentPhoto && (
        <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 10, marginVertical: 20 }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 10 }}>Add Note for Photo</Text>
          <Image source={{ uri: currentPhoto.uri }} style={{ width: 120, height: 120, borderRadius: 8, marginBottom: 10 }} />
          <Button mode={isRecording ? 'contained' : 'outlined'} onPress={isRecording ? () => addItem('voice') : startRecording} style={styles.button} icon={isRecording ? 'stop' : 'microphone'}>{isRecording ? 'Stop & Save Voice' : 'Record Voice Note'}</Button>
          <Text style={{ textAlign: 'center', marginVertical: 8 }}>OR</Text>
          <TextInput label="Text Description" value={currentText} onChangeText={setCurrentText} style={styles.input} multiline />
          <Button mode="contained" onPress={() => addItem('text')} style={styles.button}>Save Text Note</Button>
          <Button onPress={() => { setCurrentPhoto(null); setCurrentText(''); setError(''); }} style={styles.button}>Cancel</Button>
        </View>
      )}
      {items.length > 0 && (
        <ScrollView horizontal style={{ marginBottom: 10 }}>
          {items.map((item, idx) => (
            <View key={idx} style={{ marginRight: 8, alignItems: 'center' }}>
              <Image source={{ uri: item.photo.uri }} style={{ width: 80, height: 80, borderRadius: 8 }} />
              <Text style={{ fontSize: 12 }}>{item.noteType === 'voice' ? 'Voice' : 'Text'}</Text>
              <Button onPress={() => removeItem(idx)} compact>Remove</Button>
            </View>
          ))}
        </ScrollView>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button mode="contained" onPress={handleSubmit} style={styles.button} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : 'Submit Report'}</Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    marginBottom: 15,
  },
  button: {
    marginTop: 10,
    marginBottom: 20,
  },
  error: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 10,
  },
});
