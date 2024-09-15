import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Button, SafeAreaView, ScrollView, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { requireNativeModule } from 'expo-modules-core';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as TaskManager from 'expo-task-manager';

const MyModule = requireNativeModule('MyModule');
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const apiKey = process.env.EXPO_PUBLIC_API_KEY;
console.log('API URL:', apiUrl);
console.log('API Key:', apiKey);
// Pass the values to the native module
MyModule.setApiDetails(apiUrl, apiKey);

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Error in background task:', error);
    return;
  }
  if (data) {
    console.log('Received silent push notification:', data);
    // Trigger step upload
    await MyModule.handleStepUpdate();
  }
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Custom hook to get push tokens based on platform
async function getPushToken() {
  if (Platform.OS === 'ios') {
    const token = await Notifications.getDevicePushTokenAsync();
    console.log('iOS Device Push Token:', token.data);
    return token;
  } else if (Platform.OS === 'android') {
    try {
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig.extra.eas.projectId,
      });
      console.log('Android Expo Push Token:', token.data);
      return token;
    } catch (error) {
      console.error('Error getting Expo Push Token:', error);
    }
  }
  return null;
}

async function registerForPushNotificationsAsync() {
  let token;

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      alert('Failed to get push token for push notification!');
      return;
    }
    token = await getPushToken();
    console.log('Push Notification Token:', token);
  } else {
    console.log('Must use physical device for Push Notifications');
    alert('Must use physical device for Push Notifications');
  }

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return token;
}

export default function App() {
  const [moduleInfo, setModuleInfo] = useState('');
  const [helloResult, setHelloResult] = useState('');
  const [error, setError] = useState(null);
  const [stepCount, setStepCount] = useState(0);
  const [lastUpdateTime, setLastUpdateTime] = useState('N/A');
  const [isTracking, setIsTracking] = useState(false);
  const [pushToken, setPushToken] = useState('');
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setPushToken(token);
        console.log('Push token set:', Platform.OS === 'ios' ? token.data : token.data);
      } else {
        console.log('No push token received');
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
    });

    Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

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
        <Text style={styles.resultText}>Hello Result: {helloResult}</Text>
        <Text style={styles.resultText}>Current Step Count: {Math.round(stepCount)}</Text>
        <Text style={styles.resultText}>Last Update: {lastUpdateTime}</Text>
        <Text style={styles.resultText}>
          Push Token: {pushToken ? (Platform.OS === 'ios' ? pushToken.data : pushToken.data) : 'No token yet'}
        </Text>
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
    color: '#333',
  },
  resultText: {
    fontSize: 16,
    marginVertical: 10,
    color: '#444',
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 14,
    marginVertical: 10,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
  },
  errorText: {
    color: 'red',
    marginVertical: 10,
    fontWeight: 'bold',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});