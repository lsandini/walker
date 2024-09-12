import ExpoModulesCore
import HealthKit

public class MyModule: Module {
    private var healthStore: HKHealthStore?
    private var query: HKObserverQuery?

    // MARK: - Module Definition
    public func definition() -> ModuleDefinition {
        Name("MyModule")

        Constants([
            "PI": Double.pi
        ])

        // Simple function to test exposure
        Function("hello") {
            return "Hello world! 👋"
        }

        // Async function to start step tracking
        AsyncFunction("startStepTracking") { () -> String in
            print("startStepTracking called")
            do {
                try self.setupHealthKit()
                return "Step tracking started successfully"
            } catch {
                throw error
            }
        }

        // Async function to stop step tracking
        AsyncFunction("stopStepTracking") { () -> String in
            print("stopStepTracking called")
            self.stopHealthKitTracking()
            return "Step tracking stopped"
        }

        // Define events emitted to JS
        Events("onChange", "onStepsUpdate")

        // Event emitter to send events back to JS
        EventEmitter { (eventEmitter) in
            // Handle event emitter for background updates
            self.registerEmitter(eventEmitter)
        }
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
            } else if let error = error {
                print("HealthKit authorization failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Start Observing Steps
    private func startObservingSteps() {
        guard let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else { return }

        let query = HKObserverQuery(sampleType: stepType, predicate: nil) { [weak self] (query, completionHandler, error) in
            if let error = error {
                print("Observer Query Error: \(error.localizedDescription)")
                return
            }

            // Trigger step update on each change
            self?.updateSteps()

            // Notify that observation completed successfully
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

    // MARK: - Update Steps
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
                // Emit event to JS with step count
                self?.sendEvent("onStepsUpdate", [
                    "steps": steps
                ])
            }
        }

        healthStore?.execute(query)
    }

    // MARK: - Stop HealthKit Tracking
    private func stopHealthKitTracking() {
        if let query = self.query {
            healthStore?.stop(query)
            self.query = nil
        }
    }

    // MARK: - Event Emitter Registration
    private var eventEmitter: EventEmitter?

    private func registerEmitter(_ emitter: EventEmitter) {
        self.eventEmitter = emitter
    }

    private func sendEvent(_ name: String, _ body: [String: Any]) {
        eventEmitter?.emit(name, body)
    }
}