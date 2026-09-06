import Capacitor
import UIKit
import WebKit

final class LeafBridgeViewController: CAPBridgeViewController, UIGestureRecognizerDelegate {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }

        // The native recognizer owns single taps in the iPhone reader. No view
        // is placed over the book; scrolling, selection and pinch still reach WebKit.
        let setup = WKUserScript(
            source: "window.__leafNativeTapEnabled = true;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        webView.configuration.userContentController.addUserScript(setup)
        let tap = UITapGestureRecognizer(target: self, action: #selector(didTapBook(_:)))
        tap.numberOfTapsRequired = 1
        tap.numberOfTouchesRequired = 1
        tap.cancelsTouchesInView = false
        tap.delaysTouchesBegan = false
        tap.delaysTouchesEnded = false
        tap.delegate = self
        tap.require(toFail: webView.scrollView.panGestureRecognizer)
        webView.addGestureRecognizer(tap)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldReceive touch: UITouch) -> Bool {
        if let webView = webView {
            sendTapPoint(touch.location(in: webView), phase: "start")
        }
        return true
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        true
    }

    @objc private func didTapBook(_ recognizer: UITapGestureRecognizer) {
        guard recognizer.state == .ended, let webView = webView,
              !webView.scrollView.isDragging, !webView.scrollView.isDecelerating else { return }
        sendTapPoint(recognizer.location(in: webView), phase: "end")
    }

    private func sendTapPoint(_ point: CGPoint, phase: String) {
        guard let webView = webView else { return }
        // JSON serialization keeps native coordinates locale-independent.
        guard let data = try? JSONSerialization.data(withJSONObject: ["x": point.x, "y": point.y, "phase": phase]),
              let coordinates = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("""
            (() => {
              const point = \(coordinates);
              const viewport = window.visualViewport;
              const scale = viewport?.scale || 1;
              window.dispatchEvent(new CustomEvent('leaf-native-tap', { detail: {
                x: point.x / scale + (viewport?.offsetLeft || 0),
                y: point.y / scale + (viewport?.offsetTop || 0),
                phase: point.phase
              }}));
            })();
            """, completionHandler: nil)
    }
}
