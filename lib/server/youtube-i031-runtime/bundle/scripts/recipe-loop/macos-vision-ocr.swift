import CoreGraphics
import Foundation
import ImageIO
import Vision

struct InputPayload: Decodable {
    let version: String?
    let items: [InputItem]
}

struct InputItem: Decodable {
    let id: String
    let path: String
    let region: String
}

struct BoundingBox: Encodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct TextObservation: Encodable {
    let text: String
    let confidence: Float
    let boundingBox: BoundingBox
}

struct OutputItem: Encodable {
    let id: String
    let path: String
    let region: String
    let observations: [TextObservation]
    let error: String?
}

struct OutputPayload: Encodable {
    let version: String
    let items: [OutputItem]
}

enum HelperError: Error, CustomStringConvertible {
    case usage
    case imageLoad(String)

    var description: String {
        switch self {
        case .usage:
            return "usage: macos-vision-ocr <input.json> <output.json>"
        case .imageLoad(let path):
            return "unable to load image: \(path)"
        }
    }
}

func regionOfInterest(_ region: String) -> CGRect {
    // Vision coordinates start in the lower-left corner.
    switch region.lowercased() {
    case "top":
        return CGRect(x: 0, y: 0.64, width: 1, height: 0.36)
    case "bottom":
        return CGRect(x: 0, y: 0, width: 1, height: 0.42)
    case "center":
        return CGRect(x: 0, y: 0.24, width: 1, height: 0.52)
    default:
        return CGRect(x: 0, y: 0, width: 1, height: 1)
    }
}

func loadImage(_ path: String) throws -> CGImage {
    let url = URL(fileURLWithPath: path)
    guard
        let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
        throw HelperError.imageLoad(path)
    }
    return image
}

func recognize(_ item: InputItem) -> OutputItem {
    do {
        let image = try loadImage(item.path)
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["ko-KR", "en-US"]
        request.usesLanguageCorrection = false
        request.regionOfInterest = regionOfInterest(item.region)
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        try handler.perform([request])
        let observations = (request.results ?? [])
            .sorted {
                if $0.boundingBox.maxY != $1.boundingBox.maxY {
                    return $0.boundingBox.maxY > $1.boundingBox.maxY
                }
                return $0.boundingBox.minX < $1.boundingBox.minX
            }
            .compactMap { observation -> TextObservation? in
                guard let candidate = observation.topCandidates(1).first else { return nil }
                let box = observation.boundingBox
                return TextObservation(
                    text: candidate.string,
                    confidence: candidate.confidence,
                    boundingBox: BoundingBox(
                        x: box.origin.x,
                        y: box.origin.y,
                        width: box.size.width,
                        height: box.size.height
                    )
                )
            }
        return OutputItem(
            id: item.id,
            path: item.path,
            region: item.region,
            observations: observations,
            error: nil
        )
    } catch {
        return OutputItem(
            id: item.id,
            path: item.path,
            region: item.region,
            observations: [],
            error: String(describing: error)
        )
    }
}

guard CommandLine.arguments.count == 3 else {
    FileHandle.standardError.write(Data("\(HelperError.usage)\n".utf8))
    exit(2)
}

do {
    let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
    let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
    let input = try JSONDecoder().decode(InputPayload.self, from: Data(contentsOf: inputURL))
    let output = OutputPayload(
        version: "macos-vision-ocr-output-v1",
        items: input.items.map(recognize)
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try encoder.encode(output).write(to: outputURL, options: .atomic)
} catch {
    FileHandle.standardError.write(Data("\(error)\n".utf8))
    exit(1)
}
