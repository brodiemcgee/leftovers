import SwiftUI

struct HomeTabView: View {
    @State private var showQuickAdd = false

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            TabView {
                NavigationStack { HomeView() }
                    .tabItem { Label("Home", systemImage: "house") }

                NavigationStack { TransactionsView() }
                    .tabItem { Label("Transactions", systemImage: "list.bullet") }

                NavigationStack { AccountsView() }
                    .tabItem { Label("Accounts", systemImage: "creditcard") }

                NavigationStack { SettingsView() }
                    .tabItem { Label("Settings", systemImage: "gearshape") }
            }

            Button {
                showQuickAdd = true
            } label: {
                Image(systemName: "plus")
                    .font(.title2.weight(.semibold))
                    .frame(width: 56, height: 56)
                    .background(.tint, in: Circle())
                    .foregroundStyle(.white)
                    .shadow(radius: 6, y: 3)
            }
            .padding(.bottom, 80)
            .padding(.trailing, 20)
            .accessibilityLabel("What if I spend...")
        }
        .sheet(isPresented: $showQuickAdd) {
            QuickAddSheet()
                .presentationDetents([.medium])
        }
    }
}
