import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Button, StyleSheet, ScrollView, Alert, TouchableOpacity, SafeAreaView } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AppleHealthKit from 'react-native-health';
import * as Clipboard from 'expo-clipboard';
import { uploadStepCountToAPI, fetchStepCountFromHealthKit } from './stepService';

// Global error handler
ErrorUtils.setGlobalHandler((error, isFatal) => {
  console.error('Global error:', error, 'Is fatal:', isFatal);
  // You can add more error reporting logic here
});

const STEP_COUNT_FETCH_TASK = 'com.lsandini.walker.fetch';
const BACKGROUND_NOTIFICATION_TASK = 'com.lsandini.walker.notification';

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
    const steps = await processAndUploadSteps('background');
    console.log('Background fetch completed. Steps:', steps);
    
    return steps ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error('Background fetch task failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
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
  const [lastManualFetchTime, setLastManualFetchTime] = useState(null);
  const [lastBackgroundFetchTime, setLastBackgroundFetchTime] = useState(null);
  const [lastSilentPushTime, setLastSilentPushTime] = useState(null);
  const [deviceToken, setDeviceToken] = useState('');
  const [manualFetchTriggered, setManualFetchTriggered] = useState(false);
  const [backgroundFetchTriggered, setBackgroundFetchTriggered] = useState(false);
  const [silentPushTriggered, setSilentPushTriggered] = useState(false);
  const [backgroundFetchStatus, setBackgroundFetchStatus] = useState('Unknown');

  const updateState = useCallback((steps, time, triggerType) => {
    setStepCount(steps);
    
    switch (triggerType) {
      case 'manual':
        setLastManualFetchTime(time);
        setManualFetchTriggered(true);
        break;
      case 'background':
        setLastBackgroundFetchTime(time);
        setBackgroundFetchTriggered(true);
        break;
      case 'silent':
        setLastSilentPushTime(time);
        setSilentPushTriggered(true);
        break;
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
    let subscriptions = [];
    const setupApp = async () => {
      await requestPermissions();
      await checkAndUpdateBackgroundFetchStatus();
      subscriptions = await registerForPushNotificationsAsync();
      await setupBackgroundNotificationHandler();
    };

    setupApp();

    return () => {
      subscriptions.forEach(subscription => subscription.remove());
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

    return [foregroundSubscription, responseSubscription];
  };

  const setupBackgroundNotificationHandler = async () => {
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    console.log('Background notification task registered');
  };

  const checkAndUpdateBackgroundFetchStatus = async () => {
    try {
      console.log('Checking background fetch task status');
      const status = await BackgroundFetch.getStatusAsync();
      console.log('Background fetch status:', status);
  
      const isRegistered = await TaskManager.isTaskRegisteredAsync(STEP_COUNT_FETCH_TASK);
      console.log('Is background fetch task registered:', isRegistered);
  
      switch (status) {
        case BackgroundFetch.BackgroundFetchStatus.Restricted:
          setBackgroundFetchStatus('Restricted');
          break;
        case BackgroundFetch.BackgroundFetchStatus.Denied:
          setBackgroundFetchStatus('Denied');
          break;
        case BackgroundFetch.BackgroundFetchStatus.Available:
          setBackgroundFetchStatus(isRegistered ? 'Available and Registered' : 'Available but Not Registered');
          break;
        default:
          setBackgroundFetchStatus(`Unknown (${status})`);
      }
    } catch (error) {
      console.error('Error checking background fetch task:', error);
      setBackgroundFetchStatus('Error');
    }
  };

  const registerBackgroundFetchTask = async () => {
    try {
      console.log('Registering background fetch task');
      await BackgroundFetch.registerTaskAsync(STEP_COUNT_FETCH_TASK, {
        minimumInterval: 15 * 60, // 15 minutes
        stopOnTerminate: false,
        startOnBoot: true,
      });

      await checkAndUpdateBackgroundFetchStatus();
      console.log('Background fetch task registered successfully');
    } catch (error) {
      console.error('Error registering background fetch task:', error);
      setBackgroundFetchStatus('Registration Failed');
    }
  };

  const unregisterBackgroundFetchTask = async () => {
    try {
      console.log('Unregistering background fetch task');
      const isRegistered = await TaskManager.isTaskRegisteredAsync(STEP_COUNT_FETCH_TASK);
      if (isRegistered) {
        await BackgroundFetch.unregisterTaskAsync(STEP_COUNT_FETCH_TASK);
        console.log('Background fetch task unregistered');
      } else {
        console.log('Background fetch task was not registered');
      }
      await checkAndUpdateBackgroundFetchStatus();
    } catch (error) {
      console.error('Error unregistering background fetch task:', error);
      setBackgroundFetchStatus('Unregistration Failed');
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

  const copyToClipboard = async () => {
    if (deviceToken) {
      await Clipboard.setStringAsync(deviceToken);
      Alert.alert('Copied!', 'Device token copied to clipboard');
    } else {
      Alert.alert('Error', 'No device token available to copy');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollView}>
        <Text style={styles.title}>HealthKit Step Tracker</Text>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Last Step Count:</Text>
          <Text style={styles.data}>{stepCount}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Last Manual Fetch Time:</Text>
          <Text style={styles.data}>{formatDate(lastManualFetchTime)}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Last Background Fetch Time:</Text>
          <Text style={styles.data}>{formatDate(lastBackgroundFetchTime)}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Last Silent Push Time:</Text>
          <Text style={styles.data}>{formatDate(lastSilentPushTime)}</Text>
        </View>

        <View style={styles.infoBoxToken}>
          <Text style={styles.labelToken}>Device Token:</Text>
          <Text style={styles.dataToken} numberOfLines={1} ellipsizeMode="middle">
            {deviceToken || 'Not available'}
          </Text>
          <TouchableOpacity onPress={copyToClipboard} style={styles.copyButton}>
            <Text style={styles.copyButtonText}>Copy</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Manual Fetch Triggered:</Text>
          <Text style={styles.data}>{manualFetchTriggered ? 'Yes' : 'No'}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Background Fetch Triggered:</Text>
          <Text style={styles.data}>{backgroundFetchTriggered ? 'Yes' : 'No'}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Silent Push Triggered:</Text>
          <Text style={styles.data}>{silentPushTriggered ? 'Yes' : 'No'}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Background Fetch Status:</Text>
          <Text style={styles.data}>{backgroundFetchStatus}</Text>
        </View>

        <View style={styles.buttonContainer}>
          <Button title="Manually Fetch Steps" onPress={handleManualFetch} />
          <Button title="Check Background Fetch Status" onPress={checkAndUpdateBackgroundFetchStatus} />
          <Button title="Unregister Background Fetch Task" onPress={unregisterBackgroundFetchTask} />
          <Button title="Register Background Fetch Task" onPress={registerBackgroundFetchTask} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f2f2f2',
  },
  scrollView: {
    flexGrow: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
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
  infoBoxToken: {
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  data: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  labelToken: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  dataToken: {
    fontSize: 14,
    color: '#000',
    flex: 2,
    marginHorizontal: 10,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 5,
    borderRadius: 5,
  },
  copyButtonText: {
    color: 'white',
    fontSize: 12,
  },
  buttonContainer: {
    marginTop: 20,
  },
});