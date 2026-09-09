package com.poolpoker.wear

import android.content.Context
import android.util.Log
import android.widget.Toast
import com.poolpoker.shared.SocketEvents
import com.poolpoker.shared.fromJson
import com.poolpoker.shared.generated.Room
import com.poolpoker.shared.generated.WearPlayerSummary
import com.poolpoker.shared.generated.WearSyncRoomPayload
import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

object WearDirectSocketManager {
    private const val TAG = "WearDirectSocket"
    @Volatile private var socket: Socket? = null
    // Process-owned dispatcher: the room connection survives Activity recreation.
    private val managerScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var connectionScope: CoroutineScope? = null
    private var appContext: Context? = null
    private var joinTimeout: Job? = null
    private var sessionToken: String? = null
    private val transportAuth = mutableMapOf<String, String>()
    var lastStatus: String? = null
        private set

    private fun status(message: String) {
        lastStatus = message
        onStatusChanged?.invoke(message)
    }

    fun restoreSession(context: Context) {
        if (socket != null) return
        val saved = WearUserPrefs.getRoomSession(context) ?: return
        connect(context, saved.roomCode, saved.serverUrl, saved.userId)
    }

    fun ensureRoomConnection(context: Context): Boolean {
        if (isConnected && socket?.connected() == true) return true
        Toast.makeText(context, R.string.status_reconnecting_retry, Toast.LENGTH_LONG).show()
        if (socket == null) restoreSession(context) else socket?.connect()
        return false
    }

    var serverUrl: String = BuildConfig.SERVER_URL
    var userId: String = ""
    var userName: String = "Watch Player"
    var currentRoomCode: String? = null
    @Volatile var isConnected: Boolean = false

    var onStatusChanged: ((String) -> Unit)? = null

    fun connect(
        context: Context,
        roomCode: String,
        url: String = BuildConfig.SERVER_URL,
        customUserId: String? = null,
        customSessionToken: String? = null,
        onConnected: () -> Unit = {}
    ) {
        val application = context.applicationContext
        managerScope.launch {
            connectOnMain(application, roomCode, url, customUserId, customSessionToken, onConnected)
        }
    }

