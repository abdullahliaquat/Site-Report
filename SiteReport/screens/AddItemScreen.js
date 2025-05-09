import React, { useState, useEffect } from 'react';
import { ScrollView, View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { Button, TextInput, Text, Snackbar, Card } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { addVoiceNote } from '../api/client';

const AddItemScreen = ({ route, navigation }) => {
  const { reportId } = route.params;

  const [image, setImage] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState(null);
  const [loading, setLoading] = useState(false);
  const [problemDescription, setProblemDescription] = useState('');
  const [recommendedSolution, setRecommendedSolution] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);

  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('Permission to access microphone was denied');
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, [recording]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0]);
    }
  };

  const startRecording = async () => {
    try {
      setError('');
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
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

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError('');

      const uri = await stopRecording();
      if (!uri) {
        throw new Error('No recording found');
      }

      // Create a FormData object
      const formData = new FormData();
      formData.append('audio', {
        uri: uri,
        type: 'audio/m4a',
        name: 'voice-note.m4a'
      });

      // Add other form data
      formData.append('problemDescription', problemDescription);
      formData.append('recommendedSolution', recommendedSolution);

      const response = await addVoiceNote(reportId, formData);
      setReport(response);
      setSnackbarVisible(true);
      
      // Clear the recording state
      setRecording(null);
      setIsRecording(false);
    } catch (err) {
      console.error('Error submitting voice note:', err);
      setError(err.message || 'Failed to process voice note');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        <Text variant="titleLarge" style={styles.title}>Describe The Problem</Text>

        <Card style={styles.card}>
          <Card.Content>

            <Button
              mode={isRecording ? "contained" : "outlined"}
              onPress={isRecording ? stopRecording : startRecording}
              style={styles.button}
              icon={isRecording ? "stop" : "microphone"}
            >
              {isRecording ? "Stop Recording" : "Start Voice Note"}
            </Button>

            {error && <Text style={styles.error}>{error}</Text>}
          </Card.Content>
        </Card>

        {recording && (
          <Button
            mode="contained"
            onPress={handleSubmit}
            style={styles.button}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : 'Submit Voice Note'}
          </Button>
        )}

        {report?.voiceNote && (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.sectionTitle}>Your Voice Note</Text>
              <Text style={styles.transcription}>{report.voiceNote.transcription}</Text>
              
              {report.voiceNote.elaboratedText && (
                <>
                  <Text style={styles.sectionTitle}>AI Analysis</Text>
                  <Text style={styles.analysis}>{report.voiceNote.elaboratedText}</Text>
                </>
              )}
            </Card.Content>
          </Card>
        )}

        <Button
          mode="contained"
          onPress={() => navigation.navigate('PreviewReport', { reportId })}
          style={styles.button}
        >
          Preview Report
        </Button>

        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={2000}
        >
          Report item saved successfully!
        </Snackbar>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { textAlign: 'center', marginBottom: 20 },
  input: { marginBottom: 10 },
  button: { marginVertical: 10 },
  image: { width: '100%', height: 200, marginTop: 10, borderRadius: 10 },
  error: { color: 'red', textAlign: 'center', marginBottom: 10 },
  card: { paddingBottom: 10, marginBottom: 20 },
  scrollContainer: {
    flexGrow: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
  },
  transcription: {
    fontSize: 16,
    marginBottom: 15,
    color: '#666',
  },
  analysis: {
    fontSize: 16,
    lineHeight: 24,
  },
});

export default AddItemScreen;