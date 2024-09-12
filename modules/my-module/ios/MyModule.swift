import ExpoModulesCore
import HealthKit

public class MyModule: Module {
    private var healthStore: HKHealthStore?
    private var query: HKObserverQuery?
    private var updateHandler: (() -> Void)?

    public func definition() -> ModuleDefinition {
        Name("MyModule")

        Constants([
            "PI": Double.pi
        ])

        Events("onChange", "onStepsUpdate")

        Function("hello") {
            return "Hello world! 👋"
        }

        AsyncFunction("setValueAsync") { (value: String) in
            self.sendEvent("onChange", [
                "value": value
            ])
        }

        AsyncFunction("startStepTracking") { () -> Void in
            self.setupHealthKit()
        }

        AsyncFunction("stopStepTracking") { () -> Void in
            self.stopHealthKitTracking()
        }

        View(MyModuleView.self) {
            Prop("name") { (view: MyModuleView, prop: String) in
                print(prop)
            }
        }
    }

    private func setupHealthKit() {
        guard HKHealthStore.isHealthDataAvailable() else {
            print("HealthKit is not available on this device")
            return
        }

        healthStore = HKHealthStore()

        guard let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
            print("Step count is not available")
            return
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