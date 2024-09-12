import ExpoModulesCore
import HealthKit

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

        // The new setApiDetails function
        AsyncFunction("setApiDetails") { (url: String, key: String) in
            self.apiUrl = url
            self.apiKey = key
            print("API URL set to: \(url)")
            print("API Key set to: \(key)")
            // You can add more logic here to use the API details, e.g., making API requests, etc.
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

            self?.updateSteps()
            completionHandler()
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

    private func updateSteps() {
        guard let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else { return }

        let now = Date()
        let startOfDay = Calendar.current.startOfDay(for: now)
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: now, options: .strictStartDate)

        let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { [weak self] (_, result, error) in
            guard let result = result, let sum = result.sumQuantity() else {
                print("Failed to fetch steps: \(error?.localizedDescription ?? "Unknown error")")
                return
            }

            let steps = sum.doubleValue(for: HKUnit.count())
            DispatchQueue.main.async {
                self?.sendEvent("onStepsUpdate", [
                    "steps": steps
                ])
            }
        }

        healthStore?.execute(query)
    }

    private func stopHealthKitTracking() {
        if let query = self.query {
            healthStore?.stop(query)
            self.query = nil
        }
    }
}
