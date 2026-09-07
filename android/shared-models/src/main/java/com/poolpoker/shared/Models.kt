package com.poolpoker.shared

import com.poolpoker.shared.generated.*
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object SocketEvents {
    const val ROOM_CREATED = "room_created"
    const val ROOM_KICKED = "room_kicked"
    const val KICK_PLAYER = "kick_player"
    const val ROOM_UPDATED = "room_updated"
    const val ERROR_MESSAGE = "error_message"
    const val CREATE_ROOM = "create_room"
    const val JOIN_ROOM = "join_room"
    const val REJOIN_ROOM = "rejoin_room"
    const val UPDATE_SETTINGS = "update_settings"
    const val START_GAME = "start_game"
    const val POCKET_BALL = "pocket_ball"
    const val DRAW_PENALTY = "draw_penalty"
    const val ACCIDENTAL_POCKET = "accidental_pocket"
    const val BREAK_POCKET = "break_pocket"
    const val RETRACT_BALL = "retract_ball"
    const val REFEREE_POCKET_BALL = "referee_pocket_ball"
    const val REFEREE_DRAW_PENALTY = "referee_draw_penalty"
    const val REQUEST_RESTART = "request_restart"
    const val CONFIRM_RESTART = "confirm_restart"
    const val RESTART_GAME = "restart_game"
    const val LEAVE_ROOM = "leave_room"
}

object DataLayerConstants {
    const val PATH_SYNC_ROOM = "/poolpoker/sync_room"
    const val PATH_WEAR_ACTION = "/poolpoker/action"
}

// Global kotlinx.serialization Json instance configured with lenient parsing
val sharedJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    encodeDefaults = true
    coerceInputValues = true
}

// Serialization extension functions
fun WearSyncRoomPayload.toJson(): String = sharedJson.encodeToString(this)

fun WearSyncRoomPayload.Companion.fromJson(json: String): WearSyncRoomPayload? {
    return try {
        sharedJson.decodeFromString<WearSyncRoomPayload>(json)
    } catch (e: Exception) {
        null
    }
}

fun WearActionPayload.toJson(): String = sharedJson.encodeToString(this)

fun WearActionPayload.Companion.fromJson(json: String): WearActionPayload? {
    return try {
        sharedJson.decodeFromString<WearActionPayload>(json)
    } catch (e: Exception) {
        null
    }
}

fun Room.Companion.fromJson(json: String): Room? {
    return try {
        sharedJson.decodeFromString<Room>(json)
    } catch (e: Exception) {
        null
    }
}
