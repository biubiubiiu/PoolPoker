package com.poolpoker.shared

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName

enum class SuitType(val value: String) {
    @SerializedName("spade") SPADE("spade"),
    @SerializedName("heart") HEART("heart"),
    @SerializedName("club") CLUB("club"),
    @SerializedName("diamond") DIAMOND("diamond"),
    @SerializedName("joker-small") JOKER_SMALL("joker-small"),
    @SerializedName("joker-big") JOKER_BIG("joker-big")
}

enum class CardColor(val value: String) {
    @SerializedName("black") BLACK("black"),
    @SerializedName("red") RED("red"),
    @SerializedName("gold") GOLD("gold"),
    @SerializedName("gray") GRAY("gray")
}

enum class RoomStatus(val value: String) {
    @SerializedName("waiting") WAITING("waiting"),
    @SerializedName("playing") PLAYING("playing"),
    @SerializedName("ended") ENDED("ended"),
    @SerializedName("finished") FINISHED("finished"),
    @SerializedName("lobby") LOBBY("lobby")
}

enum class WearAction(val value: String) {
    @SerializedName("POCKET_BALL") POCKET_BALL("POCKET_BALL"),
    @SerializedName("DRAW_PENALTY") DRAW_PENALTY("DRAW_PENALTY"),
    @SerializedName("RETRACT_BALL") RETRACT_BALL("RETRACT_BALL"),
    @SerializedName("ACCIDENTAL_POCKET") ACCIDENTAL_POCKET("ACCIDENTAL_POCKET"),
    @SerializedName("REFEREE_POCKET_BALL") REFEREE_POCKET_BALL("REFEREE_POCKET_BALL"),
    @SerializedName("REFEREE_DRAW_PENALTY") REFEREE_DRAW_PENALTY("REFEREE_DRAW_PENALTY")
}

object DataLayerConstants {
    const val PATH_SYNC_ROOM = "/poolpoker/sync_room"
    const val PATH_WEAR_ACTION = "/poolpoker/action"
}

data class CardModel(
    val id: String,
    val suit: String,
    val suitType: SuitType,
    val color: CardColor,
    val rank: String,
    val ballNumber: Int
)

data class PlayerModel(
    val id: String,
    val userId: String,
    val name: String,
    val avatar: String,
    val isHost: Boolean,
    val online: Boolean,
    val cardCount: Int,
    val activeCardCount: Int,
    val cards: List<CardModel> = emptyList(),
    val pocketedCards: List<CardModel> = emptyList(),
    val wins: Int = 0,
    val isWinner: Boolean = false,
    val totalScore: Int = 0
)

data class WearPlayerSummary(
    val userId: String,
    val name: String,
    val avatar: String,
    val cardCount: Int = 0
)

data class RoomSettingsModel(
    val cardsPerPlayer: Int = 5,
    val maxPlayers: Int = 8,
    val includeBlackEight: Boolean = true,
    val ballConfigKey: String = "default"
)

data class RoomModel(
    val code: String,
    val hostUserId: String,
    val status: RoomStatus,
    val players: List<PlayerModel> = emptyList(),
    val turnOrder: List<String> = emptyList(),
    val currentTurnIndex: Int? = null,
    val pocketedBallNumbers: List<Int> = emptyList(),
    val roundCount: Int = 0,
    val deckCount: Int = 0,
    val settings: RoomSettingsModel = RoomSettingsModel()
)

// Sync payload sent over Wear OS Data Layer API
data class WearSyncRoomPayload(
    val roomCode: String,
    val status: RoomStatus,
    val isMyTurn: Boolean,
    val currentTurnPlayerName: String,
    val myCards: List<CardModel>,
    val pocketedBallNumbers: List<Int>,
    val winnerName: String? = null,
    val players: List<WearPlayerSummary> = emptyList(),
    val myPlayerName: String? = null,
    val timestamp: Long = System.currentTimeMillis()
) {
    fun toJson(): String = Gson().toJson(this)

    companion object {
        fun fromJson(json: String): WearSyncRoomPayload? {
            return try {
                Gson().fromJson(json, WearSyncRoomPayload::class.java)
            } catch (e: Exception) {
                null
            }
        }
    }
}

// Action payload sent from Wear OS back to Phone Companion
data class WearActionPayload(
    val action: WearAction,
    val roomCode: String,
    val cardId: String? = null,
    val ballNumber: Int? = null,
    val targetUserId: String? = null
) {
    fun toJson(): String = Gson().toJson(this)

    companion object {
        fun fromJson(json: String): WearActionPayload? {
            return try {
                Gson().fromJson(json, WearActionPayload::class.java)
            } catch (e: Exception) {
                null
            }
        }
    }
}
