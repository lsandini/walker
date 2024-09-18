import ExpoModulesCore
import HealthKit
import UIKit
import BackgroundTasks
import UserNotifications

public class MyModule: Module {
    private var healthStore: HKHealthStore?
    private var query: HKObserverQuery?
    private var apiUrl: String?
    private var apiKey: String?
    private var lastUpdateTime: Date?
    private let iso8601Formatter = ISO8601DateFormatter()
    
    // MARK: - Module Definition
    
    public func definition() -> ModuleDefinition {
        Name("MyModule")
        
        Constants([
            "PI": Double.pi
        ])
        
        Function("hello") {
            return "Hello world! 👋"
        }
        
        AsyncFunction("setApiDetails") { (url: String, key: String) in
            self.apiUrl = url
            self.apiKey = key
            print("API URL set to: \(url)")
            print("API Key set to: \(key)")
        }
        
        AsyncFunction("startStepTracking") { () -> String in
            do {
                try self.setupHealthKit()
                return "Step tracking started successfully"
            } catch {
                throw error
            }
        }
        
        AsyncFunction("stopStepTracking") { () -> String in
            self.stopHealthKitTracking()
            return "Step tracking stopped"
        }
        
        AsyncFunction("getLastUpdateTime") { () -> String? in
            guard let lastUpdateTime = self.lastUpdateTime else { return nil }
            return self.iso8601Formatter.string(from: lastUpdateTime)
        }
        
        Function("registerBackgroundFetch") {
            self.registerBackgroundFetch()
        }
        
        Function("scheduleBackgroundProcessingTask") {
            self.scheduleBackgroundProcessingTask()
        }
        
        AsyncFunction("setupHealthKitBackgroundDelivery") { () -> String in
            do {
                try self.setupHealthKitBackgroundDelivery()
                return "HealthKit background delivery setup successfully"
            } catch {
                throw error
            }
        }

        Function("registerForSilentPushNotifications") {
            self.registerForSilentPushNotifications()
        }

        AsyncFunction("handleSilentPushNotification") { (userInfo: [AnyHashable: Any]) in
            self.handleSilentPushNotification(userInfo: userInfo)
        }
        
        Events("onStepsUpdate")
    }
    
    // MARK: - HealthKit Setup
    
