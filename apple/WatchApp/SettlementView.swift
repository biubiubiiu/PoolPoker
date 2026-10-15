import SwiftUI

struct SettlementView: View {
    let room: Room
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(WatchStrings.gameOverTitle).font(.headline).foregroundStyle(.yellow)
            ForEach(room.players, id: \.userId) { player in
                VStack(alignment: .leading, spacing: 5) {
                    Text("\(player.avatar) \(player.name)\(player.isWinner ? WatchStrings.winnerSuffix : "")").font(.headline)
                    let delta = room.lastRoundScores.first { $0.userId == player.userId }?.delta
                    if let delta { Text(WatchStrings.roundScoreDeltaTotal(delta: delta, total: player.totalScore)).font(.caption) }
                    else { Text(WatchStrings.totalScoreOnly(total: player.totalScore)).font(.caption) }
                    cardGroup(WatchStrings.categoryCleared, cards: player.pocketedCards)
                    cardGroup(WatchStrings.categoryFree, cards: player.cards.filter { room.pocketedBallNumbers.contains($0.ballNumber) }, isStrikethrough: true)
                    let remaining = player.cards.filter { !room.pocketedBallNumbers.contains($0.ballNumber) }
                    if !remaining.isEmpty {
                        Text(WatchStrings.categoryRemaining).font(.caption).foregroundStyle(.orange)
                        ForEach(remaining, id: \.id) { card in
                            let count = remaining.filter { $0.rank == card.rank }.count
                            let base = card.suitType == .jokerBig || card.suitType == .jokerSmall ? 1 : 2
                            Text(WatchStrings.remainingCardDetail(suit: card.suit, rank: card.rank, ballNumber: card.ballNumber, penalty: base * count)).font(.caption2)
                        }
                    }
                }
                Divider()
            }
        }
    }
    @ViewBuilder private func cardGroup(_ title: String, cards: [Card], isStrikethrough: Bool = false) -> some View {
        if !cards.isEmpty {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(cards.map { "\($0.suit)\($0.rank)·\($0.ballNumber)" }.joined(separator: " ")).font(.caption2)
                .strikethrough(isStrikethrough)
        }
    }
}
