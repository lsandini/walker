import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Button, StyleSheet, ScrollView, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AppleHealthKit from 'react-native-health';
import { uploadStepCountToAPI, fetchStepCountFromHealthKit } from './stepService';

// Global error handler
ErrorUtils.setGlobalHandler((error, isFatal) => {
  console.error('Global error:', error, 'Is fatal:', isFatal);
  // You can add more error reporting logic here
});

const STEP_COUNT_FETCH_TASK = 'STEP_COUNT_FETCH_TASK';
const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

let updateAppState = null;

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

TaskManager.defineTask(STEP_COUNT_FETCH_TASK, async () => {
  try {
    console.log('Background fetch task is running');
    const steps = await processAndUploadSteps('fetch');
    console.log('Background fetch completed. Steps:', steps);
    return steps ? BackgroundFetch.Result.NewData : BackgroundFetch.Result.NoData;
  } catch (error) {
    console.error('Background fetch task failed:', error);
    return BackgroundFetch.Result.Failed;
  }
});

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error, executionInfo }) => {
  console.log('Background notification task executed:', { data, error, executionInfo });
  if (data?.aps?.['content-available'] === 1) {
    console.log('Processing silent push notification');
    try {
      const steps = await processAndUploadSteps('silent');
      console.log('Processed silent notification in background. Steps:', steps);
      return steps ? true : false;
    } catch (error) {
      console.error('Error processing silent push notification:', error);
      return false;
    }
  }
  return false;
});

export default function App() {
  const [stepCount, setStepCount] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [lastSilentPushTime, setLastSilentPushTime] = useState(null);
  const [deviceToken, setDeviceToken] = useState('');
  const [fetchTriggered, setFetchTriggered] = useState(false);
  const [silentPushTriggered, setSilentPushTriggered] = useState(false);

  const updateState = useCallback((steps, time, triggerType) => {
    setStepCount(steps);
    setLastFetchTime(time);
    if (triggerType === 'silent') {
      setLastSilentPushTime(time);
      setSilentPushTriggered(true);
    } else if (triggerType === 'fetch' || triggerType === 'manual') {
      setFetchTriggered(true);
    }
  }, []);

  useEffect(() => {
    updateAppState = updateState;
    return () => {
      updateAppState = null;
    };
  }, [updateState]);

  useEffect(() => {
    console.log('App mounted');
    const setupApp = async () => {
      await requestPermissions();
      await registerBackgroundFetchTask();
      await registerForPushNotificationsAsync();
      await setupBackgroundNotificationHandler();
    };

    setupApp();

    return () => {
      Notifications.removeAllNotificationListeners();
    };
  }, []);

  const requestPermissions = async () => {
    console.log('Requesting HealthKit and Notification permissions');
    const permissions = {
      permissions: {
        read: [AppleHealthKit.Constants.Permissions.Steps],
        write: [],
      },
    };

    AppleHealthKit.initHealthKit(permissions, (err, results) => {
      if (err) {
        console.log("HealthKit permission not granted:", err);
        return;
      }
      console.log("HealthKit permission granted:", results);
    });

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
    setDeviceToken(token);
    console.log('APNS device token:', token);

    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const payload = JSON.stringify(notification, null, 2);
        console.log('Notification received (handler):', payload);

        if (notification.request.content.data?.aps?.['content-available'] === 1) {
          console.log('Silent notification received');
          try {
            await processAndUploadSteps('silent');
          } catch (error) {
            console.error('Error processing silent notification:', error);
          }
          return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
        }

        return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true };
      },
    });

    const foregroundSubscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received (foreground):', JSON.stringify(notification, null, 2));
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification response received:', JSON.stringify(response, null, 2));
    });

    return () => {
      foregroundSubscription.remove();
      responseSubscription.remove();
    };
  };

  const setupBackgroundNotificationHandler = async () => {
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    console.log('Background notification task registered');
  };

  const registerBackgroundFetchTask = async () => {
    try {
      console.log('Registering background fetch task');
      console.log('BackgroundFetch object:', BackgroundFetch);
      console.log('BackgroundFetch.Status:', BackgroundFetch.Status);

      const status = await BackgroundFetch.getStatusAsync();
      console.log('Background fetch status:', status);

      // Check if status is Available (3) or if BackgroundFetch.Status.Available is defined
      if (status === 3 || (BackgroundFetch.Status && status === BackgroundFetch.Status.Available)) {
        await BackgroundFetch.registerTaskAsync(STEP_COUNT_FETCH_TASK, {
          minimumInterval: 15 * 60, // 15 minutes
          stopOnTerminate: false,
          startOnBoot: true,
        });

        // For testing purposes, set a shorter interval (remove before production)
        // await BackgroundFetch.setMinimumIntervalAsync(1);

        const tasks = await TaskManager.getRegisteredTasksAsync();
        console.log('Registered tasks:', tasks);
      } else {
        console.log('Background fetch is not available on this device. Status:', status);
      }
    } catch (error) {
      console.error('Error registering background fetch task:', error);
      console.error('Error details:', error.message, error.stack);
    }
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>HealthKit Step Tracker</Text>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Last Step Count:</Text>
        <Text style={styles.data}>{stepCount}</Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Last Background Fetch Time:</Text>
        <Text style={styles.data}>{formatDate(lastFetchTime)}</Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Last Silent Push Notification Time:</Text>
        <Text style={styles.data}>{formatDate(lastSilentPushTime)}</Text>
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

      <Button title="Manually Fetch Steps" onPress={handleManualFetch} />
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