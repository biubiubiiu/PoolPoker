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
}
