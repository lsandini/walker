import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, SafeAreaView, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { requireNativeModule } from 'expo-modules-core';

const MyModule = requireNativeModule('MyModule');

export default function App() {
  const [moduleInfo, setModuleInfo] = useState('');
  const [helloResult, setHelloResult] = useState('');
  const [error, setError] = useState(null);
  const [stepCount, setStepCount] = useState(0);
  const [lastUpdateTime, setLastUpdateTime] = useState('N/A');
  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    // Inspect MyModule
    const info = Object.getOwnPropertyNames(MyModule).map(prop => {
      return `${prop}: ${typeof MyModule[prop]}`;
    }).join('\n');
    setModuleInfo(info);
    console.log('MyModule content:', info);

    // Try to call hello function
    if (typeof MyModule.hello === 'function') {
      try {
        const result = MyModule.hello();
        setHelloResult(result);
      } catch (err) {
        setError(`Error calling hello: ${err.message}`);
      }
    } else {
      setError('hello function is not available');
    }

    // Set up listener for step updates
    const subscription = MyModule.addListener('onStepsUpdate', (event) => {
      console.log('Step update received:', event);
      if (event && typeof event.steps === 'number') {
        setStepCount(event.steps);
        setLastUpdateTime(new Date().toLocaleTimeString());
      }
    });

    return () => {
      if (isTracking) {
        stopStepTracking();
      }
      subscription.remove();
    };
  }, []);

  const startStepTracking = async () => {
    try {
      const result = await MyModule.startStepTracking();
      console.log('Start step tracking result:', result);
      setIsTracking(true);
      setError(null);
    } catch (err) {
      console.error('Error starting step tracking:', err);
      setError(`Error starting step tracking: ${err.message}`);
    }
  };

  const stopStepTracking = async () => {
    try {
      const result = await MyModule.stopStepTracking();
      console.log('Stop step tracking result:', result);
      setIsTracking(false);
      setError(null);
    } catch (err) {
      console.error('Error stopping step tracking:', err);
      setError(`Error stopping step tracking: ${err.message}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>MyModule Inspection</Text>
        <Text style={styles.resultText}>Available properties and methods:</Text>
        <Text style={styles.codeText}>{moduleInfo}</Text>
        <Text style={styles.resultText}>Current Step Count: {Math.round(stepCount)}</Text>
        <Text style={styles.resultText}>Last Update: {lastUpdateTime}</Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Button 
          title={isTracking ? "Stop Step Tracking" : "Start Step Tracking"} 
          onPress={isTracking ? stopStepTracking : startStepTracking} 
        />
        <StatusBar style="auto" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  resultText: {
    fontSize: 16,
    marginVertical: 10,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 14,
    marginVertical: 10,
  },
  errorText: {
    color: 'red',
    marginVertical: 10,
  },
});