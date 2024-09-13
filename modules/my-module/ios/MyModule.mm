#import "MyModule.h"

@interface MyModule ()
@property (nonatomic, copy) void (^backgroundCompletionHandler)(void);
@end

@implementation MyModule

+ (instancetype)shared {
    static MyModule *sharedInstance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        sharedInstance = [[self alloc] init];
    });
    return sharedInstance;
}

- (void)setBackgroundCompletionHandler:(void (^)(void))completionHandler {
    self.backgroundCompletionHandler = completionHandler;
}

// You can add other methods here as needed

@end