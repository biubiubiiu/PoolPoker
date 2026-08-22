package com.poolpoker.companion

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.google.gson.Gson
import com.poolpoker.shared.DataLayerConstants
import com.poolpoker.shared.RoomModel
import com.poolpoker.shared.WearAction
import com.poolpoker.shared.WearActionPayload
import com.poolpoker.shared.WearPlayerSummary
import com.poolpoker.shared.WearSyncRoomPayload
import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.util.UUID

object CompanionSocketManager {
    private const val TAG = "CompanionSocket"
    private var socket: Socket? = null

    var serverUrl: String = BuildConfig.SERVER_URL
    var userId: String = ""
    var userName: String = "Phone Companion"
    var currentRoomCode: String? = null
    var sessionToken: String? = null
    var latestRoomState: RoomModel? = null

    var onStatusChanged: ((String) -> Unit)? = null
    var onRoomUpdated: ((RoomModel) -> Unit)? = null

    private fun getOrCreateUserId(context: Context): String {
        val prefs = context.getSharedPreferences("poolpoker_companion_prefs", Context.MODE_PRIVATE)
        var id = prefs.getString("user_id", null)
        if (id.isNullOrEmpty()) {
            id = UUID.randomUUID().toString()
            prefs.edit().putString("user_id", id).apply()
        }
        return id
    }

    fun connect(context: Context, url: String, name: String, onConnected: () -> Unit = {}) {
        serverUrl = url
        userName = name.ifBlank { context.getString(R.string.default_companion_name) }
        userId = getOrCreateUserId(context)
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
                Log.d(TAG, "Socket connected to $serverUrl")
                onStatusChanged?.invoke(context.getString(R.string.status_connected_url, serverUrl))
                onConnected()
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.d(TAG, "Socket disconnected")
                onStatusChanged?.invoke(context.getString(R.string.status_disconnected))
            }

