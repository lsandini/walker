import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, ScrollView } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AppleHealthKit from 'react-native-health';
import { uploadStepCountToAPI, fetchStepCountFromHealthKit } from './stepService';

const STEP_COUNT_FETCH_TASK = 'STEP_COUNT_FETCH_TASK';

// Move processAndUploadSteps outside the component for proper access in background task
const processAndUploadSteps = async (triggerType) => {
  console.log(`Processing step count from trigger: ${triggerType}`);
  try {
    const stepCountData = await fetchStepCountFromHealthKit();
    const steps = stepCountData || 0;
    console.log(`Fetched step count: ${steps}`);
    await uploadStepCountToAPI(steps); // Always upload the step count

    if (triggerType === 'fetch') {
      console.log('Background fetch processed');
    } else if (triggerType === 'silent') {
      console.log('Silent push processed');
    }
  } catch (error) {
    console.error(`Error processing steps from ${triggerType}:`, error);
  }
};

// Define background task outside the component
TaskManager.defineTask(STEP_COUNT_FETCH_TASK, async () => {
  try {
    console.log('Background fetch task is running');
    await processAndUploadSteps('fetch');
    return BackgroundFetch.Result.NewData;
  } catch (error) {
    console.error('Background fetch task failed:', error);
    return BackgroundFetch.Result.Failed;
  }
});

export default function App() {
  const [stepCount, setStepCount] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [lastSilentPushTime, setLastSilentPushTime] = useState(null);
  const [deviceToken, setDeviceToken] = useState('');
  const [fetchTriggered, setFetchTriggered] = useState(false);
  const [silentPushTriggered, setSilentPushTriggered] = useState(false);

  useEffect(() => {
    console.log('App mounted');
    requestPermissions();
    registerBackgroundFetchTask();
    registerForPushNotificationsAsync();
  }, []);

  const requestPermissions = async () => {
    console.log('Requesting HealthKit and Notification permissions');
    const permissions = {
      permissions: {
        read: [AppleHealthKit.Constants.Permissions.Steps],
        write: [],
      },
    };

    // Request HealthKit permissions
    AppleHealthKit.initHealthKit(permissions, (err, results) => {
      if (err) {
        console.log("HealthKit permission not granted:", err);
        return;
      }
      console.log("HealthKit permission granted:", results);
    });

    // Request Notification permissions
    const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
    if (notificationStatus !== 'granted') {
      console.log('Notification permission not granted');
    } else {
      console.log('Notification permission granted');
    }
  };

  const registerForPushNotificationsAsync = async () => {
    console.log('Registering for push notifications');
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    setDeviceToken(token); // Store the device token for display
    console.log('APNS device token:', token);
  
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const payload = JSON.stringify(notification, null, 2);
        console.log('Notification received:', payload);
        return { shouldShowAlert: true };
      },
    });
  
    Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received (foreground):', JSON.stringify(notification, null, 2));
    });
  
    Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification response received:', JSON.stringify(response, null, 2));
    });
  };

  const registerBackgroundFetchTask = async () => {
    try {
      console.log('Registering background fetch task');
      const status = await BackgroundFetch.getStatusAsync();
      console.log('Background fetch status:', status);

      await BackgroundFetch.registerTaskAsync(STEP_COUNT_FETCH_TASK, {
        minimumInterval: 15 * 60, // 15 minutes
        stopOnTerminate: false,
        startOnBoot: true,
      });

      const tasks = await TaskManager.getRegisteredTasksAsync();
      console.log('Registered tasks:', tasks);
    } catch (error) {
      console.error('Error registering background fetch task:', error);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>HealthKit Step Tracker</Text>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Last Step Count:</Text>
        <Text style={styles.data}>{stepCount}</Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Last Background Fetch Time:</Text>
        <Text style={styles.data}>{lastFetchTime ? lastFetchTime.toLocaleTimeString() : 'Not fetched yet'}</Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Last Silent Push Notification Time:</Text>
        <Text style={styles.data}>{lastSilentPushTime ? lastSilentPushTime.toLocaleTimeString() : 'Not received yet'}</Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Device Token:</Text>
        <Text style={styles.data}>{deviceToken || 'Not available'}</Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Background Fetch Triggered:</Text>
        <Text style={styles.data}>{fetchTriggered ? 'Yes' : 'No'}</Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Silent Push Triggered:</Text>
        <Text style={styles.data}>{silentPushTriggered ? 'Yes' : 'No'}</Text>
      </View>

      <Button title="Manually Fetch Steps" onPress={() => processAndUploadSteps('manual')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f2f2f2',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  infoBox: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  data: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 5,
  },
});
