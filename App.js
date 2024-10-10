import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, SafeAreaView } from 'react-native';
import * as Notifications from 'expo-notifications';
import AppleHealthKit from 'react-native-health';
import * as Clipboard from 'expo-clipboard';
import { uploadStepCountToAPI, fetchStepCountFromHealthKit } from './stepService';
import BackgroundFetch from "react-native-background-fetch";
import * as TaskManager from 'expo-task-manager';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    console.log(`[${new Date().toISOString()}] Raw notification received:`, JSON.stringify(notification, null, 2));
    if (isSilentNotification(notification)) {
      console.log(`[${new Date().toISOString()}] Silent notification detected in handler`);
      try {
        const steps = await processAndUploadSteps('silent');
        console.log(`[${new Date().toISOString()}] Silent notification processed in handler. Steps: ${steps}`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error processing silent notification in handler:`, error);
      }
      return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
    }
    return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true };
  },
});

// Global error handler
ErrorUtils.setGlobalHandler((error, isFatal) => {
  console.error('Global error:', error, 'Is fatal:', isFatal);
});

const BACKGROUND_FETCH_TASK = 'com.lsandini.walker.fetch';
const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

let updateAppState = null;

// Function to process steps and upload to API
const processAndUploadSteps = async (triggerType) => {
  console.log(`[${new Date().toISOString()}] Processing step count from trigger: ${triggerType}`);
  try {
    const stepCountData = await fetchStepCountFromHealthKit();
    const steps = stepCountData || 0;
    console.log(`[${new Date().toISOString()}] Fetched step count: ${steps}`);
    await uploadStepCountToAPI(steps);

    if (updateAppState) {
      updateAppState(steps, new Date(), triggerType);
    }

    console.log(`[${new Date().toISOString()}] ${triggerType} process completed successfully`);
    return steps;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error processing steps from ${triggerType}:`, error);
    return null;
  }
};

// Setup background fetch
const initBackgroundFetch = async () => {
  try {
    const status = await BackgroundFetch.configure({
      minimumFetchInterval: 15,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
    }, async (taskId) => {
      console.log(`[${new Date().toISOString()}] [BackgroundFetch] Event received:`, taskId);
      await processAndUploadSteps('background');
      BackgroundFetch.finish(taskId);
    }, (taskId) => {
      console.warn(`[${new Date().toISOString()}] [BackgroundFetch] TIMEOUT:`, taskId);
      BackgroundFetch.finish(taskId);
    });

    console.log(`[${new Date().toISOString()}] [BackgroundFetch] configure status:`, status);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [BackgroundFetch] configure ERROR:`, error);
  }
};

// Register the headless task for BackgroundFetch
BackgroundFetch.registerHeadlessTask(async ({ taskId }) => {
  console.log(`[${new Date().toISOString()}] [BackgroundFetch] Headless event received:`, taskId);
  if (taskId === BACKGROUND_FETCH_TASK) {
    await processAndUploadSteps('background');
  }
  BackgroundFetch.finish(taskId);
});

// Helper function to check if a notification is silent
const isSilentNotification = (notification) => {
  return notification?.request?.content?.data?.aps?.['content-available'] === 1;
};

// Define the background task for handling notifications
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error, executionInfo }) => {
  console.log(`[${new Date().toISOString()}] Background notification task executed:`, JSON.stringify({ data, error, executionInfo }, null, 2));
  if (error) {
    console.error(`[${new Date().toISOString()}] Background notification task failed:`, error);
    return;
  }
  
  if (isSilentNotification(data.notification)) {
    console.log(`[${new Date().toISOString()}] Silent notification received in background task`);
    try {
      const steps = await processAndUploadSteps('silent');
      console.log(`[${new Date().toISOString()}] Background silent notification processed. Steps: ${steps}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error processing background silent notification:`, error);
    }
  } else {
    console.log(`[${new Date().toISOString()}] Non-silent notification received in background task`);
  }
});

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
  const [notification, setNotification] = useState(null);
  const notificationListener = useRef();
  const responseListener = useRef();

  const updateState = useCallback((steps, time, triggerType) => {
    setStepCount(steps);
    setLastFetchTimes((prev) => ({ ...prev, [triggerType]: time }));
    setFetchTriggered((prev) => ({ ...prev, [triggerType]: true }));
  }, []);

  useEffect(() => {
    const setupApp = async () => {
      await initBackgroundFetch();
      await requestPermissions();
      await registerForPushNotificationsAsync();
      await setupNotificationHandlers();
    };
    setupApp();

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  useEffect(() => {
    updateAppState = updateState;
    return () => {
      updateAppState = null;
    };
  }, [updateState]);

  const requestPermissions = async () => {
    console.log(`[${new Date().toISOString()}] Requesting HealthKit and Notification permissions`);
    const permissions = {
      permissions: {
        read: [AppleHealthKit.Constants.Permissions.Steps],
        write: [],
      },
    };

    AppleHealthKit.initHealthKit(permissions, (err) => {
      if (err) {
        console.log(`[${new Date().toISOString()}] HealthKit permission not granted:`, err);
        return;
      }
      console.log(`[${new Date().toISOString()}] HealthKit permission granted`);
    });

    const { status: notificationStatus } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowAnnouncements: true,
      },
    });
    if (notificationStatus !== 'granted') {
      console.log(`[${new Date().toISOString()}] Notification permission not granted`);
      Alert.alert('Notification permission is required for full functionality.');
    } else {
      console.log(`[${new Date().toISOString()}] Notification permission granted`);
    }
  };

  const registerForPushNotificationsAsync = async () => {
    console.log(`[${new Date().toISOString()}] Registering for push notifications`);

    try {
      const { data: token } = await Notifications.getExpoPushTokenAsync();
      console.log(`[${new Date().toISOString()}] Expo push token:`, token);
      
      const { data: devicePushToken } = await Notifications.getDevicePushTokenAsync();
      if (devicePushToken) {
        setDeviceToken(devicePushToken);
        console.log(`[${new Date().toISOString()}] APNS device token:`, devicePushToken);
      } else {
        console.log(`[${new Date().toISOString()}] Failed to get device token - token is null`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error getting device token:`, error);
    }
  };

  const setupNotificationHandlers = async () => {
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log(`[${new Date().toISOString()}] Notification received in listener:`, JSON.stringify(notification, null, 2));
      setNotification(notification);
      
      if (isSilentNotification(notification)) {
        console.log(`[${new Date().toISOString()}] Silent notification received in listener`);
        processAndUploadSteps('silent').catch(console.error);
      }
    });
  
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log(`[${new Date().toISOString()}] Notification response received:`, JSON.stringify(response, null, 2));
    });
  
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    console.log(`[${new Date().toISOString()}] Background notification task registered`);
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

  // Render function
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

        <View style={styles.section}>
          <Text style={styles.title}>Last Notification:</Text>
          <Text style={styles.subtitle}>
            {notification ? JSON.stringify(notification.request.content, null, 2) : 'No notification received'}
          </Text>
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