    private func setupHealthKit() throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw NSError(domain: "HealthKit", code: 0, userInfo: [NSLocalizedDescriptionKey: "HealthKit is not available on this device"])
        }
        
        healthStore = HKHealthStore()
        
        guard let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
            throw NSError(domain: "HealthKit", code: 1, userInfo: [NSLocalizedDescriptionKey: "Step count is not available"])
        }
        
        healthStore?.requestAuthorization(toShare: [], read: [stepType]) { (success, error) in
            if success {
                self.startObservingSteps()
                self.registerBackgroundFetch()
                self.scheduleBackgroundProcessingTask()
            } else if let error = error {
                print("HealthKit authorization failed: \(error.localizedDescription)")
            }
        }
    }
    
    private func setupHealthKitBackgroundDelivery() throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw NSError(domain: "HealthKit", code: 0, userInfo: [NSLocalizedDescriptionKey: "HealthKit is not available on this device"])
        }
        
        healthStore = HKHealthStore()
        
        guard let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
            throw NSError(domain: "HealthKit", code: 1, userInfo: [NSLocalizedDescriptionKey: "Step count is not available"])
        }
        
        healthStore?.requestAuthorization(toShare: [], read: [stepType]) { [weak self] (success, error) in
            if success {
                self?.setupBackgroundDelivery(for: stepType)
            } else if let error = error {
                print("HealthKit authorization failed: \(error.localizedDescription)")
            }
        }
    }
    
    // MARK: - Step Tracking
    
    private func startObservingSteps() {
        guard let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else { return }
        
        let query = HKObserverQuery(sampleType: stepType, predicate: nil) { [weak self] (query, completionHandler, error) in
            if let error = error {
                print("Observer Query Error: \(error.localizedDescription)")
                completionHandler()
                return
            }
            
            self?.handleStepUpdate {
                completionHandler()
            }
        }
        
        healthStore?.execute(query)
        self.query = query
        
        healthStore?.enableBackgroundDelivery(for: stepType, frequency: .immediate) { (success, error) in
            if let error = error {
                print("Failed to enable background delivery: \(error.localizedDescription)")
            }
        }
    }
    
    private func setupBackgroundDelivery(for stepType: HKQuantityType) {
        let query = HKObserverQuery(sampleType: stepType, predicate: nil) { [weak self] (query, completionHandler, error) in
            guard error == nil else {
                print("Error in background delivery: \(error!.localizedDescription)")
                completionHandler()
                return
            }
            
            self?.handleStepUpdate {
                completionHandler()
            }
        }
        
        healthStore?.execute(query)
        
        healthStore?.enableBackgroundDelivery(for: stepType, frequency: .immediate) { (success, error) in
            if let error = error {
                print("Failed to enable background delivery: \(error.localizedDescription)")
            } else if success {
                print("Background delivery enabled successfully")
            }
        }
    }
    
    private func handleStepUpdate(completion: @escaping () -> Void) {
        var backgroundTask: UIBackgroundTaskIdentifier = .invalid
        backgroundTask = UIApplication.shared.beginBackgroundTask {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
        
        fetchStepData { [weak self] steps in
            guard let self = self else {
                UIApplication.shared.endBackgroundTask(backgroundTask)
                backgroundTask = .invalid
                completion()
                return
            }
            
            DispatchQueue.main.async {
                self.lastUpdateTime = Date()
                self.sendEvent("onStepsUpdate", [
                    "steps": steps,
                    "lastUpdate": self.lastUpdateTime.map { self.iso8601Formatter.string(from: $0) } ?? ""
                ])
            }
            
            self.uploadStepsToAPI(steps: steps) {
                UIApplication.shared.endBackgroundTask(backgroundTask)
                backgroundTask = .invalid
                completion()
            }
        }
    }
    
    private func fetchStepData(completion: @escaping (Double) -> Void) {
        guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
            completion(0)
            return
        }
        
        let now = Date()
        let startOfDay = Calendar.current.startOfDay(for: now)
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: now, options: .strictStartDate)
        
        let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { (_, result, error) in
            guard let result = result, let sum = result.sumQuantity() else {
                print("Failed to fetch steps: \(error?.localizedDescription ?? "Unknown error")")
                completion(0)
                return
            }
            
            let steps = sum.doubleValue(for: HKUnit.count())
            completion(steps)
        }
        
        healthStore?.execute(query)
    }
    
    // MARK: - API Communication
    
    private func uploadStepsToAPI(steps: Double, completion: @escaping () -> Void) {
        guard let apiUrl = self.apiUrl, let apiKey = self.apiKey, let url = URL(string: apiUrl) else {
            print("Invalid API configuration")
            completion()
            return
        }
        
        let bodyData: [String: Any] = [
            "created_at": iso8601Formatter.string(from: Date()),
            "steps-device": Int(round(steps))
        ]
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue(apiKey, forHTTPHeaderField: "api-secret")
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: bodyData, options: [])
            
            let task = URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    print("Failed to upload steps: \(error.localizedDescription)")
                } else if let httpResponse = response as? HTTPURLResponse {
                    print("Upload status: \(httpResponse.statusCode)")
                    if httpResponse.statusCode == 200 {
                        print("Steps uploaded successfully")
                    } else {
                        print("Upload failed with status: \(httpResponse.statusCode)")
                    }
                }
                completion()
            }
            
            task.resume()
        } catch {
            print("Error preparing upload request: \(error.localizedDescription)")
            completion()
        }
    }
    
    // MARK: - Background Tasks
    
    private func registerBackgroundFetch() {
        UIApplication.shared.setMinimumBackgroundFetchInterval(15 * 60) // 15 minutes in seconds
    }
    
    private func scheduleBackgroundProcessingTask() {
        let request = BGProcessingTaskRequest(identifier: "com.lsandini.walker.stepupdate")
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 minutes from now
        
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("Could not schedule background processing task: \(error)")
        }
    }
    
    public func handleBackgroundProcessingTask(task: BGProcessingTask) {
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }
        
        handleStepUpdate {
            task.setTaskCompleted(success: true)
            self.scheduleBackgroundProcessingTask() // Schedule the next task
        }
    }
    
    // MARK: - Silent Push Notifications
    
    private func registerForSilentPushNotifications() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if granted {
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        }
    }

    public func handleSilentPushNotification(userInfo: [AnyHashable: Any]) {
        print("Received silent push notification: \(userInfo)")
        
        // Perform step count update
        handleStepUpdate {
            print("Silent push notification handling completed")
        }
    }
    
    // MARK: - Cleanup
    
    private func stopHealthKitTracking() {
        if let query = self.query {
            healthStore?.stop(query)
            self.query = nil
        }
    }
    
    public func performBackgroundFetch(completion: @escaping (UIBackgroundFetchResult) -> Void) {
        handleStepUpdate {
            completion(.newData)
        }
    }
}