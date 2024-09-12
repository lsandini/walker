const {
    withEntitlementsPlist,
    withInfoPlist,
  } = require('@expo/config-plugins');
  
  const HEALTH_SHARE = 'Read and understand health data.';
  const HEALTH_UPDATE = 'Share workout data with other apps.';
  const HEALTH_CLINIC_SHARE = 'Read and understand clinical health data.';
  
  // Function to change the cgmsimapp.entitlements
  const changeEntitlements = (entitlements) => {
    console.log('Modifying cgmsimapp.entitlements...');
  
    // Define the new entitlements
    const newEntitlements = {
      'aps-environment': 'development',
      'com.apple.developer.associated-domains': ['applinks:cgmsim.com/app'],
      'com.apple.developer.healthkit': true,
      'com.apple.developer.healthkit.access': ['health-records'],
      'com.apple.developer.healthkit.background-delivery': true,
    };
  
    // Merge the new entitlements with the existing ones
    const finalEntitlements = { ...entitlements, ...newEntitlements };
  
    console.log('cgmsimapp.entitlements modified successfully.');
  
    return finalEntitlements;
  };
  
  const withHealthKit = (
    config,
    {
      healthSharePermission,
      healthUpdatePermission,
      isClinicalDataEnabled,
      healthClinicalDescription,
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
      config.modResults.NSHealthClinicalHealthRecordsShareUsageDescription =
        healthClinicalDescription ||
        config.modResults.NSHealthClinicalHealthRecordsShareUsageDescription ||
        HEALTH_CLINIC_SHARE;
  
      // Add UIBackgroundModes for HealthKit and background fetch
      const backgroundModes = config.modResults.UIBackgroundModes || [];
      if (!backgroundModes.includes('fetch')) {
        backgroundModes.push('fetch');
      }
      if (!backgroundModes.includes('remote-notifications')) {
        backgroundModes.push('remote-notifications');
      }
      if (!backgroundModes.includes('processing')) {
        backgroundModes.push('processing');
      }
      config.modResults.UIBackgroundModes = backgroundModes;
  
      console.log('Info.plist modified successfully.');
  
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