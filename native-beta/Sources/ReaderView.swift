import ReadiumNavigator
import SwiftUI
import UIKit

struct ReaderView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: ReaderSession

    var body: some View {
        ZStack {
            NavigatorContainer(session: session)
                .background(session.isNight ? Color(red: 0.07, green: 0.10, blue: 0.15) : .white)

            if !session.controlsVisible {
                VStack {
                    Spacer()
                    HStack(spacing: 10) {
                        Button {
                            session.togglePageTurnLock()
                        } label: {
                            Image(systemName: session.pageTurnsLocked ? "lock.fill" : "lock.open")
                        }
                        .accessibilityLabel(session.pageTurnsLocked ? "Unlock page turns" : "Lock page turns")

                        Button {
                            session.setControlsVisible(true)
                        } label: {
                            Image(systemName: "eye")
                        }
                        .accessibilityLabel("Show reading controls")
                    }
                    .font(.system(size: 18, weight: .semibold))
                    .padding(12)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.trailing, 14)
                    .padding(.bottom, 12)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if session.controlsVisible {
                ReaderHeader(session: session, close: dismiss.callAsFunction)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if session.controlsVisible {
                ReaderFooter(session: session)
            }
        }
        .preferredColorScheme(session.isNight ? .dark : .light)
        .statusBarHidden(false)
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
        }
        .alert(
            "Readium Beta",
            isPresented: Binding(
                get: { session.errorMessage != nil },
                set: { if !$0 { session.errorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) { session.errorMessage = nil }
        } message: {
            Text(session.errorMessage ?? "Unknown error")
        }
    }
}

private struct ReaderHeader: View {
    @ObservedObject var session: ReaderSession
    let close: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                Button(action: close) {
                    Image(systemName: "chevron.left")
                        .font(.title3.weight(.semibold))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.book.title)
                        .font(.headline)
                        .lineLimit(1)
                    Text(session.chapterTitle.isEmpty ? session.book.author : session.chapterTitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                Button(action: session.toggleTheme) {
                    Image(systemName: session.isNight ? "moon.fill" : "sun.max.fill")
                }
                Button(action: session.togglePageTurnLock) {
                    Image(systemName: session.pageTurnsLocked ? "lock.fill" : "lock.open")
                }
                .accessibilityLabel(session.pageTurnsLocked ? "Unlock page turns" : "Lock page turns")
                Button {
                    session.setControlsVisible(false)
                } label: {
                    Image(systemName: "eye.slash")
                }
                .accessibilityLabel("Enter Focus Mode")
            }
            HStack(spacing: 18) {
                Button { session.changeFontSize(by: -0.1) } label: {
                    Label("Smaller", systemImage: "textformat.size.smaller")
                }
                Button { session.changeFontSize(by: 0.1) } label: {
                    Label("Larger", systemImage: "textformat.size.larger")
                }
            }
            .font(.caption.weight(.medium))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial)
        .overlay(alignment: .bottom) { Divider() }
    }
}

private struct ReaderFooter: View {
    @ObservedObject var session: ReaderSession

    var body: some View {
        VStack(spacing: 7) {
            ProgressView(value: session.progression)
                .tint(.blue)
            HStack {
                Button(action: session.goBackward) {
                    Image(systemName: "arrow.left")
                        .frame(width: 44, height: 44)
                }
                .disabled(session.pageTurnsLocked)
                Spacer()
                VStack(spacing: 2) {
                    if session.position > 0, session.positionCount > 0 {
                        Text("Position \(session.position) of \(session.positionCount)")
                            .font(.subheadline.weight(.semibold))
                    } else {
                        Text("\(Int((session.progression * 100).rounded()))% read")
                            .font(.subheadline.weight(.semibold))
                    }
                    Text(session.pageTurnsLocked ? "Page turns locked" : "Tap either edge to turn")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button(action: session.goForward) {
                    Image(systemName: "arrow.right")
                        .frame(width: 44, height: 44)
                }
                .disabled(session.pageTurnsLocked)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 6)
        .background(.regularMaterial)
        .overlay(alignment: .top) { Divider() }
    }
}

private struct NavigatorContainer: UIViewControllerRepresentable {
    let session: ReaderSession

    func makeUIViewController(context: Context) -> NavigatorHostController {
        NavigatorHostController(navigator: session.navigator)
    }

    func updateUIViewController(
        _ uiViewController: NavigatorHostController,
        context: Context
    ) {}
}

@MainActor
private final class NavigatorHostController: UIViewController {
    private let navigator: EPUBNavigatorViewController

    init(navigator: EPUBNavigatorViewController) {
        self.navigator = navigator
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        addChild(navigator)
        navigator.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(navigator.view)
        NSLayoutConstraint.activate([
            navigator.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            navigator.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            navigator.view.topAnchor.constraint(equalTo: view.topAnchor),
            navigator.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        navigator.didMove(toParent: self)
    }
}
