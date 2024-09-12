import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, Button, SafeAreaView, FlatList } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as MyModule from './modules/my-module';

export default function App() {
  const [helloResult, setHelloResult] = useState('');
  const [stepCount, setStepCount] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [stepUpdates, setStepUpdates] = useState([]);
  const [error, setError] = useState(null);

  const handleStepUpdate = useCallback((event) => {
    console.log('Raw step update received:', event);
    try {
      const data = JSON.parse(event);
      if ('steps' in data) {
        const steps = Number(data.steps);
        if (!isNaN(steps)) {
          setStepCount(steps);
          setStepUpdates(prevUpdates => [...prevUpdates, { timestamp: new Date().toLocaleTimeString(), steps }]);
        } else {
          throw new Error('Invalid step count');
        }
      } else {
        throw new Error('Steps data not found in event');
      }
    } catch (err) {
      console.error('Error processing step update:', err);
      setError(`Error processing step update: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    setHelloResult(MyModule.hello());

    if (typeof MyModule.addChangeListener === 'function') {
      const removeListener = MyModule.addChangeListener('onStepsUpdate', handleStepUpdate);
      console.log('Listener added successfully');

      return () => {
        if (typeof removeListener === 'function') {
          removeListener();
          console.log('Listener removed successfully');
        }
        stopStepTracking();
      };
    } else {
      console.warn('addChangeListener is not available');
      return () => {
        stopStepTracking();
      };
    }
  }, [handleStepUpdate]);

  const startStepTracking = async () => {
    try {
      await MyModule.startStepTracking();
      setIsTracking(true);
      console.log('Step tracking started');
    } catch (err) {
      console.error('Error starting step tracking:', err);
      setError(`Error starting step tracking: ${err.message}`);
    }
  };

  const stopStepTracking = async () => {
    try {
      await MyModule.stopStepTracking();
      setIsTracking(false);
      console.log('Step tracking stopped');
    } catch (err) {
      console.error('Error stopping step tracking:', err);
      setError(`Error stopping step tracking: ${err.message}`);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.title}>HealthKit Step Tracking</Text>
      <Text style={styles.resultText}>Hello function result: {helloResult}</Text>
      <Text style={styles.resultText}>Current step count: {stepCount}</Text>
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Button 
        title={isTracking ? "Stop Tracking" : "Start Tracking"} 
        onPress={isTracking ? stopStepTracking : startStepTracking} 
      />
      <Text style={styles.title}>Step Updates:</Text>
    </View>
  );

  const renderStepUpdate = ({ item }) => (
    <Text style={styles.updateText}>
      {item.timestamp}: {item.steps} steps
    </Text>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ListHeaderComponent={renderHeader}
        data={stepUpdates}
        renderItem={renderStepUpdate}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={styles.listContent}
      />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  listContent: {
    paddingBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  resultText: {
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: 'red',
    marginTop: 10,
    fontSize: 16,
  },
  updateText: {
    fontSize: 14,
    marginVertical: 5,
    paddingHorizontal: 20,
  },
});