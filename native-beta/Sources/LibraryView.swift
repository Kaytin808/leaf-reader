import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var library: LibraryStore
    @State private var importing = false
    @State private var openingID: UUID?
    @State private var openedBook: OpenedBook?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if library.books.isEmpty {
                    ContentUnavailableView {
                        Label("Your beta shelf is empty", systemImage: "books.vertical")
                    } description: {
                        Text("Import an EPUB to compare Readium’s native Focus Mode with the stable app.")
                    } actions: {
                        Button("Import EPUB") { importing = true }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    List(library.books) { book in
                        Button {
                            open(book)
                        } label: {
                            BookRow(book: book, opening: openingID == book.id)
                        }
                        .buttonStyle(.plain)
                        .disabled(openingID != nil)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Kayla’s Library Beta")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Import", systemImage: "square.and.arrow.down") {
                        importing = true
                    }
                }
            }
        }
        .sheet(isPresented: $importing) {
            EPUBDocumentPicker(
                onPick: { urls in
                    importing = false
                    guard let url = urls.first else { return }
                    Task {
                        do {
                            try await library.importBook(from: url)
                        } catch {
                            errorMessage = error.localizedDescription
                        }
                    }
                },
                onCancel: {
                    importing = false
                }
            )
            .ignoresSafeArea()
        }
        .fullScreenCover(item: $openedBook) { opened in
            ReaderLoadingView(openedBook: opened)
                .environmentObject(library)
        }
        .alert(
            "Readium Beta",
            isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "Unknown error")
        }
    }

    private func open(_ book: BookRecord) {
        openingID = book.id
        Task {
            defer { openingID = nil }
            do {
                openedBook = try await library.open(book)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

private struct BookRow: View {
    let book: BookRecord
    let opening: Bool

    var body: some View {
        HStack(spacing: 16) {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [.indigo, .blue.opacity(0.7)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 58, height: 84)
                .overlay {
                    Image(systemName: "book.closed.fill")
                        .font(.title2)
                        .foregroundStyle(.white.opacity(0.9))
                }
            VStack(alignment: .leading, spacing: 5) {
                Text(book.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                Text(book.author)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                ProgressView(value: book.progression)
                    .tint(.indigo)
                Text("\(Int((book.progression * 100).rounded()))% read · \(book.fileExtension)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if opening {
                ProgressView()
            } else {
                Image(systemName: "chevron.right")
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 5)
        .contentShape(Rectangle())
    }
}

private struct ReaderLoadingView: View {
    @EnvironmentObject private var library: LibraryStore
    let openedBook: OpenedBook
    @State private var session: ReaderSession?
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let session {
                ReaderView(session: session)
            } else if let errorMessage {
                ContentUnavailableView(
                    "Couldn’t open reader",
                    systemImage: "exclamationmark.triangle",
                    description: Text(errorMessage)
                )
            } else {
                ProgressView("Preparing Readium…")
            }
        }
        .task {
            guard session == nil else { return }
            do {
                session = try await ReaderSession(
                    openedBook: openedBook,
                    onLocationChange: { locator in
                        library.saveProgress(locator, for: openedBook.id)
                    }
                )
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
