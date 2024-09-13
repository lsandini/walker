#import "MyModule.h"

@interface MyModule ()
@property (nonatomic, copy) void (^backgroundCompletionHandler)(void);
@end

@implementation MyModule

EX_EXPORT_MODULE(MyModule);

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

// Your existing methods...

@end