package com.poolpoker.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.filled.Check
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.Text
import com.poolpoker.wear.BuildConfig
import com.poolpoker.wear.R
import com.poolpoker.wear.WearDirectSocketManager
import com.poolpoker.wear.ui.theme.PoolPokerColors

@Composable
fun WearDirectConnectScreen() {
    var roomCode by remember { mutableStateOf("") }
    val serverUrl = BuildConfig.SERVER_URL
    val context = LocalContext.current
    var statusText by remember { mutableStateOf(context.getString(R.string.status_waiting_companion)) }

    DisposableEffect(Unit) {
        WearDirectSocketManager.onStatusChanged = { status ->
            statusText = status
        }
        onDispose {
            WearDirectSocketManager.onStatusChanged = null
        }
    }

    ScalingLazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = PaddingValues(top = 36.dp, bottom = 36.dp, start = 12.dp, end = 12.dp)
    ) {
        // Title Header
        item {
            ListHeader {
                Text(
                    text = stringResource(R.string.direct_connect_title),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = PoolPokerColors.PoolGold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // Subtitle / Status
        item {
            Text(
                text = statusText,
                fontSize = 10.sp,
                color = Color.LightGray,
                textAlign = TextAlign.Center,
                maxLines = 1,
                modifier = Modifier.padding(vertical = 2.dp)
            )
        }

        // 4-Digit Code Slots
        item {
            Row(
                modifier = Modifier.padding(vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally)
            ) {
                for (i in 0 until 4) {
                    val digit = roomCode.getOrNull(i)?.toString() ?: "_"
                    Box(
                        modifier = Modifier
                            .size(width = 28.dp, height = 32.dp)
                            .background(PoolPokerColors.NumpadSlotBg, shape = RoundedCornerShape(6.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = digit,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (digit != "_") PoolPokerColors.PoolGold else Color.Gray
                        )
                    }
                }
            }
        }

        // NumPad Keys (4 rows x 3 columns)
        val numPadKeys = listOf(
            listOf("1", "2", "3"),
            listOf("4", "5", "6"),
            listOf("7", "8", "9"),
            listOf("⌫", "0", "✓")
        )

        numPadKeys.forEach { row ->
            item {
                Row(
                    modifier = Modifier.padding(vertical = 2.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)
                ) {
                    row.forEach { key ->
                        val isConfirm = key == "✓"
                        val isBackspace = key == "⌫"
                        val keyBgColor = when {
                            isConfirm -> PoolPokerColors.NumpadConfirmGreen
                            isBackspace -> PoolPokerColors.NumpadBackspaceRed
                            else -> PoolPokerColors.PoolGold
                        }

                        Box(
                            modifier = Modifier
                                .size(width = 42.dp, height = 30.dp)
                                .background(keyBgColor, shape = RoundedCornerShape(15.dp))
                                .clickable {
                                    triggerVibration(context)
                                    when (key) {
                                        "⌫" -> if (roomCode.isNotEmpty()) roomCode = roomCode.dropLast(1)
                                        "✓" -> {
                                            if (roomCode.length == 4) {
                                                statusText = context.getString(R.string.status_connecting)
                                                WearDirectSocketManager.connect(context, roomCode, serverUrl)
                                            }
                                        }
                                        else -> {
                                            if (roomCode.length < 4) {
                                                roomCode += key
                                                if (roomCode.length == 4) {
                                                    statusText = context.getString(R.string.status_connecting)
                                                    WearDirectSocketManager.connect(context, roomCode, serverUrl)
                                                }
                                            }
                                        }
                                    }
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            when (key) {
                                "⌫" -> Icon(
                                    imageVector = Icons.AutoMirrored.Filled.Backspace,
                                    contentDescription = stringResource(R.string.cd_backspace),
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp)
                                )
                                "✓" -> Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = stringResource(R.string.cd_confirm),
                                    tint = Color.White,
                                    modifier = Modifier.size(20.dp)
                                )
                                else -> Text(
                                    text = key,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.Black
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