    private fun connectOnMain(
        context: Context,
        roomCode: String,
        url: String,
        customUserId: String?,
        customSessionToken: String?,
        onConnected: () -> Unit
    ) {
        connectionScope?.cancel()
        connectionScope = CoroutineScope(managerScope.coroutineContext + SupervisorJob(managerScope.coroutineContext[Job]))
        appContext = context.applicationContext
        joinTimeout?.cancel()
        socket?.off()
        socket?.disconnect()
        socket = null
        isConnected = false
        serverUrl = url
        currentRoomCode = roomCode
        userId = customUserId ?: WearUserPrefs.getOrCreateUserId(context)
        sessionToken = customSessionToken?.takeIf { it.isNotBlank() } ?: WearUserPrefs.getRoomSession(context)?.takeIf {
            it.serverUrl == url && it.roomCode == roomCode && it.userId == userId
        }?.token
        status(context.getString(R.string.status_connecting))
        val configuredName = BuildConfig.WATCH_PLAYER_NAME
        userName = if (configuredName.isNotBlank()) configuredName else context.getString(R.string.watch_player_default)

        if (sessionToken == null) {
            connectionScope?.launch {
                try {
                    val result = withContext(Dispatchers.IO) {
                        val connection = java.net.URL("${url.trimEnd('/')}/api/auth/guest").openConnection() as java.net.HttpURLConnection
                        try {
                            connection.requestMethod = "POST"
                            connection.connectTimeout = 5000
                            connection.readTimeout = 5000
                            connection.doOutput = true
                            connection.setRequestProperty("Content-Type", "application/json")
                            connection.setRequestProperty("X-PoolPoker-Request", "1")
                            connection.setRequestProperty("X-PoolPoker-Native", "1")
                            connection.outputStream.use { it.write(JSONObject().put("nickname", userName).put("deviceName", "Wear OS").toString().toByteArray()) }
                            JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                        } finally { connection.disconnect() }
                    }
                    val id = result.getJSONObject("user").getString("id")
                    val token = result.getString("token")
                    WearUserPrefs.saveRoomSession(context, WearUserPrefs.RoomSession(url, roomCode, id, token))
                    connect(context, roomCode, url, id, token, onConnected)
                } catch (e: Exception) { status("游客登录失败，请重试") }
            }
            return
        }
        try {
            val opts = IO.Options()
            transportAuth.clear()
            sessionToken?.let { transportAuth[if (it.length == 36) "companionTicket" else "token"] = it }
            opts.auth = transportAuth
            opts.forceNew = true
            opts.reconnection = true
            opts.transports = arrayOf("websocket", "polling")

            val activeSocket = IO.socket(serverUrl, opts)
            socket = activeSocket

            listen(activeSocket, Socket.EVENT_CONNECT) {
                Log.d(TAG, "Wear OS direct socket connected to $serverUrl")
                if (socket !== activeSocket) return@listen
                isConnected = false
                status(context.getString(R.string.status_restoring_room))
                joinRoom(context.applicationContext, activeSocket, roomCode, onConnected)
            }

            listen(activeSocket, Socket.EVENT_DISCONNECT) {
                if (socket !== activeSocket) return@listen
                joinTimeout?.cancel()
                Log.d(TAG, "Wear OS direct socket disconnected: ${it.firstOrNull()}")
                isConnected = false
                status(context.getString(R.string.status_disconnected))
            }

            listen(activeSocket, Socket.EVENT_CONNECT_ERROR) { args ->
                if (socket !== activeSocket) return@listen
                Log.e(TAG, "Wear OS direct socket connect error: ${args.firstOrNull()}")
                isConnected = false
                val errReason = args.firstOrNull()?.toString() ?: context.getString(R.string.err_network_unreachable)
                status(context.getString(R.string.status_failed_format, errReason))
            }

            listen(activeSocket, SocketEvents.ROOM_KICKED) { args ->
                if (socket !== activeSocket) return@listen
                val code = (args.firstOrNull() as? JSONObject)?.optString("roomCode")
                if (code != currentRoomCode) return@listen
                disconnect()
                status(context.getString(R.string.status_room_kicked))
            }

            listen(activeSocket, SocketEvents.ROOM_UPDATED) { args ->
                if (socket !== activeSocket) return@listen
                if (args.isNotEmpty()) {
                    val rawJson = args[0].toString()
                    try {
                        val room = Room.fromJson(rawJson) ?: return@listen
                        if (room.code != currentRoomCode) return@listen
                        val myPlayer = room.players.find { it.userId == userId } ?: return@listen
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
                            myCards = myPlayer.cards,
                            pocketedBallNumbers = room.pocketedBallNumbers,
                            winnerName = room.players.find { it.isWinner }?.name,
                            players = playerSummaries,
                            myPlayerName = myPlayer.name,
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

            activeSocket.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Direct socket error", e)
            status(context.getString(R.string.status_connect_failed_format, e.message ?: ""))
        }
    }

    private fun listen(activeSocket: Socket, event: String, listener: (Array<out Any>) -> Unit) {
        val scope = connectionScope ?: return
        activeSocket.on(event, Emitter.Listener { args ->
            scope.launch {
                if (socket === activeSocket) listener(args)
            }
        })
    }

    private fun joinRoom(context: Context, activeSocket: Socket, code: String, onConnected: () -> Unit) {
        val token = sessionToken
        val payload = JSONObject().apply {
            put("roomCode", code)
            put("userId", userId)
            if (token != null) {
                put("sessionToken", token)
            } else {
                put("name", userName)
                put("avatar", "⌚")
            }
        }
        val scope = connectionScope ?: return
        joinTimeout?.cancel()
        val timeout = scope.launch {
            delay(15_000L)
            if (socket === activeSocket && !isConnected) {
                status(context.getString(R.string.status_room_timeout))
                // Replace the transport so a late acknowledgement cannot authorize an old socket.
                connect(context, code, serverUrl, userId, sessionToken, onConnected)
            }
        }
        joinTimeout = timeout
        activeSocket.emit(SocketEvents.JOIN_ROOM, payload, Ack { args ->
            scope.launch {
                if (socket !== activeSocket || !activeSocket.connected()) return@launch
                timeout.cancel()
                val response = args.firstOrNull() as? JSONObject
                if (response?.optBoolean("success") != true) {
                    isConnected = false
                    val message = response?.optString("message")?.takeIf { it.isNotBlank() }
                        ?: context.getString(R.string.status_room_failed)
                    status(message)
                    // Keep the credential for a deliberate retry; never bypass failed authentication.
                    WearDataLayerListenerService.clearState()
                    return@launch
                }
                val receivedToken = response.optString("sessionToken").takeIf { it.isNotBlank() } ?: sessionToken
                if (receivedToken == null) {
                    status(context.getString(R.string.status_room_failed))
                    return@launch
                }
                sessionToken = receivedToken
                transportAuth.clear()
                transportAuth["token"] = receivedToken
                WearUserPrefs.saveRoomSession(context, WearUserPrefs.RoomSession(serverUrl, code, userId, receivedToken))
                isConnected = true
                status(context.getString(R.string.status_connected_direct))
                onConnected()
            }
        })
    }

    fun pocketBall(roomCode: String, cardId: String) {
        if (isConnected && socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("commandId", java.util.UUID.randomUUID().toString())
                put("roomCode", roomCode)
                put("cardId", cardId)
            }
            socket?.emit(SocketEvents.POCKET_BALL, payload)
        }
    }

    fun drawPenalty(roomCode: String) {
        if (isConnected && socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("commandId", java.util.UUID.randomUUID().toString())
                put("roomCode", roomCode)
            }
            socket?.emit(SocketEvents.DRAW_PENALTY, payload)
        }
    }

    fun retractBall(roomCode: String) {
        if (isConnected && socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("commandId", java.util.UUID.randomUUID().toString())
                put("roomCode", roomCode)
            }
            socket?.emit(SocketEvents.RETRACT_BALL, payload)
        }
    }

