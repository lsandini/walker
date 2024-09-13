#import <Foundation/Foundation.h>

@interface MyModule : NSObject

// Shared instance accessor
+ (instancetype)shared;

// Method to set the background completion handler
- (void)setBackgroundCompletionHandler:(void (^)(void))completionHandler;

// You can add other methods here as needed for your module

@end