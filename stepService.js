import AppleHealthKit from 'react-native-health'; // Assuming react-native-health is linked

// Function to fetch step count from HealthKit
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
          return reject(0); // Return 0 on error
        }

        const steps = result?.value || 0;
        console.log(`Fetched step count: ${steps}`);
        resolve(steps); // Resolve with the fetched step count
      });
    });
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
