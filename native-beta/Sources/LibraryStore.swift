import Foundation
import ReadiumShared

@MainActor
final class LibraryStore: ObservableObject {
    @Published private(set) var books: [BookRecord] = []

    let readium = ReadiumClient()
    private let rootURL: URL
    private let booksURL: URL
    private let metadataURL: URL

    init(fileManager: FileManager = .default) {
        let applicationSupport = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first!
        rootURL = applicationSupport.appendingPathComponent(
            "KaylasLibraryReadiumBeta",
            isDirectory: true
        )
        booksURL = rootURL.appendingPathComponent("Books", isDirectory: true)
        metadataURL = rootURL.appendingPathComponent("library.json")
        do {
            try fileManager.createDirectory(
                at: booksURL,
                withIntermediateDirectories: true
            )
            let data = try Data(contentsOf: metadataURL)
            books = try JSONDecoder().decode([BookRecord].self, from: data)
        } catch {
            books = []
        }
    }

    func importBook(from sourceURL: URL) async throws {
        guard sourceURL.pathExtension.lowercased() == "epub" else {
            throw BetaReaderError.unsupportedFormat
        }
        let accessed = sourceURL.startAccessingSecurityScopedResource()
        defer {
            if accessed { sourceURL.stopAccessingSecurityScopedResource() }
        }

        let id = UUID()
        let destination = booksURL.appendingPathComponent("\(id.uuidString).epub")
        do {
            try FileManager.default.copyItem(at: sourceURL, to: destination)
            let publication = try await readium.open(url: destination)
            let title = publication.metadata.title?.trimmingCharacters(
                in: .whitespacesAndNewlines
            )
            let authors = publication.metadata.authors
                .map(\.name)
                .joined(separator: ", ")
            books.append(
                BookRecord(
                    id: id,
                    title: title?.isEmpty == false
                        ? title!
                        : sourceURL.deletingPathExtension().lastPathComponent,
                    author: authors.isEmpty ? "Unknown author" : authors,
                    filename: destination.lastPathComponent,
                    importedAt: Date(),
                    lastOpenedAt: nil,
                    locatorJSON: nil,
                    progression: 0
                )
            )
            sortAndSave()
        } catch {
            try? FileManager.default.removeItem(at: destination)
            throw error
        }
    }

    func open(_ record: BookRecord) async throws -> OpenedBook {
        let url = booksURL.appendingPathComponent(record.filename)
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw BetaReaderError.missingBook
        }
        let publication = try await readium.open(url: url)
        update(record.id) { book in
            book.lastOpenedAt = Date()
        }
        return OpenedBook(
            record: books.first(where: { $0.id == record.id }) ?? record,
            publication: publication
        )
    }

    func saveProgress(_ locator: Locator, for id: UUID) {
        guard let json = try? locator.jsonString() else { return }
        update(id) { book in
            book.locatorJSON = json
            book.progression = locator.locations.totalProgression ?? book.progression
            book.lastOpenedAt = Date()
        }
    }

    private func update(_ id: UUID, changes: (inout BookRecord) -> Void) {
        guard let index = books.firstIndex(where: { $0.id == id }) else { return }
        changes(&books[index])
        sortAndSave()
    }

    private func sortAndSave() {
        books.sort {
            ($0.lastOpenedAt ?? $0.importedAt) > ($1.lastOpenedAt ?? $1.importedAt)
        }
        if let data = try? JSONEncoder().encode(books) {
            try? data.write(to: metadataURL, options: .atomic)
        }
    }
}
