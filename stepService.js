import HealthKit from 'react-native-health';

// Function to fetch step count from HealthKit
export const fetchStepCountFromHealthKit = async () => {
  try {
    const today = new Date();
    const options = {
      startDate: new Date(today.setHours(0, 0, 0, 0)), // Start of day
      endDate: new Date(), // Current time
    };

    const stepCountData = await HealthKit.getStepCount(options);
    const steps = stepCountData?.value || 0;
    console.log(`Fetched step count: ${steps}`);
    return steps;
  } catch (error) {
    console.error('Error fetching step count from HealthKit:', error);
    return 0; // Return 0 if there's an error
  }
};

// Function to upload step count to the API
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
      throw new Error('Failed to upload step count');
    }

    console.log(`Step count (${steps}) uploaded successfully`);
  } catch (error) {
    console.error('Error uploading step count:', error);
  }
};