            socket?.on("room_created") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0] as JSONObject
                    currentRoomCode = data.optString("roomCode")
                    onStatusChanged?.invoke(context.getString(R.string.status_room_created, currentRoomCode ?: ""))
                }
            }

            socket?.on("room_updated") { args ->
                if (args.isNotEmpty()) {
                    val rawJson = args[0].toString()
                    try {
                        val room = Gson().fromJson(rawJson, RoomModel::class.java)
                        latestRoomState = room
                        onRoomUpdated?.invoke(room)
                        syncStateToWearOS(context, room)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to parse room_updated", e)
                    }
                }
            }

            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Socket connection error", e)
            onStatusChanged?.invoke(context.getString(R.string.status_connect_error, e.message ?: ""))
        }
    }

    fun createRoom(ballConfigKey: String = "default") {
        val payload = JSONObject().apply {
            put("userId", userId)
            put("name", userName)
            put("avatar", "🎱")
            put("ballConfigKey", ballConfigKey)
        }
        socket?.emit("create_room", arrayOf<Any>(payload), Ack { ackArgs ->
            if (ackArgs.isNotEmpty()) {
                val res = ackArgs[0] as JSONObject
                if (res.optBoolean("success")) {
                    currentRoomCode = res.optString("roomCode")
                    sessionToken = res.optString("sessionToken")
                }
            }
        })
    }

    fun joinRoom(code: String) {
        currentRoomCode = code
        val payload = JSONObject().apply {
            put("roomCode", code)
            put("userId", userId)
            put("name", userName)
            put("avatar", "🎱")
        }
        socket?.emit("join_room", arrayOf<Any>(payload), Ack { ackArgs ->
            if (ackArgs.isNotEmpty()) {
                val res = ackArgs[0] as JSONObject
                if (res.optBoolean("success")) {
                    sessionToken = res.optString("sessionToken")
                }
            }
        })
    }

    fun startGame() {
        val code = currentRoomCode ?: return
        val payload = JSONObject().apply {
            put("roomCode", code)
        }
        socket?.emit("start_game", payload)
    }

    fun pocketBall(cardId: String) {
        val code = currentRoomCode ?: return
        val payload = JSONObject().apply {
            put("roomCode", code)
            put("cardId", cardId)
        }
        socket?.emit("pocket_ball", payload)
    }

    fun drawPenalty() {
        val code = currentRoomCode ?: return
        val payload = JSONObject().apply {
            put("roomCode", code)
        }
        socket?.emit("draw_penalty", payload)
    }

    fun retractBall() {
        val code = currentRoomCode ?: return
        val payload = JSONObject().apply {
            put("roomCode", code)
        }
        socket?.emit("retract_ball", payload)
    }

    fun refereePocketBall(targetUserId: String, ballNumber: Int) {
        val code = currentRoomCode ?: return
        val payload = JSONObject().apply {
            put("roomCode", code)
            put("targetUserId", targetUserId)
            put("ballNumber", ballNumber)
        }
        socket?.emit("referee_pocket_ball", payload)
    }

    fun refereeDrawPenalty(targetUserId: String) {
        val code = currentRoomCode ?: return
        val payload = JSONObject().apply {
            put("roomCode", code)
            put("targetUserId", targetUserId)
        }
        socket?.emit("referee_draw_penalty", payload)
    }

    fun accidentalPocket(ballNumber: Int) {
        val code = currentRoomCode ?: return
        val payload = JSONObject().apply {
            put("roomCode", code)
            put("ballNumber", ballNumber)
        }
        socket?.emit("accidental_pocket", payload)
    }

    fun handleWearAction(action: WearActionPayload) {
        Log.d(TAG, "Received action from Wear OS: ${action.action}")
        when (action.action) {
            WearAction.POCKET_BALL -> action.cardId?.let { pocketBall(it) }
            WearAction.DRAW_PENALTY -> drawPenalty()
            WearAction.RETRACT_BALL -> retractBall()
            WearAction.ACCIDENTAL_POCKET -> action.ballNumber?.let { accidentalPocket(it) }
            WearAction.REFEREE_POCKET_BALL -> {
                val targetUserId = action.targetUserId
                val ballNumber = action.ballNumber
                if (targetUserId != null && ballNumber != null) {
                    refereePocketBall(targetUserId, ballNumber)
                }
            }
            WearAction.REFEREE_DRAW_PENALTY -> {
                val targetUserId = action.targetUserId
                if (targetUserId != null) {
                    refereeDrawPenalty(targetUserId)
                }
            }
        }
    }

    private fun syncStateToWearOS(context: Context, room: RoomModel) {
        try {
            val myPlayer = room.players.find { it.userId == userId }
            val currentTurnUserId = room.turnOrder.getOrNull(room.currentTurnIndex ?: 0)
            val currentTurnPlayer = room.players.find { it.userId == currentTurnUserId }
            val isMyTurn = (currentTurnUserId == userId)

            val playerSummaries = room.players.map { p ->
                WearPlayerSummary(
                    userId = p.userId,
                    name = p.name,
                    avatar = p.avatar,
                    cardCount = p.cardCount
                )
            }

            val syncPayload = WearSyncRoomPayload(
                roomCode = room.code,
                status = room.status,
                isMyTurn = isMyTurn,
                currentTurnPlayerName = currentTurnPlayer?.name ?: "",
                myCards = myPlayer?.cards ?: emptyList(),
                pocketedBallNumbers = room.pocketedBallNumbers,
                winnerName = room.players.find { it.isWinner }?.name,
                players = playerSummaries,
                myPlayerName = myPlayer?.name ?: userName,
                timestamp = System.currentTimeMillis()
            )

            val putDataMapReq = PutDataMapRequest.create(DataLayerConstants.PATH_SYNC_ROOM)
            putDataMapReq.dataMap.putString("payload", syncPayload.toJson())
            putDataMapReq.dataMap.putLong("timestamp", System.currentTimeMillis())
            val putDataReq = putDataMapReq.asPutDataRequest()
            putDataReq.setUrgent()

            Wearable.getDataClient(context.applicationContext).putDataItem(putDataReq).addOnSuccessListener {
                Log.d(TAG, "Successfully synced state to Wear OS DataLayer")
            }.addOnFailureListener { e ->
                Log.w(TAG, "Failed to sync to Wear OS DataLayer", e)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error syncing to Wear OS", e)
        }
    }
}
