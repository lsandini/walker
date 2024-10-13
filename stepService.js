import AppleHealthKit from 'react-native-health';
import { initialize, requestPermission, readRecords } from 'react-native-health-connect';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let isHealthConnectInitialized = false;

const initializeHealthConnect = async () => {
  if (!isHealthConnectInitialized) {
    try {
      const result = await initialize();
      if (result) {
        console.log('Health Connect initialized successfully');
        isHealthConnectInitialized = true;
      } else {
        console.log('Health Connect is not available on this device');
      }
    } catch (error) {
      console.error('Error initializing Health Connect:', error);
    }
  }
};

export const requestHealthConnectPermissions = async () => {
  await initializeHealthConnect();
  if (!isHealthConnectInitialized) {
    throw new Error('Health Connect is not initialized');
  }

  try {
    await requestPermission([
      { accessType: 'read', recordType: 'Steps' }
    ]);
    console.log("Health Connect permissions granted");
    await AsyncStorage.setItem('healthConnectPermissionsGranted', 'true');
    return true;
  } catch (error) {
    console.error("Health Connect permissions not granted:", error);
    return false;
  }
};

export const fetchStepCountFromHealthKit = async () => {
  try {
    const today = new Date();
    const options = {
      startDate: new Date(today.setHours(0, 0, 0, 0)), // Start of day
      endDate: new Date(), // Current time
    };

    console.log('Fetching step count with options:', options);

    return new Promise((resolve, reject) => {
      AppleHealthKit.getStepCount(options, (err, result) => {
        if (err) {
          console.error('Error fetching step count from HealthKit:', err);
          reject(err);
          return;
        }

        const steps = Math.round(result?.value || 0); // Round to the nearest integer
        console.log(`Fetched step count: ${steps}`);
        resolve(steps);
      });
    });
  } catch (error) {
    console.error('Error fetching step count from HealthKit:', error);
    throw error;
  }
};

export const fetchStepCountFromHealthConnect = async () => {
  await initializeHealthConnect();
  if (!isHealthConnectInitialized) {
    throw new Error('Health Connect is not initialized');
  }

  try {
    const permissionsGranted = await AsyncStorage.getItem('healthConnectPermissionsGranted');
    if (permissionsGranted !== 'true') {
      const granted = await requestHealthConnectPermissions();
      if (!granted) {
        throw new Error('Health Connect permissions not granted');
      }
    }

    const today = new Date();
    const startDate = new Date(today.setHours(0, 0, 0, 0));
    const endDate = new Date();

    const timeRangeFilter = {
      operator: 'between',
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
    };

    console.log('Fetching step count from Health Connect with options:', timeRangeFilter);

    const steps = await readRecords('Steps', { timeRangeFilter });
    const totalSteps = steps.reduce((sum, cur) => sum + cur.count, 0);

    console.log(`Fetched step count from Health Connect: ${totalSteps}`);
    return Math.round(totalSteps); // Round to the nearest integer
  } catch (error) {
    console.error('Error fetching step count from Health Connect:', error);
    throw error;
  }
};

export const uploadStepCountToAPI = async (steps) => {
  try {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    const apiSecret = process.env.EXPO_PUBLIC_API_KEY; // Assuming API_KEY is used as the secret

    if (!apiUrl || !apiSecret) {
      throw new Error('API URL or API Secret is not defined in environment variables');
    }

    console.log(`Uploading step count to API: ${steps} steps`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-secret': apiSecret,
      },
      body: JSON.stringify({
        created_at: new Date().toISOString(),
        'steps-device': steps,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Failed to upload step count. Status: ${response.status}, Response: ${responseText}`);
    }

    const responseData = await response.json();
    console.log(`Step count (${steps}) uploaded successfully. Response:`, responseData);
    return responseData;
  } catch (error) {
    console.error('Error uploading step count:', error);
    throw error;
  }
};

export const fetchStepCount = async () => {
  if (Platform.OS === 'ios') {
    return fetchStepCountFromHealthKit();
  } else if (Platform.OS === 'android') {
    return fetchStepCountFromHealthConnect();
  } else {
    throw new Error('Unsupported platform');
  }
};