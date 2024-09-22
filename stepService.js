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
    const response = await fetch('https://your-api-url.com/upload-steps', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stepCount: steps,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Failed to upload step count. Status: ${response.status}, Response: ${responseText}`);
    }

    console.log(`Step count (${steps}) uploaded successfully`);
  } catch (error) {
    console.error('Error uploading step count:', error);
    throw error;
  }
};