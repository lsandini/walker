import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Platform,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import AppleHealthKit from "react-native-health";
import * as Clipboard from "expo-clipboard";
import {
  uploadStepCountToAPI,
  fetchStepCountFromHealthKit,
} from "./stepService";
import BackgroundFetch from "react-native-background-fetch";
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';

// Global error handler
ErrorUtils.setGlobalHandler((error, isFatal) => {
  console.error("Global error:", error, "Is fatal:", isFatal);
});

const BACKGROUND_FETCH_TASK = "com.lsandini.walker.fetch";
const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Error occurred in background task:', error.message);
    return;
  }
  console.log('Background task triggered');
  if (data) {
    const now = new Date().toUTCString();
    console.log(`Received silent push notification at ${now}`, data);
    try {
      await processAndUploadSteps("silent");
    } catch (error) {
      console.error('Error processing silent push notification:', error);
    }
  } else {
    console.log('No data received with the silent push notification');
  }
});

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    
    if (data && data['content-available'] === 1) {
      // This is a silent notification
      console.log('Received silent notification:', data);
      await processAndUploadSteps("silent");
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }
    
    // For regular notifications
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
});

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    console.log("finalStatus", finalStatus);

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const retryStatus = await Notifications.getPermissionsAsync();
      if (retryStatus.status !== "granted") {
        alert("Failed to get push token for push notification!");
        return;
      }
    }

    token = await getPushToken();
    console.log("token", token);
    await setupAndroidNotifications();
  } else {
    alert("Must use a physical device for Push Notifications");
  }

  return token;
}

async function getPushToken() {
  if (Platform.OS === "ios") {
    const tokenIos = await Notifications.getDevicePushTokenAsync();
    return "ExponentPushToken[" + tokenIos.data + "]";
  } else if (Platform.OS === "android") {
    try {
      const tokenAndroid = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig.extra.eas.projectId,
      });
      return tokenAndroid.data;
    } catch (error) {
      console.error(error);
    }
  }
  return null;
}

async function setupAndroidNotifications() {
  await Notifications.setNotificationChannelAsync("cgmsim-channel", {
    name: "cgmsim-channel",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: false,
    sound: "siren.wav", // Provide ONLY the base filename
    lightColor: "#FF231F7C",
  });
  await Notifications.setNotificationChannelAsync("cgmsim-channel-2", {
    name: "cgmsim-channel-2",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: false,
    sound: "siren1.wav", // Specify a different sound file
    lightColor: "#FF231F7C",
  });
}

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

const initBackgroundFetch = async () => {
  try {
    const status = await BackgroundFetch.configure(
      {
        minimumFetchInterval: 15,
        stopOnTerminate: false,
        startOnBoot: true,
      },
      async (taskId) => {
        console.log("[BackgroundFetch] Event received:", taskId);
        await processAndUploadSteps("background");
        BackgroundFetch.finish(taskId);
      },
      (taskId) => {
        console.warn("[BackgroundFetch] TIMEOUT:", taskId);
        BackgroundFetch.finish(taskId);
      }
    );

    console.log("[BackgroundFetch] configure status:", status);
  } catch (error) {
    console.error("[BackgroundFetch] configure ERROR:", error);
  }
};

