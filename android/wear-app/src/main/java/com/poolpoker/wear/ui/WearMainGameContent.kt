package com.poolpoker.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
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
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.Text
import com.poolpoker.shared.CardModel
import com.poolpoker.shared.WearAction
import com.poolpoker.shared.WearActionPayload
import com.poolpoker.shared.WearSyncRoomPayload
import com.poolpoker.wear.BuildConfig
import com.poolpoker.wear.R
import com.poolpoker.wear.ui.theme.PoolPokerColors

@Composable
fun WearMainGameContent(
    roomState: WearSyncRoomPayload,
    cards: List<CardModel>,
    pocketedBalls: List<Int>,
    onShowPocketModal: () -> Unit,
    onShowFoulModal: () -> Unit
) {
    val context = LocalContext.current

    if (cards.isEmpty()) {
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
                        text = stringResource(R.string.victory_title),
                        color = PoolPokerColors.PoolGold,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            item {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.victory_message),
                    fontSize = 13.sp,
                    color = Color.White,
                    textAlign = TextAlign.Center
                )
            }
        }
        return
    }

    ScalingLazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
        horizontalAlignment = Alignment.CenterHorizontally,
        contentPadding = PaddingValues(top = 36.dp, bottom = 36.dp, start = 10.dp, end = 10.dp)
    ) {
        // Room Header Item
        item {
            ListHeader {
                Text(
                    text = stringResource(R.string.room_code_header, roomState.roomCode),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // Display player turn order
        item {
            val turnOrderNames = if (roomState.turnOrder.isNotEmpty()) {
                roomState.turnOrder.mapNotNull { userId ->
                    roomState.players.find { it.userId == userId }?.name
                }
            } else {
                roomState.players.map { it.name }
            }
            val turnOrderText = if (turnOrderNames.isNotEmpty()) {
                turnOrderNames.joinToString(" → ")
            } else {
                roomState.myPlayerName ?: BuildConfig.WATCH_PLAYER_NAME.ifBlank { stringResource(R.string.watch_player_default) }
            }

            Box(
                modifier = Modifier
                    .padding(bottom = 6.dp)
                    .background(PoolPokerColors.CardBlack, shape = RoundedCornerShape(12.dp))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(R.string.turn_order_prefix, turnOrderText),
                    fontSize = 11.sp,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )
            }
        }

        // Single-Column Card List sorted by ball number ascending
        items(cards) { card ->
            val isBallPocketed = pocketedBalls.contains(card.ballNumber)
            WearSingleCardItem(
                card = card,
                isPocketed = isBallPocketed,
                onPocketClicked = {
                    sendActionToPhone(context, WearActionPayload(WearAction.POCKET_BALL, roomState.roomCode, cardId = card.id))
                }
            )
        }

        // Action Buttons (Vertically Stacked for Round Screen Bounds)
        item {
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = {
                    onShowPocketModal()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(38.dp)
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = stringResource(R.string.record_pocket), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        item {
            Button(
                onClick = {
                    onShowFoulModal()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(38.dp)
                    .padding(vertical = 1.dp)
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = stringResource(R.string.record_foul), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        item {
            Button(
                onClick = {
                    sendActionToPhone(context, WearActionPayload(WearAction.RETRACT_BALL, roomState.roomCode))
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(38.dp)
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = stringResource(R.string.retract_ball), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
