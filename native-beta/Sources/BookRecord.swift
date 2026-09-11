import Foundation
import ReadiumShared

struct BookRecord: Codable, Identifiable, Hashable {
    let id: UUID
    var title: String
    var author: String
    var filename: String
    var importedAt: Date
    var lastOpenedAt: Date?
    var locatorJSON: String?
    var progression: Double

    var fileExtension: String {
        URL(fileURLWithPath: filename).pathExtension.uppercased()
    }

    var locator: Locator? {
        guard let locatorJSON else { return nil }
        return try? Locator(jsonString: locatorJSON)
    }
}

struct OpenedBook: Identifiable {
    let record: BookRecord
    let publication: Publication

    var id: UUID { record.id }
}

enum BetaReaderError: LocalizedError {
    case unsupportedFormat
    case invalidFile
    case restrictedPublication
    case missingBook
    case cannotCreateLibrary

    var errorDescription: String? {
        switch self {
        case .unsupportedFormat:
            return "This beta currently supports EPUB books only."
        case .invalidFile:
            return "Readium could not open this EPUB. It may be damaged or encrypted."
        case .restrictedPublication:
            return "This beta cannot open DRM-restricted publications."
        case .missingBook:
            return "The imported book file is missing. Please import it again."
        case .cannotCreateLibrary:
            return "The beta library folder could not be created."
        }
    }
}
