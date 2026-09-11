import Foundation
import ReadiumNavigator
import ReadiumShared
import UIKit

@MainActor
final class ReaderSession: NSObject, ObservableObject, EPUBNavigatorDelegate {
    let navigator: EPUBNavigatorViewController
    let publication: Publication
    let book: BookRecord

    @Published private(set) var controlsVisible = true
    @Published private(set) var pageTurnsLocked = false
    @Published private(set) var isNight = true
    @Published private(set) var progression: Double
    @Published private(set) var position = 0
    @Published private(set) var positionCount = 0
    @Published private(set) var chapterTitle: String
    @Published var errorMessage: String?

    private var preferences: EPUBPreferences
    private let navigationAdapter: DirectionalNavigationAdapter
    private let onLocationChange: (Locator) -> Void
    private var viewportChange = 0

    init(
        openedBook: OpenedBook,
        onLocationChange: @escaping (Locator) -> Void
    ) async throws {
        publication = openedBook.publication
        book = openedBook.record
        progression = openedBook.record.progression
        chapterTitle = openedBook.record.locator?.title ?? ""
        self.onLocationChange = onLocationChange
        preferences = EPUBPreferences(
            columnCount: .one,
            fontFamily: .serif,
            fontSize: 1.0,
            pageMargins: 1.0,
            publisherStyles: false,
            scroll: false,
            textNormalization: true,
            theme: .dark
        )
        navigator = try EPUBNavigatorViewController(
            publication: openedBook.publication,
            initialLocation: openedBook.record.locator,
            config: .init(
                preferences: preferences,
                contentInset: [
                    .compact: (top: 12, bottom: 12),
                    .regular: (top: 20, bottom: 20),
                ]
            )
        )
        navigationAdapter = DirectionalNavigationAdapter(
            pointerPolicy: .init(
                edges: .horizontal,
                minimumHorizontalEdgeSize: 72,
                horizontalEdgeThresholdPercent: 0.28
            )
        )
        super.init()

        navigator.delegate = self
        navigationAdapter.bind(to: navigator)

        Task { [weak self, publication = openedBook.publication] in
            guard let self else { return }
            if let positions = try? await publication.positions().get() {
                positionCount = positions.count
            }
        }
    }

    func setControlsVisible(_ visible: Bool) {
        guard controlsVisible != visible else { return }
        let anchor = navigator.currentLocation
        viewportChange += 1
        let generation = viewportChange
        controlsVisible = visible

        // SwiftUI changes the navigator's proposed safe-area size after this
        // state update. Restore Readium's stable Locator once that layout pass
        // has completed so the experiment never uses a percentage guess.
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, generation == viewportChange, let anchor else { return }
            _ = await navigator.go(to: anchor, options: .none)
        }
    }

    func toggleControls() {
        setControlsVisible(!controlsVisible)
    }

    func togglePageTurnLock() {
        pageTurnsLocked.toggle()
        if pageTurnsLocked {
            navigationAdapter.unbind()
        } else {
            navigationAdapter.bind(to: navigator)
        }
    }

    func goForward() {
        guard !pageTurnsLocked else { return }
        Task { _ = await navigator.goForward(options: .none) }
    }

    func goBackward() {
        guard !pageTurnsLocked else { return }
        Task { _ = await navigator.goBackward(options: .none) }
    }

    func toggleTheme() {
        isNight.toggle()
        preferences.theme = isNight ? .dark : .light
        navigator.submitPreferences(preferences)
    }

    func changeFontSize(by delta: Double) {
        preferences.fontSize = min(2.0, max(0.7, (preferences.fontSize ?? 1) + delta))
        navigator.submitPreferences(preferences)
    }

    func navigator(_ navigator: Navigator, locationDidChange locator: Locator) {
        progression = locator.locations.totalProgression ?? progression
        position = locator.locations.position ?? position
        chapterTitle = locator.title ?? chapterTitle
        onLocationChange(locator)
    }

    func navigator(_ navigator: Navigator, presentError error: NavigatorError) {
        errorMessage = "Readium could not display this part of the book."
    }

    func navigatorContentInset(_ navigator: VisualNavigator) -> UIEdgeInsets? {
        // The SwiftUI container is already constrained to the real device safe
        // area. Returning a small explicit inset avoids Readium adding the
        // window safe area a second time.
        UIEdgeInsets(top: 12, left: 0, bottom: 12, right: 0)
    }

    func navigator(_ navigator: VisualNavigator, didTapAt point: CGPoint) {
        toggleControls()
    }
}
