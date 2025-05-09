import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, Button, Card, ActivityIndicator } from 'react-native-paper';
import { getReports } from '../api/client';

export default function ReportActionsScreen({ navigation }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await getReports();
      setReports(data);
    } catch (err) {
      setError('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const renderReport = ({ item }) => (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.title}>{item.jobName}</Text>
        <Text>Client: {item.clientName}</Text>
        <Text>Date: {item.date}</Text>
        <Text>Status: {item.status}</Text>
      </Card.Content>
      <Card.Actions>
        <Button onPress={() => navigation.navigate('PreviewReport', { reportId: item.id })}>
          View
        </Button>
      </Card.Actions>
    </Card>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Report Actions</Text>
      
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={reports}
        renderItem={renderReport}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
      />

      <Button
        mode="contained"
        onPress={() => navigation.navigate('NewReport')}
        style={styles.button}
      >
        Create New Report
      </Button>
    </View>
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
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  list: {
    paddingBottom: 20,
  },
  card: {
    marginBottom: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  button: {
    marginTop: 10,
  },
  error: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 10,
  },
});
