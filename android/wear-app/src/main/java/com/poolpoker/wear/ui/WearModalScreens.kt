package com.poolpoker.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.Text
import com.poolpoker.shared.WearAction
import com.poolpoker.shared.WearActionPayload
import com.poolpoker.shared.WearSyncRoomPayload
import com.poolpoker.wear.R
import com.poolpoker.wear.ui.theme.PoolPokerColors

@Composable
fun WearFoulModalScreen(
    roomState: WearSyncRoomPayload,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    ScalingLazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = PaddingValues(top = 36.dp, bottom = 36.dp, start = 12.dp, end = 12.dp)
    ) {
        item {
            ListHeader {
                Text(
                    text = stringResource(R.string.select_foul_player),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = PoolPokerColors.FoulRed,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        items(roomState.players) { player ->
            Card(
                onClick = {
                    triggerVibration(context)
                    sendActionToPhone(
                        context,
                        WearActionPayload(
                            action = WearAction.REFEREE_DRAW_PENALTY,
                            roomCode = roomState.roomCode,
                            targetUserId = player.userId
                        )
                    )
                    onDismiss()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 3.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("${player.avatar} ${player.name}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    Text(
                        text = stringResource(R.string.card_count_format, player.cardCount),
                        fontSize = 10.sp,
                        color = Color.LightGray
                    )
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(6.dp))
            Button(
                onClick = onDismiss,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(36.dp)
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = stringResource(R.string.btn_back_cancel), fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
fun WearPocketModalScreen(
    roomState: WearSyncRoomPayload,
    pocketedBalls: List<Int>,
    selectedTargetUserId: String?,
    onTargetUserIdSelected: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val players = roomState.players
    val currentTargetId = selectedTargetUserId ?: players.firstOrNull()?.userId ?: ""

    ScalingLazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = PaddingValues(top = 36.dp, bottom = 36.dp, start = 10.dp, end = 10.dp)
    ) {
        item {
            ListHeader {
                Text(
                    text = stringResource(R.string.record_pocket),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = PoolPokerColors.PoolGold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // Target Player Selection Header
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 2.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = stringResource(R.string.select_pocket_player),
                    fontSize = 10.sp,
                    color = Color.Gray
                )
                Spacer(modifier = Modifier.height(4.dp))
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    players.chunked(2).forEach { chunk ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally)
                        ) {
                            chunk.forEach { p ->
                                val isSelected = (p.userId == currentTargetId)
                                Button(
                                    onClick = { onTargetUserIdSelected(p.userId) },
                                    modifier = Modifier.height(28.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(
                                            text = if (isSelected) "✓ ${p.name}" else p.name,
                                            fontSize = 10.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        item {
            Text(
                text = stringResource(R.string.select_ball_number),
                fontSize = 10.sp,
                color = Color.Gray,
                modifier = Modifier.padding(top = 6.dp, bottom = 4.dp)
            )
        }

        // 1-15 Ball Badges (3 balls per row with realistic solid/striped billiard ball badges)
        val ballRows = (1..15).chunked(3)
        ballRows.forEach { row ->
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 3.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally)
                ) {
                    row.forEach { ballNum ->
                        val isAlreadyPocketed = pocketedBalls.contains(ballNum)
                        Box(
                            modifier = Modifier
                                .requiredSize(36.dp)
                                .alpha(if (isAlreadyPocketed) 0.3f else 1.0f)
                                .clickable(enabled = !isAlreadyPocketed) {
                                    triggerVibration(context)
                                    sendActionToPhone(
                                        context,
                                        WearActionPayload(
                                            action = WearAction.REFEREE_POCKET_BALL,
                                            roomCode = roomState.roomCode,
                                            targetUserId = currentTargetId,
                                            ballNumber = ballNum
                                        )
                                    )
                                    onDismiss()
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            BilliardBallBadge(ballNumber = ballNum, size = 36.dp)
                        }
                    }
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = onDismiss,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(36.dp)
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = stringResource(R.string.btn_back_cancel), fontSize = 12.sp)
                }
            }
        }
    }
}
