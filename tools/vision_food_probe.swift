import Foundation
import Vision
struct ClassificationResult {
    let identifier: String
    let confidence: Float
}

func classifyImage(at path: String, topK: Int = 8) throws -> [ClassificationResult] {
    let request = VNClassifyImageRequest()
    let url = URL(fileURLWithPath: path)
    let handler = VNImageRequestHandler(url: url, options: [:])
    try handler.perform([request])

    let observations = request.results ?? []
    return observations.prefix(topK).map {
        ClassificationResult(identifier: $0.identifier, confidence: $0.confidence)
    }
}

func looksLikeFood(_ results: [ClassificationResult]) -> Bool {
    let foodHints = [
        "food", "dish", "meal", "plate", "drink", "beverage", "coffee", "tea",
        "burger", "pizza", "taco", "ramen", "noodle", "pasta", "sandwich",
        "dessert", "restaurant", "cuisine", "bread", "cake", "salad", "soup"
    ]

    for result in results.prefix(5) {
        let normalized = result.identifier.lowercased()
        if foodHints.contains(where: { normalized.contains($0) }) {
            return true
        }
    }
    return false
}

let args = Array(CommandLine.arguments.dropFirst())
guard !args.isEmpty else {
    fputs("Usage: swift vision_food_probe.swift <image-path> [<image-path>...]\n", stderr)
    exit(1)
}

for path in args {
    do {
        let results = try classifyImage(at: path)
        let foodFlag = looksLikeFood(results) ? "LIKELY_FOOD" : "NOT_OBVIOUSLY_FOOD"
        print("\n=== \(path) ===")
        print("Verdict: \(foodFlag)")
        for result in results {
            let confidence = String(format: "%.3f", result.confidence)
            print("- \(result.identifier) (\(confidence))")
        }
    } catch {
        print("\n=== \(path) ===")
        print("Error: \(error.localizedDescription)")
    }
}
