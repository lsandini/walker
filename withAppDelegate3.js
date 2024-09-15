const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function modifyAppDelegateContent(content) {
  // Replace the entire content with the desired structure
  return `#import "AppDelegate.h"
#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <HealthKit/HealthKit.h>
#import <UIKit/UIKit.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"main";

  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};
  
  // Request HealthKit authorization
  [self requestHealthKitAuthorization];
  
  // Set minimum background fetch interval (default string)
  //[application setMinimumBackgroundFetchInterval:UIApplicationBackgroundFetchIntervalMinimum];

  // Set minimum background fetch interval (you decide)
  [application setMinimumBackgroundFetchInterval:15 * 60]; // 15 minutes

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

// Linking API
- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options {
  return [super application:application openURL:url options:options] || [RCTLinkingManager application:application openURL:url options:options];
}

// Universal Links
- (BOOL)application:(UIApplication *)application continueUserActivity:(nonnull NSUserActivity *)userActivity restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler {
  BOOL result = [RCTLinkingManager application:application continueUserActivity:userActivity restorationHandler:restorationHandler];
  return [super application:application continueUserActivity:userActivity restorationHandler:restorationHandler] || result;
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
  return [super application:application didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
  return [super application:application didFailToRegisterForRemoteNotificationsWithError:error];
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
  return [super application:application didReceiveRemoteNotification:userInfo fetchCompletionHandler:completionHandler];
}

// Background fetch handler
- (void)application:(UIApplication *)application performFetchWithCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
  // Perform background fetch
  [self fetchStepDataWithCompletion:^(double steps) {
    // Handle fetched steps
    NSLog(@"Fetched steps in background: %f", steps);
    completionHandler(UIBackgroundFetchResultNewData);
  }];
}

- (void)requestHealthKitAuthorization {
  if ([HKHealthStore isHealthDataAvailable]) {
    HKHealthStore *healthStore = [[HKHealthStore alloc] init];
    NSSet *readTypes = [NSSet setWithObject:[HKObjectType quantityTypeForIdentifier:HKQuantityTypeIdentifierStepCount]];
    [healthStore requestAuthorizationToShareTypes:nil readTypes:readTypes completion:^(BOOL success, NSError * _Nullable error) {
      if (success) {
        NSLog(@"HealthKit authorization granted");
      } else {
        NSLog(@"HealthKit authorization failed: %@", error.localizedDescription);
      }
    }];
  }
}

- (void)fetchStepDataWithCompletion:(void (^)(double steps))completion {
  HKHealthStore *healthStore = [[HKHealthStore alloc] init];
  HKQuantityType *stepType = [HKQuantityType quantityTypeForIdentifier:HKQuantityTypeIdentifierStepCount];
  NSDate *now = [NSDate date];
  NSDate *startOfDay = [[NSCalendar currentCalendar] startOfDayForDate:now];
  NSPredicate *predicate = [HKQuery predicateForSamplesWithStartDate:startOfDay endDate:now options:HKQueryOptionStrictStartDate];

  HKStatisticsQuery *query = [[HKStatisticsQuery alloc] initWithQuantityType:stepType quantitySamplePredicate:predicate options:HKStatisticsOptionCumulativeSum completionHandler:^(HKStatisticsQuery *query, HKStatistics *result, NSError *error) {
    double steps = 0;
    if (result) {
      HKQuantity *quantity = result.sumQuantity;
      steps = [quantity doubleValueForUnit:[HKUnit countUnit]];
    }
    completion(steps);
  }];

  [healthStore executeQuery:query];
}

@end`;
}

const withAppDelegate = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const appDelegatePath = path.join(config.modRequest.platformProjectRoot, 'walker', 'AppDelegate.mm');
      console.log('Modifying AppDelegate.mm at:', appDelegatePath);
      
      try {
        let content = await fs.promises.readFile(appDelegatePath, 'utf8');
        content = modifyAppDelegateContent(content);
        await fs.promises.writeFile(appDelegatePath, content, 'utf8');
        console.log('Successfully modified AppDelegate.mm');
      } catch (error) {
        console.error('Error modifying AppDelegate.mm:', error);
        throw error;
      }
      
      return config;
    },
  ]);
};

module.exports = withAppDelegate;