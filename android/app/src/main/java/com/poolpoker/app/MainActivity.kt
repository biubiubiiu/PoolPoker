package com.poolpoker.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle

import android.util.Log
import androidx.annotation.Keep

@Keep
class MainActivity : TauriActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            nativeInitJni()
            Log.d("MainActivity", "Successfully called nativeInitJni!")
        } catch (e: Throwable) {
            Log.e("MainActivity", "Failed to call nativeInitJni", e)
        }

        // Request Bluetooth Connect runtime permissions on Android 12+ (API 31+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val permissions = arrayOf(
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            )
            val missing = permissions.filter {
                checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
            }
            if (missing.isNotEmpty()) {
                requestPermissions(missing.toTypedArray(), 101)
            }
        }

        BluetoothServerRelay.startListening()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 101) {
            BluetoothServerRelay.startListening()
        }
    }

    companion object {
        @JvmStatic
        private external fun nativeInitJni()

        @JvmStatic
        @Keep
        fun onNativeSyncWearState(payload: String) {
            Log.d("MainActivity", "onNativeSyncWearState called: $payload")
            BluetoothServerRelay.broadcastCredentials(payload)
        }
    }
}