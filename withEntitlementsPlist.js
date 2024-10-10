const {
  withEntitlementsPlist,
  withInfoPlist,
} = require('@expo/config-plugins');

const HEALTH_SHARE = 'Read and understand health data.';
const HEALTH_UPDATE = 'Share workout data with other apps.';

// Function to change the cgmsimapp.entitlements
const changeEntitlements = (entitlements) => {
  console.log('Modifying walker.entitlements...');

  // Define the new entitlements
  const newEntitlements = {
    'aps-environment': 'development',
    'com.apple.developer.healthkit': true,
    'com.apple.developer.healthkit.background-delivery': true,
  };

  // Merge the new entitlements with the existing ones
  const finalEntitlements = { ...entitlements, ...newEntitlements };

  console.log('walker.entitlements modified successfully.');

  return finalEntitlements;
};

const withHealthKit = (
  config,
  {
    healthSharePermission,
    healthUpdatePermission
  } = {}
) => {
  // Add permissions and UIBackgroundModes
  config = withInfoPlist(config, (config) => {
    // HealthKit permissions
    config.modResults.NSHealthShareUsageDescription =
      healthSharePermission ||
      config.modResults.NSHealthShareUsageDescription ||
      HEALTH_SHARE;
    config.modResults.NSHealthUpdateUsageDescription =
      healthUpdatePermission ||
      config.modResults.NSHealthUpdateUsageDescription ||
      HEALTH_UPDATE;

    // Add UIBackgroundModes for HealthKit and background fetch
    const requiredModes = ['fetch', 'remote-notification', 'processing'];
    const backgroundModes = new Set(config.modResults.UIBackgroundModes || []);
    
    requiredModes.forEach(mode => backgroundModes.add(mode));
    
    config.modResults.UIBackgroundModes = Array.from(backgroundModes);

    console.log('Info.plist modified successfully.');
    console.log('UIBackgroundModes:', config.modResults.UIBackgroundModes);

    return config;
  });

  return config;
};

// Config plugin
module.exports = (config) => {
  // Modify entitlements
  config = withEntitlementsPlist(config, (config) => {
    console.log('Running withEntitlementsPlist...');
    config.modResults = changeEntitlements(config.modResults);
    return config;
  });

  // Modify Info.plist with health kit permissions
  config = withHealthKit(config, {});

  return config;
};