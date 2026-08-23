package com.poolpoker.app

import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import com.poolpoker.shared.DataLayerConstants
import com.poolpoker.shared.WearActionPayload

class WearableDataLayerService : WearableListenerService() {

    override fun onMessageReceived(messageEvent: MessageEvent) {
        super.onMessageReceived(messageEvent)
        Log.d(TAG, "Message received from Wear OS: ${messageEvent.path}")

        if (messageEvent.path == DataLayerConstants.PATH_WEAR_ACTION) {
            val jsonStr = String(messageEvent.data, Charsets.UTF_8)
            val actionPayload = WearActionPayload.fromJson(jsonStr)
            if (actionPayload != null) {
                Log.d(TAG, "Received Wear OS Action: ${actionPayload.action}")
            }
        }
    }

    companion object {
        private const val TAG = "WearableDataLayer"
    }
}
