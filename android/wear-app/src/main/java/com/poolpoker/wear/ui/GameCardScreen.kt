package com.poolpoker.wear.ui

import android.content.Context
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.SwipeToDismissBox
import androidx.wear.compose.material3.Text
import com.google.android.gms.wearable.Wearable
import com.poolpoker.shared.DataLayerConstants
import com.poolpoker.shared.RoomStatus
import com.poolpoker.shared.WearAction
import com.poolpoker.shared.WearActionPayload
import com.poolpoker.shared.WearSyncRoomPayload
import com.poolpoker.wear.R
import com.poolpoker.wear.WearDirectSocketManager
import com.poolpoker.wear.ui.theme.PoolPokerColors

@Composable
fun WearGameScreen(roomState: WearSyncRoomPayload?) {
    var showPocketModal by remember { mutableStateOf(false) }
    var showFoulModal by remember { mutableStateOf(false) }
    var selectedTargetUserId by remember { mutableStateOf<String?>(null) }

    if (roomState == null) {
        WearDirectConnectScreen()
        return
    }

    if (roomState.status == RoomStatus.WAITING) {
        ScalingLazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black),
            horizontalAlignment = Alignment.CenterHorizontally,
            contentPadding = PaddingValues(top = 36.dp, bottom = 36.dp, start = 14.dp, end = 14.dp)
        ) {
            item {
                ListHeader {
                    Text(
                        text = stringResource(R.string.room_title, roomState.roomCode),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            item {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.waiting_for_host),
                    fontSize = 12.sp,
                    color = PoolPokerColors.PoolGold,
                    textAlign = TextAlign.Center
                )
            }
        }
        return
    }

    if (roomState.status == RoomStatus.ENDED || roomState.status == RoomStatus.FINISHED) {
        ScalingLazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black),
            horizontalAlignment = Alignment.CenterHorizontally,
            contentPadding = PaddingValues(top = 36.dp, bottom = 36.dp, start = 14.dp, end = 14.dp)
        ) {
            item {
                ListHeader {
                    Text(
                        text = stringResource(R.string.game_over),
                        color = PoolPokerColors.PoolGold,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            item {
                Spacer(modifier = Modifier.height(8.dp))
                val winnerName = roomState.winnerName ?: stringResource(R.string.unknown_winner)
                Text(
                    text = stringResource(R.string.winner_format, winnerName),
                    fontSize = 13.sp,
                    color = Color.White,
                    textAlign = TextAlign.Center
                )
            }
        }
        return
    }

    // Hand cards sorted in ascending order by ball number (smallest first)
    val cards = roomState.myCards.sortedBy { it.ballNumber }
    val pocketedBalls = roomState.pocketedBallNumbers

    val onDismissModals = {
        showFoulModal = false
        showPocketModal = false
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Base content layer: permanently mounted, preserving scroll state and layout
        WearMainGameContent(
            roomState = roomState,
            cards = cards,
            pocketedBalls = pocketedBalls,
            onShowPocketModal = { showPocketModal = true },
            onShowFoulModal = { showFoulModal = true }
        )

        // Modal overlay layer: handles swipe-to-dismiss above base content
        if (showFoulModal || showPocketModal) {
            BackHandler {
                onDismissModals()
            }

            SwipeToDismissBox(
                onDismissed = { onDismissModals() }
            ) { isBackground ->
                if (!isBackground) {
                    if (showFoulModal) {
                        WearFoulModalScreen(
                            roomState = roomState,
                            onDismiss = { showFoulModal = false }
                        )
                    } else if (showPocketModal) {
                        WearPocketModalScreen(
                            roomState = roomState,
                            pocketedBalls = pocketedBalls,
                            selectedTargetUserId = selectedTargetUserId,
                            onTargetUserIdSelected = { selectedTargetUserId = it },
                            onDismiss = { showPocketModal = false }
                        )
                    }
                }
            }
        }
    }
}

fun sendActionToPhone(context: Context, action: WearActionPayload) {
    if (WearDirectSocketManager.isConnected) {
        when (action.action) {
            WearAction.POCKET_BALL -> action.cardId?.let { WearDirectSocketManager.pocketBall(action.roomCode, it) }
            WearAction.DRAW_PENALTY -> WearDirectSocketManager.drawPenalty(action.roomCode)
            WearAction.RETRACT_BALL -> WearDirectSocketManager.retractBall(action.roomCode)
            WearAction.ACCIDENTAL_POCKET -> action.ballNumber?.let { WearDirectSocketManager.accidentalPocket(action.roomCode, it) }
            WearAction.REFEREE_POCKET_BALL -> {
                val targetUserId = action.targetUserId
                val ballNumber = action.ballNumber
                if (targetUserId != null && ballNumber != null) {
                    WearDirectSocketManager.refereePocketBall(action.roomCode, targetUserId, ballNumber)
                }
            }
            WearAction.REFEREE_DRAW_PENALTY -> {
                val targetUserId = action.targetUserId
                if (targetUserId != null) {
                    WearDirectSocketManager.refereeDrawPenalty(action.roomCode, targetUserId)
                }
            }
        }
        return
    }

    try {
        val jsonBytes = action.toJson().toByteArray(Charsets.UTF_8)
        Wearable.getNodeClient(context).connectedNodes.addOnSuccessListener { nodes ->
            for (node in nodes) {
                Wearable.getMessageClient(context).sendMessage(node.id, DataLayerConstants.PATH_WEAR_ACTION, jsonBytes)
                    .addOnSuccessListener {
                        Log.d("WearGameScreen", "Action sent to phone node: ${node.displayName}")
                    }
            }
        }
    } catch (e: Exception) {
        Log.e("WearGameScreen", "Failed to send action to phone", e)
    }
}

fun triggerVibration(context: Context) {
    try {
        val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        if (vibrator?.hasVibrator() == true) {
            vibrator.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
        }
    } catch (e: Exception) {
        // Ignore vibration errors
    }
}
