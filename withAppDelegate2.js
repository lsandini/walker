const { withDangerousMod, withPlugins } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function modifyAppDelegate(appDelegatePath) {
  const newAppDelegateContent = `#import "AppDelegate.h"
#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <HealthKit/HealthKit.h>
#import <UIKit/UIKit.h>
#import <BackgroundTasks/BackgroundTasks.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"main";

  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};
  
  // Request HealthKit authorization
  [self requestHealthKitAuthorization];
  
  // Register background tasks
  [self registerBackgroundTasks];

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

// Register background tasks
- (void)registerBackgroundTasks {
  [[BGTaskScheduler sharedScheduler] registerForTaskWithIdentifier:@"com.lsandini.walker.refresh" usingQueue:nil launchHandler:^(__kindof BGTask *task) {
    [self handleAppRefresh:task];
  }];
}

// Schedule background refresh
- (void)scheduleAppRefresh {
  BGAppRefreshTaskRequest *request = [[BGAppRefreshTaskRequest alloc] initWithIdentifier:@"com.lsandini.walker.refresh"];
  request.earliestBeginDate = [NSDate dateWithTimeIntervalSinceNow:5 * 60]; // Fetch no earlier than 5 minutes from now

  NSError *error = nil;
  if (![[BGTaskScheduler sharedScheduler] submitTaskRequest:request error:&error]) {
    NSLog(@"Could not schedule app refresh: %@", error);
  }
}

// Handle background refresh
- (void)handleAppRefresh:(BGAppRefreshTask *)task {
  // Schedule the next refresh
  [self scheduleAppRefresh];

  // Perform the background fetch
  [self fetchStepDataWithCompletion:^(double steps) {
    // Handle fetched steps
    NSLog(@"Fetched steps in background: %f", steps);
    [self uploadStepsToAPI:steps completion:^{
      [task setTaskCompletedWithSuccess:YES];
    }];
  }];

  // Expiration handler
  task.expirationHandler = ^{
    // Clean up any unfinished task business by marking where you stopped or ending the task outright.
    [task setTaskCompletedWithSuccess:NO];
  };
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

- (void)uploadStepsToAPI:(double)steps completion:(void (^)(void)) {
  NSString *apiUrl = @"YOUR_API_URL";
  NSString *apiKey = @"YOUR_API_KEY";
  
  NSDictionary *bodyData = @{
    @"created_at": [[ISO8601DateFormatter new] stringFromDate:[NSDate date]],
    @"steps-device": @(round(steps))
  };
  
  NSError *error;
  NSData *jsonData = [NSJSONSerialization dataWithJSONObject:bodyData options:0 error:&error];
  
  if (!jsonData) {
    NSLog(@"Error serializing JSON: %@", error.localizedDescription);
    completion();
    return;
  }
  
  NSURL *url = [NSURL URLWithString:apiUrl];
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
  [request setHTTPMethod:@"POST"];
  [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
  [request setValue:apiKey forHTTPHeaderField:@"api-secret"];
  [request setHTTPBody:jsonData];
  
  NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
    if (error) {
      NSLog(@"Failed to upload steps: %@", error.localizedDescription);
    } else if ([(NSHTTPURLResponse *)response statusCode] != 200) {
      NSLog(@"Upload failed with status: %ld", (long)[(NSHTTPURLResponse *)response statusCode]);
    } else {
      NSLog(@"Steps uploaded successfully");
    }
    completion();
  }];
  
  [task resume];
}

@end
`;

  fs.writeFile(appDelegatePath, newAppDelegateContent);
}

const withAppDelegate = (config) => {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const appDelegatePath = path.join(config.modRequest.platformProjectRoot, 'AppDelegate.mm');
      modifyAppDelegate(appDelegatePath);
      return config;
    },
  ]);
};

module.exports = (config) => {
  return withPlugins(config, [withAppDelegate]);
};