    fun accidentalPocket(roomCode: String, ballNumber: Int) {
        if (isConnected && socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("commandId", java.util.UUID.randomUUID().toString())
                put("roomCode", roomCode)
                put("ballNumber", ballNumber)
            }
            socket?.emit(SocketEvents.ACCIDENTAL_POCKET, payload)
        }
    }

    fun refereePocketBall(roomCode: String, targetUserId: String, ballNumber: Int) {
        if (isConnected && socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("commandId", java.util.UUID.randomUUID().toString())
                put("roomCode", roomCode)
                put("targetUserId", targetUserId)
                put("ballNumber", ballNumber)
            }
            socket?.emit(SocketEvents.REFEREE_POCKET_BALL, payload)
        }
    }

    fun refereeDrawPenalty(roomCode: String, targetUserId: String) {
        if (isConnected && socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("commandId", java.util.UUID.randomUUID().toString())
                put("roomCode", roomCode)
                put("targetUserId", targetUserId)
            }
            socket?.emit(SocketEvents.REFEREE_DRAW_PENALTY, payload)
        }
    }

    fun breakPocket(roomCode: String, ballNumber: Int) {
        if (isConnected && socket?.connected() == true) {
            val payload = JSONObject().apply {
                put("commandId", java.util.UUID.randomUUID().toString())
                put("roomCode", roomCode)
                put("ballNumber", ballNumber)
            }
            socket?.emit(SocketEvents.BREAK_POCKET, payload)
        }
    }

    fun disconnect() {
        managerScope.launch {
            connectionScope?.cancel()
            connectionScope = null
            joinTimeout = null
            socket?.off()
            socket?.disconnect()
            socket = null
            isConnected = false
            currentRoomCode = null
            sessionToken = null
            lastStatus = null
            appContext?.let { WearUserPrefs.clearRoomSession(it) }
            WearDataLayerListenerService.clearState()
        }
    }
}
