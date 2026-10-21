import SwiftUI

private enum GameSheet: Identifiable {
    case pocket, foul
    case retract(String, Int, String)
    var id: String {
        switch self { case .pocket: return "pocket"; case .foul: return "foul"; case .retract: return "retract" }
    }
}

struct WatchGameView: View {
    let room: Room
    @EnvironmentObject private var store: WatchRoomStore
    @State private var sheet: GameSheet?
    var body: some View {
        VStack(spacing: 8) {
            let names = room.turnOrder.compactMap { id in room.players.first { $0.userId == id }?.name }
            Text(WatchStrings.turnOrderPrefix(names.joined(separator: " → "))).font(.caption2)
            let cards = (store.me?.cards ?? []).sorted { $0.ballNumber < $1.ballNumber }
            if cards.allSatisfy({ room.pocketedBallNumbers.contains($0.ballNumber) }) {
                Text(WatchStrings.allCardsClearedOrFree).foregroundStyle(.yellow)
            }
            ForEach(cards, id: \.id) { card in
                let pocketed = room.pocketedBallNumbers.contains(card.ballNumber)
                Button { store.action("pocket_ball", fields: ["cardId": card.id]) } label: {
                    HStack {
                        BallBadge(number: card.ballNumber, size: 32)
                        VStack(alignment: .leading) {
                            Text("\(card.suit) \(card.rank)").foregroundStyle(card.color == .red ? .red : .primary)
                            Text(pocketed ? WatchStrings.cardPocketed : WatchStrings.cardTapToClear).font(.caption2)
                        }
                        Spacer(minLength: 0)
                    }
                }.disabled(pocketed || !store.ready || store.pending).opacity(pocketed ? 0.35 : 1)
            }
            Button(WatchStrings.recordPocketButton) { sheet = .pocket }
            Button(WatchStrings.recordFoulButton) { sheet = .foul }
            Button(WatchStrings.retractLastActionButton) { sheet = .retract(room.lastActionText ?? "", room.revision ?? 0, room.code) }
                .disabled(room.lastActionText?.isEmpty != false)
        }
        .disabled(!store.ready || store.pending)
        .sheet(item: $sheet) { choice in
            NavigationStack {
                switch choice {
                case .pocket: RecordPocketView()
                case .foul: RecordFoulView()
                case .retract(let text, let revision, let code): RetractView(text: text, revision: revision, code: code)
                }
            }.environmentObject(store)
        }
        .onChange(of: room.status) { _, status in if status != .playing { sheet = nil } }
    }
}

struct BallBadge: View {
    let number: Int
    var size: CGFloat = 32

    private var ballColor: Color {
        switch number {
        case 1, 9: return Color(red: 0xF5/255.0, green: 0xC0/255.0, blue: 0x1A/255.0) // Yellow
        case 2, 10: return Color(red: 0x1A/255.0, green: 0x4B/255.0, blue: 0x9C/255.0) // Blue
        case 3, 11: return Color(red: 0xD9/255.0, green: 0x25/255.0, blue: 0x25/255.0) // Red
        case 4, 12: return Color(red: 0xF4/255.0, green: 0x5F/255.0, blue: 0xA4/255.0) // Pink
        case 5, 13: return Color(red: 0xF2/255.0, green: 0x74/255.0, blue: 0x15/255.0) // Orange
        case 6, 14: return Color(red: 0x13/255.0, green: 0x7B/255.0, blue: 0x3E/255.0) // Green
        case 7, 15: return Color(red: 0x69/255.0, green: 0x1D/255.0, blue: 0x24/255.0) // Maroon
        case 8: return Color(red: 0x11/255.0, green: 0x11/255.0, blue: 0x11/255.0)     // Black
        default: return Color.gray
        }
    }

    private var isStriped: Bool { number >= 9 && number <= 15 }
    private var innerCircleSize: CGFloat { size * 0.52 }
    private var stripeHeight: CGFloat { size * 0.62 }
    private var fontSize: CGFloat {
        number >= 10 ? (innerCircleSize * 0.48) : (innerCircleSize * 0.58)
    }

