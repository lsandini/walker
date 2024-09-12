import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { hello } from './modules/my-module';
import * as MyModule from './modules/my-module';

export default function App() {
  const [helloResult, setHelloResult] = useState('');

  // print Pi to console
  console.log('Value of PI from MyModule:', MyModule.PI);
  // Log the entire MyModule object
  console.log('MyModule contents:', MyModule);

  useEffect(() => {
    try {
      const result = hello();
      console.log('Result of hello():', result);
      setHelloResult(result);
    } catch (error) {
      console.error('Error calling hello():', error);
      setHelloResult('Error calling hello()');
    }
  }, []);

  return (
    <View style={styles.container}>
      <Text>Open up App.js to start working on your app!</Text>
      <Text style={styles.helloText}>Hello function result: {helloResult}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helloText: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: 'bold',
  },
});