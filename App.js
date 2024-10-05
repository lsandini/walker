import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, SafeAreaView } from 'react-native';
import * as Notifications from 'expo-notifications';
import AppleHealthKit from 'react-native-health';
import * as Clipboard from 'expo-clipboard';
import { uploadStepCountToAPI, fetchStepCountFromHealthKit } from './stepService';
import BackgroundFetch from "react-native-background-fetch";

// Global error handler
ErrorUtils.setGlobalHandler((error, isFatal) => {
  console.error('Global error:', error, 'Is fatal:', isFatal);
});

const BACKGROUND_FETCH_TASK = 'com.lsandini.walker.fetch';

let updateAppState = null;

// Function to process steps and upload to API
const processAndUploadSteps = async (triggerType) => {
  console.log(`Processing step count from trigger: ${triggerType}`);
  try {
    const stepCountData = await fetchStepCountFromHealthKit();
    const steps = stepCountData || 0;
    console.log(`Fetched step count: ${steps}`);
    await uploadStepCountToAPI(steps);

    if (updateAppState) {
      updateAppState(steps, new Date(), triggerType);
    }

    console.log(`${triggerType} process completed successfully`);
    return steps;
  } catch (error) {
    console.error(`Error processing steps from ${triggerType}:`, error);
    return null;
  }
};

// Setup background fetch
const initBackgroundFetch = async () => {
  try {
    // Configure the background fetch
    const status = await BackgroundFetch.configure({
      minimumFetchInterval: 15, // Fetch interval in minutes
      stopOnTerminate: false,
      startOnBoot: true
    }, async (taskId) => {
      console.log('[BackgroundFetch] Event received:', taskId);
      await processAndUploadSteps('background');
      BackgroundFetch.finish(taskId);
    }, (taskId) => {
      console.warn('[BackgroundFetch] TIMEOUT:', taskId);
      BackgroundFetch.finish(taskId);
    });

    console.log('[BackgroundFetch] configure status:', status);

  } catch (error) {
    console.error('[BackgroundFetch] configure ERROR:', error);
  }
};

export default function App() {
  const [stepCount, setStepCount] = useState(0);
  const [lastFetchTimes, setLastFetchTimes] = useState({
    manual: null,
    background: null,
    silent: null,
  });
  const [deviceToken, setDeviceToken] = useState('');
  const [fetchTriggered, setFetchTriggered] = useState({
    manual: false,
    background: false,
    silent: false,
  });

  // Function to update the app state
  const updateState = useCallback((steps, time, triggerType) => {
    setStepCount(steps);
    setLastFetchTimes((prev) => ({ ...prev, [triggerType]: time }));
    setFetchTriggered((prev) => ({ ...prev, [triggerType]: true }));
  }, []);

  // Setup background fetch and notifications
  useEffect(() => {
    const setupApp = async () => {
      await initBackgroundFetch();
      await requestPermissions();
      await registerForPushNotificationsAsync();
    };
    setupApp();
  }, []);

  // Handle background task updates
  useEffect(() => {
    updateAppState = updateState;
    return () => {
      updateAppState = null;
    };
  }, [updateState]);

  // Request permissions for HealthKit and notifications
  const requestPermissions = async () => {
    console.log('Requesting HealthKit and Notification permissions');
    const permissions = {
      permissions: {
        read: [AppleHealthKit.Constants.Permissions.Steps],
        write: [],
      },
    };

    AppleHealthKit.initHealthKit(permissions, (err) => {
      if (err) {
        console.log("HealthKit permission not granted:", err);
        return;
      }
      console.log("HealthKit permission granted");
    });

    const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
    if (notificationStatus !== 'granted') {
      console.log('Notification permission not granted');
      Alert.alert('Notification permission is required for full functionality.');
    } else {
      console.log('Notification permission granted');
    }
  };

  // Register for push notifications
  const registerForPushNotificationsAsync = async () => {
    console.log('Registering for push notifications');

    try {
      const { data: token } = await Notifications.getDevicePushTokenAsync();
      if (token) {
        setDeviceToken(token);
        console.log('APNS device token:', token);
      } else {
        console.log('Failed to get device token - token is null');
      }
    } catch (error) {
      console.error('Error getting device token:', error);
    }

    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        console.log('Handling notification:', JSON.stringify(notification, null, 2));
        if (notification.request.content.data?.aps?.['content-available'] === 1) {
          console.log('Silent notification received');
          await processAndUploadSteps('silent');
          return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
        }
        return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true };
      },
    });
  };

  const handleManualFetch = async () => {
    try {
      const steps = await processAndUploadSteps('manual');
      if (steps !== null) {
        Alert.alert('Success', `Fetched and processed ${steps} steps.`);
      } else {
        Alert.alert('Warning', 'Failed to fetch or process steps. Please try again.');
      }
    } catch (error) {
      console.error('Error in manual fetch:', error);
      Alert.alert('Error', 'An error occurred while fetching and processing steps. Please try again.');
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Not fetched yet';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(date);
  };

  const copyToClipboard = async () => {
    if (deviceToken) {
      await Clipboard.setStringAsync(deviceToken);
      Alert.alert('Copied!', 'Device token copied to clipboard');
    } else {
      Alert.alert('Error', 'No device token available to copy.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.section}>
          <Text style={styles.title}>Step Count: {stepCount}</Text>
          <Text style={styles.subtitle}>Last Manual Fetch: {formatDate(lastFetchTimes.manual)}</Text>
          <Text style={styles.subtitle}>Last Background Fetch: {formatDate(lastFetchTimes.background)}</Text>
          <Text style={styles.subtitle}>Last Silent Fetch: {formatDate(lastFetchTimes.silent)}</Text>
          <TouchableOpacity style={styles.button} onPress={handleManualFetch}>
            <Text style={styles.buttonText}>Fetch Steps Now</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>Device Token:</Text>
          <Text style={styles.token}>{deviceToken || 'Not available'}</Text>
          <TouchableOpacity style={styles.button} onPress={copyToClipboard}>
            <Text style={styles.buttonText}>Copy Device Token</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>Fetch Triggered:</Text>
          <Text style={styles.subtitle}>Manual: {fetchTriggered.manual ? 'Yes' : 'No'}</Text>
          <Text style={styles.subtitle}>Background: {fetchTriggered.background ? 'Yes' : 'No'}</Text>
          <Text style={styles.subtitle}>Silent: {fetchTriggered.silent ? 'Yes' : 'No'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: 20,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 5,
  },
  button: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  token: {
    fontSize: 16,
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    textAlign: 'center',
  },
});

// Make sure to add this somewhere in your app's startup code, outside of the App component
BackgroundFetch.registerHeadlessTask(async ({ taskId }) => {
  console.log('[BackgroundFetch] Headless event received:', taskId);
  if (taskId === BACKGROUND_FETCH_TASK) {
    await processAndUploadSteps('background');
  }
  BackgroundFetch.finish(taskId);
});