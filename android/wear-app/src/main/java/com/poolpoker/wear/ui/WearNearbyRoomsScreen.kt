package com.poolpoker.wear.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.Text
import com.poolpoker.shared.generated.NearbyRoom
import com.poolpoker.wear.R
import com.poolpoker.wear.WearDirectSocketManager
import com.poolpoker.wear.WearNearbyDiscovery

@Composable
fun WearNearbyRoomsScreen(onDismiss: () -> Unit) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var rooms by remember { mutableStateOf(emptyList<NearbyRoom>()) }
    val explanation = stringResource(R.string.nearby_explanation)
    val permissionMessage = stringResource(R.string.nearby_permission)
    var status by remember { mutableStateOf(explanation) }
    var session by remember { mutableStateOf<WearNearbyDiscovery?>(null) }
    var refresh by remember { mutableIntStateOf(0) }
    var joining by remember { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) refresh++
        else status = permissionMessage
    }
    fun permitted() = listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        .any { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }

    DisposableEffect(lifecycle, refresh, joining) {
        fun stop() { session?.close(); session = null; rooms = emptyList() }
        fun start() {
            if (session != null || joining || !permitted()) return
            session = WearNearbyDiscovery(context.applicationContext) { found, message ->
                rooms = found; status = message
            }.also { it.start() }
        }
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) start()
            if (event == Lifecycle.Event.ON_PAUSE) stop()
        }
        lifecycle.addObserver(observer)
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) start()
        onDispose { lifecycle.removeObserver(observer); stop() }
    }
    DisposableEffect(Unit) {
        val listener: (String) -> Unit = { status = it }
        WearDirectSocketManager.onStatusChanged = listener
        onDispose {
            if (WearDirectSocketManager.onStatusChanged === listener) WearDirectSocketManager.onStatusChanged = null
        }
    }
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize().background(Color.Black),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 36.dp)
    ) {
        item { Text(stringResource(R.string.nearby_title)) }
        item { Text(status) }
        items(rooms, key = { it.roomCode }) { room ->
            Card(onClick = {
                val fix = session?.position
                if (!joining && fix != null) {
                    joining = true
                    session?.close()
                    session = null
                    rooms = emptyList()
                    WearDirectSocketManager.connect(context, room.roomCode, discoveryPosition = fix)
                }
            }, modifier = Modifier.fillMaxWidth()) {
                Text(room.hostName)
                Text(stringResource(R.string.nearby_room, room.roomCode, room.playerCount, room.maxPlayers))
            }
        }
        if (!joining) item {
            Card(onClick = {
                if (permitted()) refresh++
                else permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
            }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.nearby_retry)) }
        }
        item {
            Card(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.btn_back_cancel)) }
        }
    }
}
