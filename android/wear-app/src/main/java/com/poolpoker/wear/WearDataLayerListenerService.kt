package com.poolpoker.wear

import android.util.Log
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService
import com.poolpoker.shared.DataLayerConstants
import com.poolpoker.shared.WearSyncRoomPayload
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class WearDataLayerListenerService : WearableListenerService() {

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        super.onDataChanged(dataEvents)
        for (event in dataEvents) {
            if (event.type == DataEvent.TYPE_CHANGED && event.dataItem.uri.path == DataLayerConstants.PATH_SYNC_ROOM) {
                val dataMap = DataMapItem.fromDataItem(event.dataItem).dataMap
                val jsonStr = dataMap.getString("payload")
                if (jsonStr != null) {
                    val payload = WearSyncRoomPayload.fromJson(jsonStr)
                    if (payload != null) {
                        Log.d(TAG, "Wear OS state updated: room=${payload.roomCode}, cards=${payload.myCards.size}")
                        _roomStateFlow.value = payload
                    }
                }
            }
        }
    }

    companion object {
        private const val TAG = "WearDataLayerService"
        private val _roomStateFlow = MutableStateFlow<WearSyncRoomPayload?>(null)
        val roomStateFlow: StateFlow<WearSyncRoomPayload?> = _roomStateFlow.asStateFlow()

        fun updateStateManually(payload: WearSyncRoomPayload) {
            _roomStateFlow.value = payload
        }
    }
}
