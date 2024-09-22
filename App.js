import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, ScrollView } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AppleHealthKit from 'react-native-health';
import { uploadStepCountToAPI, fetchStepCountFromHealthKit } from './stepService';

const STEP_COUNT_FETCH_TASK = 'STEP_COUNT_FETCH_TASK';

export default function App() {
  const [stepCount, setStepCount] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [lastSilentPushTime, setLastSilentPushTime] = useState(null);
  const [deviceToken, setDeviceToken] = useState('');
  const [fetchTriggered, setFetchTriggered] = useState(false);
  const [silentPushTriggered, setSilentPushTriggered] = useState(false);

  useEffect(() => {
    requestPermissions();
    registerBackgroundFetchTask();
    registerForPushNotificationsAsync();
  }, []);

  const requestPermissions = async () => {
    const permissions = {
      permissions: {
        read: [
          AppleHealthKit.Constants.Permissions.Steps, // Correct permission for step count
        ],
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
    }
  };

  const registerForPushNotificationsAsync = async () => {
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    setDeviceToken(token); // Store the device token for display
    console.log('APNS device token:', token);

    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const isSilent = notification.request.content.data.silent;
        if (isSilent) {
          console.log('Silent push received');
          setSilentPushTriggered(true);
          await processAndUploadSteps('silent');
          return { shouldShowAlert: false };
        }
        return { shouldShowAlert: true };
      },
    });
  };

  const registerBackgroundFetchTask = async () => {
    await BackgroundFetch.registerTaskAsync(STEP_COUNT_FETCH_TASK, {
      minimumInterval: 15 * 60, // 15 minutes
      stopOnTerminate: false,
      startOnBoot: true,
    });
  };

  const processAndUploadSteps = async (triggerType) => {
    const stepCountData = await fetchStepCountFromHealthKit();
    const steps = stepCountData || 0;
    setStepCount(steps); // Update state to display in UI
    await uploadStepCountToAPI(steps); // Always upload the step count

    if (triggerType === 'fetch') {
      setLastFetchTime(new Date());
    } else if (triggerType === 'silent') {
      setLastSilentPushTime(new Date());
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

// Task Manager for background fetch
TaskManager.defineTask(STEP_COUNT_FETCH_TASK, async () => {
  try {
    console.log('Background fetch task running');
    await processAndUploadSteps('fetch'); // Mark fetch type as 'fetch'
    return BackgroundFetch.Result.NewData;
  } catch (error) {
    console.error('Background fetch task failed:', error);
    return BackgroundFetch.Result.Failed;
  }
});

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
