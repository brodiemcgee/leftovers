import AppIntents
import WidgetKit

/// What number the widget should foreground. Configurable per widget instance
/// — long-press the widget on the home screen, tap "Edit Widget", and pick.
public enum HeadroomMode: String, AppEnum, CaseDisplayRepresentable {
    case month
    case today
    case dailyPace

    public static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Mode")
    }

    public static var caseDisplayRepresentations: [HeadroomMode: DisplayRepresentation] {
        [
            .month: DisplayRepresentation(title: "This month", subtitle: "Headroom for the whole period"),
            .today: DisplayRepresentation(title: "Today", subtitle: "How much you can still spend today and stay on pace"),
            .dailyPace: DisplayRepresentation(title: "Daily pace", subtitle: "Suggested daily allowance"),
        ]
    }
}

public struct HeadroomConfigIntent: WidgetConfigurationIntent {
    public static var title: LocalizedStringResource { "Headroom mode" }
    public static var description = IntentDescription("Pick what the widget shows.")

    @Parameter(title: "Mode", default: .month)
    public var mode: HeadroomMode

    public init() {}
}
