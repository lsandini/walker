import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, SafeAreaView, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as MyModule from './modules/my-module';

export default function App() {
  const [moduleInfo, setModuleInfo] = useState('');
  const [helloResult, setHelloResult] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    // Inspect MyModule
    const info = Object.getOwnPropertyNames(MyModule).map(prop => {
      return `${prop}: ${typeof MyModule[prop]}`;
    }).join('\n');
    setModuleInfo(info);

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
  }, []);

  const callFunction = async (funcName) => {
    if (typeof MyModule[funcName] === 'function') {
      try {
        const result = await MyModule[funcName]();
        console.log(`${funcName} result:`, result);
        setError(`${funcName} called successfully`);
      } catch (err) {
        console.error(`Error calling ${funcName}:`, err);
        setError(`Error calling ${funcName}: ${err.message}`);
      }
    } else {
      setError(`${funcName} is not a function`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>MyModule Inspection</Text>
        <Text style={styles.resultText}>Available properties and methods:</Text>
        <Text style={styles.codeText}>{moduleInfo}</Text>
        <Text style={styles.resultText}>Hello function result: {helloResult}</Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Button title="Call hello()" onPress={() => callFunction('hello')} />
        <Button title="Call startStepTracking()" onPress={() => callFunction('startStepTracking')} />
        <Button title="Call stopStepTracking()" onPress={() => callFunction('stopStepTracking')} />
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