import ExpoModulesCore
import HealthKit
import UIKit

public class MyModule: Module {
    private var healthStore: HKHealthStore?
    private var query: HKObserverQuery?
    private var apiUrl: String? // Store API URL
    private var apiKey: String? // Store API Key

    public func definition() -> ModuleDefinition {
        Name("MyModule")

        Constants([
            "PI": Double.pi
        ])

        Function("hello") {
            return "Hello world! 👋"
        }

        AsyncFunction("setValueAsync") { (value: String) in
            self.sendEvent("onChange", [
                "value": value
            ])
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

        Events("onChange", "onStepsUpdate")
    }

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
            } else if let error = error {
                print("HealthKit authorization failed: \(error.localizedDescription)")
            }
        }
    }

    private func startObservingSteps() {
        guard let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else { return }

        let query = HKObserverQuery(sampleType: stepType, predicate: nil) { [weak self] (query, completionHandler, error) in
            if let error = error {
                print("Observer Query Error: \(error.localizedDescription)")
                return
            }

            // Handle step updates and trigger the upload
            self?.handleStepUpdate {
                // Call HealthKit's completion handler when done
                completionHandler()
            }
        }

        healthStore?.execute(query)
        self.query = query

        // Enable background delivery of step count updates
        healthStore?.enableBackgroundDelivery(for: stepType, frequency: .immediate) { (success, error) in
            if let error = error {
                print("Failed to enable background delivery: \(error.localizedDescription)")
            }
        }
    }

    private func handleStepUpdate(completion: @escaping () -> Void) {
        // Declare the background task ID variable
        var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid

        // Begin the background task
        backgroundTaskID = UIApplication.shared.beginBackgroundTask(withName: "UploadSteps") {
            // End the background task if iOS forces it to expire
            UIApplication.shared.endBackgroundTask(backgroundTaskID)
            backgroundTaskID = .invalid
        }

        // Fetch step data and perform the upload
        fetchStepData { [weak self] steps in
            self?.uploadStepsToAPI(steps: steps) {
                // When done, end the background task and call the completion handler
                UIApplication.shared.endBackgroundTask(backgroundTaskID)
                backgroundTaskID = .invalid
                completion()
            }
        }
    }

    // Function to fetch the latest step data from HealthKit
    private func fetchStepData(completion: @escaping (Double) -> Void) {
        guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else { return }

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

    private func stopHealthKitTracking() {
        if let query = self.query {
            healthStore?.stop(query)
            self.query = nil
        }
    }

    private func uploadStepsToAPI(steps: Double, completion: @escaping () -> Void) {
        guard let apiUrl = self.apiUrl, let apiKey = self.apiKey else {
            print("No API URL or API key available")
            return
        }

        let bodyData: [String: Any] = [
            "created_at": ISO8601DateFormatter().string(from: Date()),
            "steps-ios": Int(round(steps))
        ]

        guard let url = URL(string: apiUrl) else {
            print("Invalid API URL")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue(apiKey, forHTTPHeaderField: "api-secret")

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: bodyData, options: [])
            request.httpBody = jsonData

            // Upload data in the background
            let task = URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    print("Failed to upload steps: \(error.localizedDescription)")
                } else if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode != 200 {
                    print("Upload failed with status: \(httpResponse.statusCode)")
                } else {
                    print("Steps uploaded successfully")
                }
                completion()
            }

            task.resume()
        } catch {
            print("Error uploading steps: \(error.localizedDescription)")
            completion()
        }
    }
}
