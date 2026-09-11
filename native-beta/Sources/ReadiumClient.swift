import Foundation
import ReadiumNavigator
import ReadiumShared
import ReadiumStreamer

@MainActor
final class ReadiumClient {
    private let httpClient = DefaultHTTPClient()
    private lazy var assetRetriever = AssetRetriever(httpClient: httpClient)
    private lazy var publicationOpener = PublicationOpener(
        parser: DefaultPublicationParser(
            httpClient: httpClient,
            assetRetriever: assetRetriever,
            pdfFactory: DefaultPDFDocumentFactory()
        ),
        contentProtections: []
    )

    func open(url: URL) async throws -> Publication {
        guard let fileURL = FileURL(url: url) else {
            throw BetaReaderError.invalidFile
        }
        do {
            let asset = try await assetRetriever.retrieve(url: fileURL).get()
            let publication = try await publicationOpener.open(
                asset: asset,
                allowUserInteraction: false
            ).get()
            guard !publication.isRestricted else {
                throw BetaReaderError.restrictedPublication
            }
            return publication
        } catch let error as BetaReaderError {
            throw error
        } catch {
            throw BetaReaderError.invalidFile
        }
    }
}
