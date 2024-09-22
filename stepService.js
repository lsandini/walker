import AppleHealthKit from 'react-native-health';

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

        const steps = result?.value || 0;
        console.log(`Fetched step count: ${steps}`);
        resolve(steps);
      });
    });
  } catch (error) {
    console.error('Error fetching step count from HealthKit:', error);
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