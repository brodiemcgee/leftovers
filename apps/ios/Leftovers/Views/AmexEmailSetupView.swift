import SwiftUI
import UIKit

struct AmexEmailSetupView: View {
    let alias: String

    private var forwardingAddress: String {
        "amex+\(alias)@digitalattitudes.com.au"
    }

    var body: some View {
        Form {
            Section {
                Text("Amex isn't yet available through our bank-data provider, so we ingest it via the transaction-alert emails Amex sends you. Every charge becomes a transaction in real time.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section("Your forwarding address") {
                HStack {
                    Text(forwardingAddress)
                        .font(.system(.subheadline, design: .monospaced))
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                    Button {
                        UIPasteboard.general.string = forwardingAddress
                    } label: {
                        Image(systemName: "doc.on.doc")
                    }
                    .buttonStyle(.borderless)
                }
            }

            Section("How to set this up") {
                stepRow(
                    n: 1,
                    title: "Turn on Amex transaction alerts",
                    body: "Open the Amex app → Account → Manage Notifications. Enable “Charge approved” email alerts (any threshold). Make sure Amex sends them to your normal email address."
                )
                stepRow(
                    n: 2,
                    title: "Add a forwarding rule in Gmail / Apple Mail",
                    body: "From your inbox: any email FROM americanexpress.com.au should be auto-forwarded to the address above. Gmail: Settings → Filters → Create new. Apple Mail: rules in macOS Mail. iCloud Mail: Mail rules in Settings."
                )
                stepRow(
                    n: 3,
                    title: "Test it",
                    body: "Make a small purchase on your Amex. Within ~30 seconds of the email arriving you should see the transaction in this app and your headroom drop accordingly."
                )
            }

            Section {
                Text("If alerts stop arriving, check that your forwarding rule is still active and that Amex's email is still reaching your inbox.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Connect Amex")
    }

    private func stepRow(n: Int, title: String, body: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(n)")
                .font(.headline)
                .frame(width: 24, height: 24)
                .background(Circle().fill(Color.accentColor.opacity(0.15)))
                .foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.subheadline.weight(.medium))
                Text(body).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
