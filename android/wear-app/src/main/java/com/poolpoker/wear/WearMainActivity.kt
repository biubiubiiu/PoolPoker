package com.poolpoker.wear

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.poolpoker.wear.ui.WearGameScreen
import com.poolpoker.wear.ui.theme.PoolPokerWearTheme
import kotlinx.coroutines.delay

class WearMainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Request Bluetooth Connect runtime permissions on Android 12+ (API 31+)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            val permissions = arrayOf(
                android.Manifest.permission.BLUETOOTH_CONNECT,
                android.Manifest.permission.BLUETOOTH_SCAN
            )
            val missing = permissions.filter {
                checkSelfPermission(it) != android.content.pm.PackageManager.PERMISSION_GRANTED
            }
            if (missing.isNotEmpty()) {
                requestPermissions(missing.toTypedArray(), 101)
            }
        }

        // Start Bluetooth RFCOMM listener for phone room credentials
        WearBluetoothClient.startListeningForPhoneCredentials(this)

        setContent {
            PoolPokerWearTheme {
                val roomState by WearDataLayerListenerService.roomStateFlow.collectAsState()

                // Keep screen awake for 2 minutes (120s) after entering room or on room state update
                LaunchedEffect(roomState) {
                    try {
                        if (roomState != null) {
                            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            delay(120_000L)
                        }
                    } finally {
                        // Also clear the flag on room changes or when composition is disposed.
                        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    }
                }

                WearGameScreen(roomState = roomState)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        WearDirectSocketManager.restoreSession(applicationContext)
    }

    override fun onDestroy() {
        super.onDestroy()
        WearBluetoothClient.stop()
    }
}
