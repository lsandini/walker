import React, { useState, useEffect } from 'react';
import { View, Text, Button } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import HealthKit from 'react-native-health'; // Assuming react-native-health is linked
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
    const healthKitGranted = await HealthKit.requestAuthorization(['StepCount'], ['StepCount']);
    if (healthKitGranted) {
      console.log('HealthKit permission granted');
    }

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
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Last Step Count: {stepCount}</Text>
      <Text>Last Background Fetch Time: {lastFetchTime ? lastFetchTime.toLocaleTimeString() : 'Not fetched yet'}</Text>
      <Text>Last Silent Push Notification Time: {lastSilentPushTime ? lastSilentPushTime.toLocaleTimeString() : 'Not received yet'}</Text>
      <Text>Device Token: {deviceToken || 'Not available'}</Text>
      <Text>Background Fetch Triggered: {fetchTriggered ? 'Yes' : 'No'}</Text>
      <Text>Silent Push Triggered: {silentPushTriggered ? 'Yes' : 'No'}</Text>
      <Button title="Manually Fetch Steps" onPress={() => processAndUploadSteps('manual')} />
    </View>
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