export default function App() {
  const [notification, setNotification] = useState(false);
  const notificationListener = useRef();
  const responseListener = useRef();
  const [stepCount, setStepCount] = useState(0);
  const [lastFetchTimes, setLastFetchTimes] = useState({
    manual: null,
    background: null,
    silent: null,
  });
  const [deviceToken, setDeviceToken] = useState("");
  const [fetchTriggered, setFetchTriggered] = useState({
    manual: false,
    background: false,
    silent: false,
  });

  const updateState = useCallback((steps, time, triggerType) => {
    setStepCount(steps);
    setLastFetchTimes((prev) => ({ ...prev, [triggerType]: time }));
    setFetchTriggered((prev) => ({ ...prev, [triggerType]: true }));
  }, []);

  useEffect(() => {
    const setupApp = async () => {
      try {
        await initBackgroundFetch();
        await requestPermissions();
        const token = await registerForPushNotificationsAsync();
        console.log("Setting device token:", token);
        setDeviceToken(token);
  
        // Register the background task for silent push notifications
        console.log('Registering background task...');
        await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
        console.log('Background task registered');
  
      } catch (error) {
        console.error("Error in setupApp:", error);
      }
    };
  
    setupApp();

    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log("Received notification:", JSON.stringify(notification, null, 2));
      setNotification(notification);

      const data = notification.request.content.data;
      if (data && data['content-available'] === 1) {
        console.log("Silent notification received");
        processAndUploadSteps("silent").catch(console.error);
      } else {
        console.log("Normal notification received");
      }
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log("Notification response received:", JSON.stringify(response, null, 2));
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
      Notifications.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    };
  }, []);

  useEffect(() => {
    console.log("Device token updated:", deviceToken);
  }, [deviceToken]);

  useEffect(() => {
    updateAppState = updateState;
    return () => {
      updateAppState = null;
    };
  }, [updateState]);

  const requestPermissions = async () => {
    console.log("Requesting HealthKit and Notification permissions");
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
    if (notificationStatus !== "granted") {
      console.log("Notification permission not granted");
      Alert.alert("Notification permission is required for full functionality.");
    } else {
      console.log("Notification permission granted");
    }
  };

  const handleManualFetch = async () => {
    try {
      const steps = await processAndUploadSteps("manual");
      if (steps !== null) {
        Alert.alert("Success", `Fetched and processed ${steps} steps.`);
      } else {
        Alert.alert("Warning", "Failed to fetch or process steps. Please try again.");
      }
    } catch (error) {
      console.error("Error in manual fetch:", error);
      Alert.alert("Error", "An error occurred while fetching and processing steps. Please try again.");
    }
  };

  const formatDate = (date) => {
    if (!date) return "Not fetched yet";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(date);
  };

  const copyToClipboard = async () => {
    if (deviceToken) {
      await Clipboard.setStringAsync(deviceToken);
      Alert.alert("Copied!", "Device token copied to clipboard");
    } else {
      Alert.alert("Error", "No device token available to copy.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.section}>
          <Text style={styles.title}>Step Count: {stepCount}</Text>
          <Text style={styles.subtitle}>
            Last Manual Fetch: {formatDate(lastFetchTimes.manual)}
          </Text>
          <Text style={styles.subtitle}>
            Last Background Fetch: {formatDate(lastFetchTimes.background)}
          </Text>
          <Text style={styles.subtitle}>
            Last Silent Fetch: {formatDate(lastFetchTimes.silent)}
          </Text>
          <TouchableOpacity style={styles.button} onPress={handleManualFetch}>
            <Text style={styles.buttonText}>Fetch Steps Now</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>Device Token:</Text>
          <Text style={styles.token}>{deviceToken || "Not available"}</Text>
          <TouchableOpacity style={styles.button} onPress={copyToClipboard}>
            <Text style={styles.buttonText}>Copy Device Token</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>Fetch Triggered:</Text>
          <Text style={styles.subtitle}>
            Manual: {fetchTriggered.manual ? "Yes" : "No"}
          </Text>
          <Text style={styles.subtitle}>
            Background: {fetchTriggered.background ? "Yes" : "No"}
          </Text>
          <Text style={styles.subtitle}>
            Silent: {fetchTriggered.silent ? "Yes" : "No"}
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
    justifyContent: "center",
    alignItems: "center",
  },
  section: {
    marginBottom: 20,
    width: "100%",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 5,
  },
  button: {
    backgroundColor: "#007BFF",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
  },
  token: {
    fontSize: 16,
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    textAlign: "center",
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