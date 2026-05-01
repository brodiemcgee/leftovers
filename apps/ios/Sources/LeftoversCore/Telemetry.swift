import Foundation
import Sentry

public enum Telemetry {
    public static func bootstrap() {
        guard let dsn = Bundle.main.object(forInfoDictionaryKey: "SENTRY_DSN") as? String,
              !dsn.isEmpty
        else { return }
        SentrySDK.start { options in
            options.dsn = dsn
            options.tracesSampleRate = 0.1
            options.beforeSend = { event in
                event.user = nil
                event.request?.cookies = nil
                if var headers = event.request?.headers {
                    headers.removeValue(forKey: "Authorization")
                    headers.removeValue(forKey: "Cookie")
                    event.request?.headers = headers
                }
                return event
            }
        }
    }

    public static func capture(_ error: Error) {
        SentrySDK.capture(error: error)
    }
}
