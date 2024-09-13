#import <Foundation/Foundation.h>

#import <ExpoModulesCore/ExpoModulesCore.h>

@interface MyModule : EXExportedModule

+ (instancetype)shared;
- (void)setBackgroundCompletionHandler:(void (^)(void))completionHandler;

@end