package com.poolpoker.wear

import android.content.Context
import java.util.UUID

object WearUserPrefs {
    private const val PREFS_NAME = "poolpoker_wear_prefs"
    private const val KEY_USER_ID = "user_id"

    fun getOrCreateUserId(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        var userId = prefs.getString(KEY_USER_ID, null)
        if (userId.isNullOrEmpty()) {
            userId = UUID.randomUUID().toString()
            prefs.edit().putString(KEY_USER_ID, userId).apply()
        }
        return userId
    }
    data class RoomSession(val serverUrl: String, val roomCode: String, val userId: String, val token: String)

    fun getRoomSession(context: Context): RoomSession? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val url = prefs.getString("session_server", null) ?: return null
        val room = prefs.getString("session_room", null) ?: return null
        val user = prefs.getString("session_user", null) ?: return null
        val token = runCatching { AuthTokenStore.load(context, url) }.getOrNull()?.takeIf { it.isNotBlank() } ?: return null
        return RoomSession(url, room, user, token)
    }

    fun saveRoomSession(context: Context, session: RoomSession) {
        AuthTokenStore.save(context, session.serverUrl, session.token)
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString("session_server", session.serverUrl)
            .putString("session_room", session.roomCode)
            .putString("session_user", session.userId)
            .putString(KEY_USER_ID, session.userId)
            .remove("session_token")
            .apply()
    }

    fun clearRoomSession(context: Context) {
        getRoomSession(context)?.let { AuthTokenStore.save(context, it.serverUrl, "") }
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .remove("session_server").remove("session_room")
            .remove("session_user").remove("session_token").apply()
    }
}
