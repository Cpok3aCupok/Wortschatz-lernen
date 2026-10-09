import UIKit
import WebKit

/// Показує вебзастосунок з теки `web` усередині застосунку.
/// Файли віддаються через власну схему `wortschatz://`, щоб працювали модулі JS,
/// fetch() і localStorage так само, як на звичайному сайті.
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var webView: WKWebView!
    private var theme = "auto"

    // Колір фону як у CSS (--bg), щоб не блимало білим/чорним під час запуску.
    private static let pageBackground = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0x0e / 255, green: 0x10 / 255, blue: 0x16 / 255, alpha: 1)
            : UIColor(red: 0xf4 / 255, green: 0xf5 / 255, blue: 0xfa / 255, alpha: 1)
    }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()
        config.userContentController.add(self, name: "saveFile")
        config.userContentController.add(self, name: "theme")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        // Сторінка не прокручується цілком (прокручується лише вміст усередині),
        // тож «пружина» всієї сторінки лише зсуває панелі.
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = Self.pageBackground
        webView.scrollView.backgroundColor = Self.pageBackground
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        view = webView
    }

    // Тема, вибрана в налаштуваннях застосунку, а не лише системна.
    override var preferredStatusBarStyle: UIStatusBarStyle {
        switch theme {
        case "light": return .darkContent
        case "dark": return .lightContent
        default: return .default
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: URL(string: "\(BundleSchemeHandler.scheme)://app/index.html")!))
    }

    // Зовнішні посилання (Вікісловник, Wikimedia Commons) відкриваються в Safari.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        return nil
    }

    // Якщо процес вебвмісту завершився (брак пам'яті) — перезавантажуємо сторінку.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "theme" {
            applyTheme(message.body as? String ?? "auto")
        } else if message.name == "saveFile" {
            saveFile(message.body)
        }
    }

    // JS надсилає "light" | "dark" | "auto".
    private func applyTheme(_ value: String) {
        theme = value
        overrideUserInterfaceStyle = value == "light" ? .light : value == "dark" ? .dark : .unspecified
        setNeedsStatusBarAppearanceUpdate()
    }

    // Міст для збереження резервної копії / CSV: JS надсилає { name, text }.
    private func saveFile(_ messageBody: Any) {
        guard let body = messageBody as? [String: Any],
              let name = body["name"] as? String,
              let text = body["text"] as? String else { return }
        let fileName = (name as NSString).lastPathComponent
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName.isEmpty ? "wortschatz.txt" : fileName)
        do {
            try text.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            return
        }
        let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        share.popoverPresentationController?.sourceView = view
        present(share, animated: true)
    }
}

/// Віддає файли з теки `web` у бандлі застосунку.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "wortschatz"
    private let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true).standardizedFileURL

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else { return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL

        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1",
                                           headerFields: ["Content-Type": "text/plain; charset=utf-8"])!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(Data("Not found".utf8))
            urlSchemeTask.didFinish()
            return
        }
        let headers = [
            "Content-Type": Self.mimeType(for: file.pathExtension),
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
        ]
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "webmanifest": return "application/manifest+json"
        case "png": return "image/png"
        case "svg": return "image/svg+xml"
        default: return "application/octet-stream"
        }
    }
}
