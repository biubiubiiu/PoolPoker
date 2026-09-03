package com.poolpoker.wear

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.poolpoker.shared.RoomModel
import com.poolpoker.shared.WearPlayerSummary
import com.poolpoker.shared.WearSyncRoomPayload
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

object WearDirectSocketManager {
    private const val TAG = "WearDirectSocket"
    private var socket: Socket? = null

    var serverUrl: String = BuildConfig.SERVER_URL
    var userId: String = ""
    var userName: String = "Watch Player"
    var currentRoomCode: String? = null
    var isConnected: Boolean = false

    var onStatusChanged: ((String) -> Unit)? = null

    fun connect(context: Context, roomCode: String, url: String = BuildConfig.SERVER_URL, customUserId: String? = null, onConnected: () -> Unit = {}) {
        serverUrl = url
        currentRoomCode = roomCode
        userId = customUserId ?: WearUserPrefs.getOrCreateUserId(context)
        val configuredName = BuildConfig.WATCH_PLAYER_NAME
        userName = if (configuredName.isNotBlank()) configuredName else context.getString(R.string.watch_player_default)

        try {
            if (socket?.connected() == true) {
                socket?.disconnect()
            }

            val opts = IO.Options()
            opts.forceNew = true
            opts.reconnection = true
            opts.transports = arrayOf("websocket", "polling")

            socket = IO.socket(serverUrl, opts)

            socket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "Wear OS direct socket connected to $serverUrl")
                isConnected = true
                onStatusChanged?.invoke(context.getString(R.string.status_connected_direct))
                joinRoom(roomCode)
                onConnected()
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.d(TAG, "Wear OS direct socket disconnected")
                isConnected = false
                onStatusChanged?.invoke(context.getString(R.string.status_disconnected))
            }

            socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                Log.e(TAG, "Wear OS direct socket connect error: ${args.firstOrNull()}")
                isConnected = false
                val errReason = args.firstOrNull()?.toString() ?: context.getString(R.string.err_network_unreachable)
                onStatusChanged?.invoke(context.getString(R.string.status_failed_format, errReason))
            }

            socket?.on("room_updated") { args ->
                if (args.isNotEmpty()) {
                    val rawJson = args[0].toString()
                    try {
                        val room = Gson().fromJson(rawJson, RoomModel::class.java)
                        val myPlayer = room.players.find { it.userId == userId }
                        val currentTurnUserId = room.turnOrder.getOrNull(room.currentTurnIndex ?: 0)
                        val currentTurnPlayer = room.players.find { it.userId == currentTurnUserId }
                        val isMyTurn = (currentTurnUserId == userId)

                        val roundScoreMap = room.lastRoundScores.associate { it.userId to it.delta }
                        val playerSummaries = room.players.map { p ->
                            WearPlayerSummary(
                                userId = p.userId,
                                name = p.name,
                                avatar = p.avatar,
                                cardCount = p.cardCount,
                                cards = p.cards,
                                pocketedCards = p.pocketedCards,
                                isWinner = p.isWinner,
                                totalScore = p.totalScore,
                                scoreDelta = roundScoreMap[p.userId]
                            )
                        }

                        val payload = WearSyncRoomPayload(
                            roomCode = room.code,
                            status = room.status,
                            isMyTurn = isMyTurn,
                            currentTurnPlayerName = currentTurnPlayer?.name ?: "",
                            turnOrder = room.turnOrder,
                            myCards = myPlayer?.cards ?: emptyList(),
                            pocketedBallNumbers = room.pocketedBallNumbers,
                            winnerName = room.players.find { it.isWinner }?.name,
                            players = playerSummaries,
                            myPlayerName = myPlayer?.name ?: userName,
                            lastRoundScores = room.lastRoundScores,
                            lastActionText = room.lastActionText,
                            timestamp = System.currentTimeMillis()
                        )

                        // Update local StateFlow for Wear UI
                        WearDataLayerListenerService.updateStateManually(payload)
                    } catch (e: Exception) {
                        Log.e(TAG, "Error parsing direct room_updated", e)
                    }
                }
            }

            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Direct socket error", e)
            onStatusChanged?.invoke(context.getString(R.string.status_connect_failed_format, e.message ?: ""))
        }
    }

    private fun joinRoom(code: String) {
        val payload = JSONObject().apply {
            put("roomCode", code)
            put("userId", userId)
            put("name", userName)
            put("avatar", "⌚")
        }
        socket?.emit("join_room", payload)
    }

    fun pocketBall(roomCode: String, cardId: String) {
        if (socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("roomCode", roomCode)
                put("cardId", cardId)
            }
            socket?.emit("pocket_ball", payload)
        }
    }

    fun drawPenalty(roomCode: String) {
        if (socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("roomCode", roomCode)
            }
            socket?.emit("draw_penalty", payload)
        }
    }

    fun retractBall(roomCode: String) {
        if (socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("roomCode", roomCode)
            }
            socket?.emit("retract_ball", payload)
        }
    }

    fun accidentalPocket(roomCode: String, ballNumber: Int) {
        if (socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("roomCode", roomCode)
                put("ballNumber", ballNumber)
            }
            socket?.emit("accidental_pocket", payload)
        }
    }

    fun refereePocketBall(roomCode: String, targetUserId: String, ballNumber: Int) {
        if (socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("roomCode", roomCode)
                put("targetUserId", targetUserId)
                put("ballNumber", ballNumber)
            }
            socket?.emit("referee_pocket_ball", payload)
        }
    }

    fun refereeDrawPenalty(roomCode: String, targetUserId: String) {
        if (socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("roomCode", roomCode)
                put("targetUserId", targetUserId)
            }
            socket?.emit("referee_draw_penalty", payload)
        }
    }

    fun breakPocket(roomCode: String, ballNumber: Int) {
        if (socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("roomCode", roomCode)
                put("ballNumber", ballNumber)
            }
            socket?.emit("break_pocket", payload)
        }
    }

    fun disconnect() {
        try {
            if (socket?.connected() == true) {
                socket?.disconnect()
            }
            socket = null
            isConnected = false
            currentRoomCode = null
            WearDataLayerListenerService.clearState()
        } catch (e: Exception) {
            Log.e(TAG, "Error disconnecting socket", e)
        }
    }
}
