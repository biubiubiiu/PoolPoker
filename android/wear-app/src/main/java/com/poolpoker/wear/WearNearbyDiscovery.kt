package com.poolpoker.wear

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import com.poolpoker.shared.SocketEvents
import com.poolpoker.shared.generated.DiscoveryMode
import com.poolpoker.shared.generated.DiscoveryPosition
import com.poolpoker.shared.generated.NearbyRoom
import com.poolpoker.shared.sharedJson
import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.*
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import org.json.JSONObject

/** A foreground-only, disposable discovery session. Never persists or logs coordinates. */
class WearNearbyDiscovery(private val context: Context, private val changed: (List<NearbyRoom>, String) -> Unit) {
    private val locations = context.getSystemService(LocationManager::class.java)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var socket: Socket? = null
    private var expiry: Job? = null
    private var timeout: Job? = null
    private var listening = false
    private var closed = false
    var position: DiscoveryPosition? = null
        private set

    private fun message(id: Int) = changed(emptyList(), context.getString(id))
    private val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) = accept(location)
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {
            if (position == null) message(R.string.nearby_location_disabled)
        }
        @Deprecated("Legacy Android callback")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }

    fun start() {
        try {
            val active = IO.socket(BuildConfig.SERVER_URL, IO.Options().apply { forceNew = true })
            socket = active
            active.on(Socket.EVENT_CONNECT) { scope.launch { publish() } }
            active.on(Socket.EVENT_DISCONNECT) { scope.launch { message(R.string.status_disconnected) } }
            active.on(Socket.EVENT_CONNECT_ERROR) { scope.launch { message(R.string.err_network_unreachable) } }
            active.on(SocketEvents.NEARBY_ROOMS) { args ->
                scope.launch {
                    if (position == null || !active.connected()) return@launch
                    val rooms = runCatching { sharedJson.decodeFromString<List<NearbyRoom>>(args.first().toString()) }.getOrNull()
                    if (rooms != null) changed(rooms, context.getString(if (rooms.isEmpty()) R.string.nearby_empty else R.string.nearby_choose))
                }
            }
            active.connect()
            locate()
        } catch (_: Exception) {
            message(R.string.nearby_failed)
        }
    }

    @SuppressLint("MissingPermission") // Permission is requested by the foreground screen; revocation is caught.
    private fun locate() {
        if (closed) return
        position = null
        message(R.string.nearby_locating)
        try {
            val providers = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
                .filter { locations.isProviderEnabled(it) }
            if (providers.isEmpty()) {
                message(R.string.nearby_location_disabled)
                return
            }
            listening = true
            var registered = false
            for (provider in providers) {
                try {
                    locations.requestLocationUpdates(provider, 1_100L, 0f, listener, Looper.getMainLooper())
                    registered = true
                } catch (_: SecurityException) { /* Coarse permission may allow only the network provider. */ }
            }
            if (!registered) {
                stopLocation()
                message(R.string.nearby_permission)
                return
            }
            for (provider in providers) {
                try { locations.getLastKnownLocation(provider)?.let { accept(it) } } catch (_: SecurityException) {}
                if (position != null) break
            }
            if (position == null) timeout = scope.launch {
                delay(30_000)
                stopLocation()
                message(R.string.nearby_timeout)
            }
        } catch (_: SecurityException) {
            stopLocation()
            message(R.string.nearby_permission)
        } catch (_: IllegalArgumentException) {
            stopLocation()
            message(R.string.nearby_location_disabled)
        }
    }

    private fun accept(location: Location) {
        if (closed || !listening) return
        val age = System.currentTimeMillis() - location.time
        if (!location.hasAccuracy() || !location.accuracy.isFinite() || location.accuracy !in 0f..300f) {
            message(R.string.nearby_accuracy)
            return
        }
        if (age !in 0L until 60_000L || !location.latitude.isFinite() || !location.longitude.isFinite()) return
        position = DiscoveryPosition(location.accuracy.toDouble(), location.latitude, location.longitude,
            DiscoveryMode.BROWSE, location.time.toDouble())
        stopLocation()
        publish()
        expiry?.cancel()
        expiry = scope.launch {
            delay(60_000L - age)
            socket?.emit(SocketEvents.DISCOVERY_STOP)
            locate()
        }
    }

    private fun publish() {
        val fix = position ?: return
        val active = socket ?: return
        if (!active.connected()) return
        message(R.string.nearby_searching)
        active.emit(SocketEvents.DISCOVERY_UPDATE, JSONObject(sharedJson.encodeToString(fix)), Ack { args ->
            scope.launch {
                val response = args.firstOrNull() as? JSONObject
                if (response?.optBoolean("success") != true) {
                    changed(emptyList(), response?.optString("message")?.takeIf { it.isNotBlank() }
                        ?: context.getString(R.string.nearby_failed))
                }
            }
        })
    }

    private fun stopLocation() {
        listening = false
        timeout?.cancel()
        timeout = null
        runCatching { locations.removeUpdates(listener) }
    }

    fun close() {
        closed = true
        stopLocation()
        expiry?.cancel()
        position = null
        socket?.emit(SocketEvents.DISCOVERY_STOP)
        socket?.off()
        socket?.disconnect()
        socket = null
        scope.cancel()
    }
}