    var body: some View {
        ZStack {
            if isStriped {
                Circle().fill(Color.white)
                Rectangle()
                    .fill(ballColor)
                    .frame(width: size, height: stripeHeight)
            } else {
                Circle().fill(ballColor)
            }
            Circle()
                .fill(Color.white)
                .frame(width: innerCircleSize, height: innerCircleSize)
            Text("\(number)")
                .font(.system(size: fontSize, weight: .black))
                .foregroundStyle(Color.black)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityLabel(WatchStrings.ballBadgeAccessibility(number))
    }
}

struct RecordPocketView: View {
    @EnvironmentObject private var store: WatchRoomStore
    @Environment(\.dismiss) private var dismiss
    @State private var target = ""
    private let breakTarget = "__break__"

    private struct TargetOption: Identifiable {
        let id: String
        let label: String
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                if let room = store.room {
                    let options: [TargetOption] = room.players.map { TargetOption(id: $0.userId, label: $0.name) } +
                        [TargetOption(id: breakTarget, label: WatchStrings.breakPocketOption)]

                    VStack(spacing: 4) {
                        Text(WatchStrings.selectPocketPlayer)
                            .font(.system(size: 10))
                            .foregroundStyle(.gray)

                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)], spacing: 4) {
                            ForEach(options, id: \.id) { opt in
                                let isSelected = (target == opt.id)
                                Button {
                                    target = opt.id
                                } label: {
                                    Text(isSelected ? "✓ \(opt.label)" : opt.label)
                                        .font(.system(size: 10, weight: isSelected ? .bold : .regular))
                                        .foregroundStyle(isSelected ? Color.black : Color.white)
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.7)
                                        .frame(maxWidth: .infinity, minHeight: 28)
                                        .background(isSelected ? Color.yellow : Color(white: 0.2))
                                        .clipShape(RoundedRectangle(cornerRadius: 6))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.horizontal, 2)

                    Text(WatchStrings.selectBallNumber)
                        .font(.system(size: 10))
                        .foregroundStyle(.gray)
                        .padding(.top, 4)

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 8) {
                        ForEach(1...15, id: \.self) { number in
                            Button {
                                if target == breakTarget {
                                    store.action("break_pocket", fields: ["ballNumber": number])
                                } else {
                                    store.action("referee_pocket_ball", fields: ["targetUserId": target, "ballNumber": number])
                                }
                                dismiss()
                            } label: {
                                BallBadge(number: number, size: 36)
                            }
                            .buttonStyle(.plain)
                            .disabled(room.pocketedBallNumbers.contains(number) || target.isEmpty || !store.ready || store.pending)
                            .opacity(room.pocketedBallNumbers.contains(number) ? 0.3 : 1)
                        }
                    }
                }
                Button(WatchStrings.cancelButton) { dismiss() }
                    .padding(.top, 4)
            }
        }
        .navigationTitle(WatchStrings.recordPocketTitle)
        .onAppear {
            target = store.currentTurn ?? store.room?.players.first?.userId ?? breakTarget
        }
    }
}

struct RecordFoulView: View {
    @EnvironmentObject private var store: WatchRoomStore
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        ScrollView {
            VStack {
                ForEach(store.room?.players ?? [], id: \.userId) { player in
                    Button(player.name) {
                        store.action("referee_draw_penalty", fields: ["targetUserId": player.userId]); dismiss()
                    }.disabled(!store.ready || store.pending)
                }
                Button(WatchStrings.cancelButton) { dismiss() }
            }
        }.navigationTitle(WatchStrings.selectFoulPlayerTitle)
    }
}

struct RetractView: View {
    let text: String
    let revision: Int
    let code: String
    @EnvironmentObject private var store: WatchRoomStore
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text(text.isEmpty ? WatchStrings.noRetractAction : WatchStrings.confirmRetractAction(text))
                Button(WatchStrings.confirmRetractButton, role: .destructive) {
                    if store.room?.code == code { store.action("retract_ball", fields: ["expectedRevision": revision]) }
                    dismiss()
                }.disabled(text.isEmpty || !store.ready || store.pending)
                Button(WatchStrings.cancelButton) { dismiss() }
            }
        }.navigationTitle(WatchStrings.retractConfirmTitle)
    }
}
