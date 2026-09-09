package com.poolpoker.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log

import android.webkit.WebSettings
import android.webkit.WebView
import androidx.annotation.Keep

@Keep
class MainActivity : TauriActivity() {

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        appContext = applicationContext

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

        BluetoothServerRelay.startListening(this)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 101) {
            BluetoothServerRelay.startListening(this)
        }
    }

    companion object {
        private lateinit var appContext: android.content.Context
        @JvmStatic @Keep fun saveAuthToken(server: String, token: String) { AuthTokenStore.save(appContext, server, token) }
        @JvmStatic @Keep fun loadAuthToken(server: String): String = AuthTokenStore.load(appContext, server)

        @JvmStatic
        private external fun nativeInitJni()

        @JvmStatic
        @Keep
        fun onNativeSyncWearState(payload: String) {
            Log.d("MainActivity", "Wear state received")
            BluetoothServerRelay.broadcastCredentials(payload)
        }
    }
}