package com.poolpoker.wear.ui

import android.content.Context
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.Text
import com.google.android.gms.wearable.Wearable
import com.poolpoker.shared.CardModel
import com.poolpoker.shared.DataLayerConstants
import com.poolpoker.shared.RoomStatus
import com.poolpoker.shared.SuitType
import com.poolpoker.shared.WearAction
import com.poolpoker.shared.WearActionPayload
import com.poolpoker.shared.WearSyncRoomPayload
import com.poolpoker.wear.BuildConfig
import com.poolpoker.wear.WearDirectSocketManager

@Composable
fun WearGameScreen(roomState: WearSyncRoomPayload?) {
    val context = LocalContext.current

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
                        text = "🏠 房间: ${roomState.roomCode}",
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
                Text("等待房主开始游戏...", fontSize = 12.sp, color = Color(0xFFFFD700), textAlign = TextAlign.Center)
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
                        text = "🏆 游戏结束",
                        color = Color(0xFFFFD700),
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            item {
                Spacer(modifier = Modifier.height(8.dp))
                Text("胜者: ${roomState.winnerName ?: "未知"}", fontSize = 13.sp, color = Color.White, textAlign = TextAlign.Center)
            }
        }
        return
    }

    // Hand cards sorted in ascending order by ball number (smallest first)
    val cards = roomState.myCards.sortedBy { it.ballNumber }
    val pocketedBalls = roomState.pocketedBallNumbers
    val players = roomState.players

    // 1. 记录犯规 (Record Foul) Target Player Picker Sheet
    if (showFoulModal) {
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
                        text = "⚠️ 选择犯规玩家",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFFF5252),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            items(players) { player ->
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
                        showFoulModal = false
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
                        Text("${player.cardCount}张牌", fontSize = 10.sp, color = Color.LightGray)
                    }
                }
            }

            item {
                Spacer(modifier = Modifier.height(6.dp))
                Button(
                    onClick = { showFoulModal = false },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(36.dp)
                ) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("返回 / 取消", fontSize = 12.sp)
                    }
                }
            }
        }
        return
    }

    // 2. 记录进球 (Record Pocket) Player + Ball Picker Sheet
    if (showPocketModal) {
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
                        text = "🎱 记录进球",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFFFD700),
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
                    Text("选择进球玩家:", fontSize = 10.sp, color = Color.Gray)
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
                                        onClick = { selectedTargetUserId = p.userId },
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
                Text("点击入袋球号 (1-15):", fontSize = 10.sp, color = Color.Gray, modifier = Modifier.padding(top = 6.dp, bottom = 4.dp))
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
                                        showPocketModal = false
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
                    onClick = { showPocketModal = false },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(36.dp)
                ) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("返回 / 取消", fontSize = 12.sp)
                    }
                }
            }
        }
        return
    }

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
                        text = "🎉 胜利！",
                        color = Color(0xFFFFD700),
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            item {
                Spacer(modifier = Modifier.height(8.dp))
                Text("手牌已清空！胜局已定！", fontSize = 13.sp, color = Color.White, textAlign = TextAlign.Center)
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
                    text = "🏠 房号: ${roomState.roomCode}",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // Display current watch player's name
        item {
            Box(
                modifier = Modifier
                    .padding(bottom = 6.dp)
                    .background(Color(0xFF1E1E1E), shape = RoundedCornerShape(12.dp))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "👤 ${roomState.myPlayerName ?: "手表玩家"}",
                    fontSize = 11.sp,
                    color = Color.White,
                    fontWeight = FontWeight.Bold
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
                    triggerVibration(context)
                    sendActionToPhone(context, WearActionPayload(WearAction.POCKET_BALL, roomState.roomCode, cardId = card.id))
                }
            )
        }

        // Action Buttons (Vertically Stacked for Round Screen Bounds)
        item {
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = {
                    triggerVibration(context)
                    showPocketModal = true
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(38.dp)
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("🎱 记录进球", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        item {
            Button(
                onClick = {
                    triggerVibration(context)
                    showFoulModal = true
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(38.dp)
                    .padding(vertical = 1.dp)
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("⚠️ 记录犯规", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        item {
            Button(
                onClick = {
                    triggerVibration(context)
                    sendActionToPhone(context, WearActionPayload(WearAction.RETRACT_BALL, roomState.roomCode))
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(38.dp)
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("↩️ 撤回上一步", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
fun BilliardBallBadge(
    ballNumber: Int,
    modifier: Modifier = Modifier,
    size: Dp = 32.dp
) {
    val isStriped = ballNumber in 9..15
    val ballColor = getBallBackgroundColor(ballNumber)
    val innerCircleSize = size * 0.54f

    Box(
        modifier = modifier
            .requiredSize(size)
            .clip(CircleShape)
            .background(if (isStriped) Color.White else ballColor),
        contentAlignment = Alignment.Center
    ) {
        // Striped ball (9-15): middle horizontal colored band with fixed width = size
        if (isStriped) {
            Box(
                modifier = Modifier
                    .width(size)
                    .height(size * 0.48f)
                    .background(ballColor)
            )
        }

        // Inner White Disc with ball number in black
        Box(
            modifier = Modifier
                .requiredSize(innerCircleSize)
                .clip(CircleShape)
                .background(Color.White),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "$ballNumber",
                fontSize = if (ballNumber >= 10) (innerCircleSize.value * 0.50f).sp else (innerCircleSize.value * 0.60f).sp,
                fontWeight = FontWeight.Black,
                color = Color.Black,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
fun WearSingleCardItem(
    card: CardModel,
    isPocketed: Boolean,
    onPocketClicked: () -> Unit
) {
    val alphaValue = if (isPocketed) 0.4f else 1.0f

    Card(
        onClick = { if (!isPocketed) onPocketClicked() },
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .padding(vertical = 2.dp)
            .alpha(alphaValue)
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Billiard Ball Badge (Solid 1-8 / Striped 9-15) with strict 1:1 circular size
                BilliardBallBadge(
                    ballNumber = card.ballNumber,
                    size = 32.dp
                )

                Spacer(modifier = Modifier.width(10.dp))

                // Card Suit & Rank
                Text(
                    text = "${card.suit} ${card.rank}",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = getSuitTextColor(card.suitType)
                )
            }

            // Status Badge / Action Text
            if (isPocketed) {
                Text(
                    text = "已进球",
                    fontSize = 10.sp,
                    color = Color.Yellow,
                    fontWeight = FontWeight.SemiBold
                )
            } else {
                Text(
                    text = "点击消牌 ➔",
                    fontSize = 10.sp,
                    color = Color(0xFFFFD700),
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

fun getSuitTextColor(suitType: SuitType): Color {
    return when (suitType) {
        SuitType.HEART, SuitType.DIAMOND -> Color(0xFFFF5252)
        SuitType.SPADE, SuitType.CLUB -> Color.White
        SuitType.JOKER_SMALL -> Color(0xFFFFD700)
        SuitType.JOKER_BIG -> Color(0xFFFF4081)
    }
}

fun getBallBackgroundColor(ballNumber: Int): Color {
    return when (ballNumber) {
        1, 9 -> Color(0xFFFFB300)   // Yellow (1 solid, 9 stripe)
        2, 10 -> Color(0xFF1E88E5)  // Blue (2 solid, 10 stripe)
        3, 11 -> Color(0xFFE53935)  // Red (3 solid, 11 stripe)
        4, 12 -> Color(0xFF8E24AA)  // Purple (4 solid, 12 stripe)
        5, 13 -> Color(0xFFFB8C00)  // Orange (5 solid, 13 stripe)
        6, 14 -> Color(0xFF43A047)  // Green (6 solid, 14 stripe)
        7, 15 -> Color(0xFF8D6E63)  // Brown (7 solid, 15 stripe)
        8 -> Color(0xFF212121)      // Black (8 solid)
        else -> Color.DarkGray
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

@Composable
fun WearDirectConnectScreen() {
    var roomCode by remember { mutableStateOf("") }
    val serverUrl = BuildConfig.SERVER_URL
    var statusText by remember { mutableStateOf("等待 Companion 或直连...") }
    val context = LocalContext.current

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
                    text = "🎱 PoolPoker 直连",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFFFD700),
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
                            .background(Color(0xFF2A2A2A), shape = RoundedCornerShape(6.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = digit,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (digit != "_") Color(0xFFFFD700) else Color.Gray
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
                            isConfirm -> Color(0xFF43A047) // Green for confirm
                            isBackspace -> Color(0xFFE53935) // Red for backspace
                            else -> Color(0xFFFFD700) // Gold for numbers
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
                                                statusText = "正在连接服务器..."
                                                WearDirectSocketManager.connect(context, roomCode, serverUrl)
                                            }
                                        }
                                        else -> {
                                            if (roomCode.length < 4) {
                                                roomCode += key
                                                if (roomCode.length == 4) {
                                                    statusText = "正在连接服务器..."
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
                                    contentDescription = "退格",
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp)
                                )
                                "✓" -> Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = "确认",
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
