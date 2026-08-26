package com.poolpoker.wear.ui

import android.content.Context
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.SwipeToDismissBox
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.TimeText
import com.google.android.gms.wearable.Wearable
import com.poolpoker.shared.CardModel
import com.poolpoker.shared.DataLayerConstants
import com.poolpoker.shared.RoomStatus
import com.poolpoker.shared.SuitType
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

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            roomState == null -> {
                WearDirectConnectScreen()
            }
            roomState.status == RoomStatus.WAITING -> {
                WearWaitingScreen(roomState)
            }
            roomState.status == RoomStatus.ENDED || roomState.status == RoomStatus.FINISHED -> {
                WearSettlementScreen(roomState)
            }
            else -> {
                val cards = roomState.myCards.sortedBy { it.ballNumber }
                val pocketedBalls = roomState.pocketedBallNumbers

                val onDismissModals = {
                    showFoulModal = false
                    showPocketModal = false
                }

                Box(modifier = Modifier.fillMaxSize()) {
                    WearMainGameContent(
                        roomState = roomState,
                        cards = cards,
                        pocketedBalls = pocketedBalls,
                        onShowPocketModal = { showPocketModal = true },
                        onShowFoulModal = { showFoulModal = true }
                    )

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
        }

        // Overlay Wear OS Curved Time Text at the top edge
        TimeText()
    }
}

@Composable
fun WearWaitingScreen(roomState: WearSyncRoomPayload) {
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
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun WearSettlementScreen(roomState: WearSyncRoomPayload) {
    ScalingLazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = PaddingValues(top = 36.dp, bottom = 36.dp, start = 10.dp, end = 10.dp)
    ) {
        item {
            ListHeader {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = stringResource(R.string.game_over),
                        color = PoolPokerColors.PoolGold,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                    val winnerName = roomState.winnerName ?: roomState.players.find { it.isWinner }?.name
                    if (!winnerName.isNullOrBlank()) {
                        Text(
                            text = stringResource(R.string.winner_format, winnerName),
                            fontSize = 12.sp,
                            color = Color.White,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                }
            }
        }

        val pocketedSet = roomState.pocketedBallNumbers.toSet()

        items(roomState.players) { player ->
            val isWinner = player.isWinner || (roomState.winnerName == player.name)
            val scoreDelta = player.scoreDelta ?: roomState.lastRoundScores.find { it.userId == player.userId }?.delta

            // Player cards classification
            val scoredCards = player.pocketedCards
            val freeCards = player.cards.filter { pocketedSet.contains(it.ballNumber) }
            val remainingCards = player.cards.filter { !pocketedSet.contains(it.ballNumber) }

            val remainingRankCounts = remainingCards.groupingBy { it.rank }.eachCount()

            Card(
                onClick = {},
                enabled = false,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp)
                ) {
                    // Header row: Avatar + Name + Winner Badge + Delta + Total
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text("${player.avatar} ${player.name}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            if (isWinner) {
                                Text(
                                    text = stringResource(R.string.winner_badge),
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.Black,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(PoolPokerColors.PoolGold)
                                        .padding(horizontal = 4.dp, vertical = 1.dp)
                                )
                            }
                        }

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (scoreDelta != null) {
                                val isPositive = scoreDelta >= 0
                                Text(
                                    text = if (isPositive) stringResource(R.string.score_delta_plus, scoreDelta) else stringResource(R.string.score_delta_minus, scoreDelta),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isPositive) PoolPokerColors.ScoreDeltaPositiveText else PoolPokerColors.ScoreDeltaNegativeText,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(if (isPositive) PoolPokerColors.ScoreDeltaPositiveBg else PoolPokerColors.ScoreDeltaNegativeBg)
                                        .padding(horizontal = 4.dp, vertical = 1.dp)
                                )
                            }
                            Text(
                                text = stringResource(R.string.total_score_format, player.totalScore),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = PoolPokerColors.PoolGold
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    // Cards Breakdown
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        // 1. Scored Cards (已消除)
                        if (scoredCards.isNotEmpty()) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = stringResource(R.string.card_category_scored),
                                    fontSize = 9.sp,
                                    color = PoolPokerColors.CategoryScoredText,
                                    fontWeight = FontWeight.Bold
                                )
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    scoredCards.forEach { card ->
                                        SettlementCardBadge(
                                            card = card,
                                            bgColor = PoolPokerColors.CategoryScoredBg,
                                            borderColor = PoolPokerColors.CategoryScoredBorder,
                                            textColor = PoolPokerColors.CategoryScoredChipText
                                        )
                                    }
                                }
                            }
                        }

                        // 2. Free Cards (免打卡)
                        if (freeCards.isNotEmpty()) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = stringResource(R.string.card_category_free),
                                    fontSize = 9.sp,
                                    color = PoolPokerColors.CategoryFreeText,
                                    fontWeight = FontWeight.Bold
                                )
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    freeCards.forEach { card ->
                                        SettlementCardBadge(
                                            card = card,
                                            bgColor = PoolPokerColors.CategoryFreeBg,
                                            borderColor = PoolPokerColors.CategoryFreeBorder,
                                            textColor = PoolPokerColors.CategoryFreeChipText,
                                            textDecoration = TextDecoration.LineThrough
                                        )
                                    }
                                }
                            }
                        }

                        // 3. Remaining Cards (未消除)
                        if (remainingCards.isNotEmpty()) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = stringResource(R.string.card_category_remaining),
                                    fontSize = 9.sp,
                                    color = PoolPokerColors.CategoryRemainingText,
                                    fontWeight = FontWeight.Bold
                                )
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    remainingCards.forEach { card ->
                                        val base = if (card.suitType == SuitType.JOKER_BIG || card.suitType == SuitType.JOKER_SMALL) 1 else 2
                                        val count = remainingRankCounts[card.rank] ?: 1
                                        val penalty = base * count

                                        SettlementCardBadge(
                                            card = card,
                                            bgColor = PoolPokerColors.CategoryRemainingBg,
                                            borderColor = PoolPokerColors.CategoryRemainingBorder,
                                            textColor = PoolPokerColors.CategoryRemainingChipText,
                                            penalty = penalty
                                        )
                                    }
                                }
                            }
                        }

                        if (scoredCards.isEmpty() && freeCards.isEmpty() && remainingCards.isEmpty()) {
                            Text(
                                text = stringResource(R.string.card_count_format, player.cardCount),
                                fontSize = 10.sp,
                                color = Color.Gray
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SettlementCardBadge(
    card: CardModel,
    bgColor: Color,
    borderColor: Color,
    textColor: Color,
    textDecoration: TextDecoration = TextDecoration.None,
    penalty: Int? = null
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(bgColor)
            .border(0.5.dp, borderColor, RoundedCornerShape(4.dp))
            .padding(horizontal = 4.dp, vertical = 1.dp)
    ) {
        val suitColor = PoolPokerColors.getSuitColor(card.suitType)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = card.suit,
                fontSize = 10.sp,
                color = suitColor
            )
            Text(
                text = card.rank,
                fontSize = 10.sp,
                color = textColor,
                fontWeight = FontWeight.Bold,
                textDecoration = textDecoration
            )
            Text(
                text = "·${card.ballNumber}",
                fontSize = 8.sp,
                color = textColor.copy(alpha = 0.7f)
            )
            if (penalty != null) {
                Text(
                    text = " -$penalty",
                    fontSize = 8.sp,
                    color = PoolPokerColors.CategoryRemainingPenaltyText,
                    fontWeight = FontWeight.Bold
                )
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
