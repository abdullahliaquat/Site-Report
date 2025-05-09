import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Share } from 'react-native';
import { Text, Button, TextInput, ActivityIndicator } from 'react-native-paper';
import { generatePDF, emailReport, getReport, updateReport } from '../api/client';

export default function PreviewReportScreen({ route, navigation }) {
  const { reportId } = route.params;
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [aiReportEdit, setAiReportEdit] = useState('');
  const [editSaved, setEditSaved] = useState(false);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setLoading(true);
      const data = await getReport(reportId);
      setReport(data);
      setAiReportEdit(data.aiReport || '');
      setEditSaved(false);
    } catch (err) {
      setError('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      setLoading(true);
      await updateReport(reportId, { aiReport: aiReportEdit });
      setEditSaved(true);
      setError('');
    } catch (err) {
      setError('Failed to save edits');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    try {
      setLoading(true);
      setError('');
      await generatePDF(reportId);
    } catch (err) {
      setError('Failed to generate PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async () => {
    try {
      setLoading(true);
      setError('');
      
      if (!email) {
        throw new Error('Please enter an email address');
      }

      await emailReport(reportId, email);
      setError('Email sent successfully');
    } catch (err) {
      setError(err.message || 'Failed to send email');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !report) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.container}>
        <Text>Report not found</Text>
      </View>
    );
  }

  // Parse AI report into sections for preview
  const aiSections = (aiReportEdit || '').split(/Photo \d+:/);
  const heading = aiSections[0]?.trim();
  const photoSections = aiSections.slice(1);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Preview Report</Text>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Job Details</Text>
        <Text>Job Name: {report.jobName}</Text>
        <Text>Client: {report.clientName}</Text>
        <Text>Address: {report.address}</Text>
        <Text>Date: {report.date}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Report Heading</Text>
        <TextInput
          value={aiReportEdit}
          onChangeText={setAiReportEdit}
          multiline
          style={{ minHeight: 120, backgroundColor: '#fff', borderRadius: 8, padding: 8 }}
        />
        <Button mode="contained" onPress={handleSaveEdit} style={styles.button} disabled={loading || editSaved}>
          {editSaved ? 'Saved' : 'Save Edits'}
        </Button>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Photos & Analysis</Text>
        {report.photos && report.photos.map((photo, idx) => (
          <View key={idx} style={{ marginBottom: 16 }}>
            <Text style={{ fontWeight: 'bold' }}>Photo {idx + 1}</Text>
            <Text>Type: {photo.type === 'voice' ? 'Voice Note' : 'Text'}</Text>
            <Text>Description: {photo.type === 'text' ? photo.description : (photo.transcription || 'Transcription will appear after processing')}</Text>
            <Text>File: {photo.path.split(/[\\/]/).pop()}</Text>
            {photoSections[idx] && (
              <Text style={{ marginTop: 4, color: '#333' }}>{photoSections[idx].trim()}</Text>
            )}
          </View>
        ))}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recommended Services</Text>
        <Text>Service recommendations will be listed here.</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Additional Notes</Text>
        <Text>No additional project notes at this time.</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        mode="contained"
        onPress={handleGeneratePDF}
        style={styles.button}
        disabled={loading || !editSaved}
      >
        {loading ? <ActivityIndicator color="#fff" /> : 'Save & Share PDF'}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
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
