package com.poolpoker.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.poolpoker.wear.ui.WearGameScreen
import com.poolpoker.wear.ui.theme.PoolPokerWearTheme

class WearMainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            PoolPokerWearTheme {
                val roomState by WearDataLayerListenerService.roomStateFlow.collectAsState()
                WearGameScreen(roomState = roomState)
            }
        }
    }
}
